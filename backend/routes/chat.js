// Rota POST /api/chat
//
// Recebe o histórico de mensagens de um projeto, injeta o System Prompt do
// GoCreate, chama a API gratuita do Google Gemini (streaming SSE quando
// disponível) e empurra pedaços de texto pro frontend via Server-Sent Events.
//
// O frontend é responsável por: (1) exibir o texto conforme chega e
// (2) rodar o parser de <gocreate_artifact> quando o stream terminar.
//
// Padrão de chamada Gemini copiado/adaptado de Promifer (backend/src/services/aiService.js)
// e BarberPro (firebase-functions/geminiModel.js).

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { creditCheck, debitCredit } from '../middleware/credits.js';
import { db } from '../config/firebaseAdmin.js';
import { buildDynamicSystemPrompt } from '../prompts/buildDynamicSystemPrompt.js';
import { streamGeminiChat, getGeminiApiKey } from '../services/gemini.js';
import { loadUserIntegrationsForPrompt, getIntegrationsStatus } from '../services/integrations.js';
import { parseEntitiesFromAiText, upsertProjectEntities } from '../services/entities.js';
import {
  detectSuggestedIntegrations,
  filterUnconnectedSuggestions,
} from '../services/suggestIntegrations.js';

const router = Router();

// requireAuth → creditCheck (403 se credits <= 0) → Gemini → debit 1 crédito
router.post('/', requireAuth, creditCheck, async (req, res) => {
  const { projectId, messages, attachmentUrl } = req.body;

  if (!projectId || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'projectId e messages (array não vazio) são obrigatórios.' });
  }

  if (!getGeminiApiKey()) {
    return res.status(503).json({
      error: 'GEMINI_API_KEY não configurada no servidor.',
    });
  }

  // Configura SSE (mesmo contrato que o frontend espera)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let fullResponse = '';

  try {
    const lastUserText = String(messages[messages.length - 1]?.text || '');
    let suggestedIntegrations = detectSuggestedIntegrations(lastUserText);
    try {
      const status = await getIntegrationsStatus(req.user.uid);
      suggestedIntegrations = filterUnconnectedSuggestions(
        suggestedIntegrations,
        status?.providers || {}
      );
    } catch {
      /* keep raw suggestions */
    }
    if (suggestedIntegrations.length) {
      res.write(
        `data: ${JSON.stringify({
          type: 'suggestedIntegrations',
          ids: suggestedIntegrations,
        })}\n\n`
      );
    }

    let systemPrompt = buildDynamicSystemPrompt({});
    try {
      // Só integrações do uid autenticado — nunca de outro user.
      const userIntegrations = await loadUserIntegrationsForPrompt(req.user.uid);
      const connectedKeys = Object.keys(userIntegrations).filter(
        (k) => userIntegrations[k]?.connected
      );
      // Log só nomes (sem tokens)
      if (connectedKeys.length) {
        console.info('[api/chat] integrations for prompt:', connectedKeys.join(','));
      }
      systemPrompt = buildDynamicSystemPrompt(userIntegrations);
    } catch (intErr) {
      console.warn('[api/chat] integrations addon:', intErr?.message);
    }

    // Estado Backend Functions deste projeto — força GoCreateData quando ativo
    try {
      const projectSnap = await db.collection('projects').doc(projectId).get();
      if (projectSnap.exists) {
        const be = Boolean(projectSnap.data()?.backendEnabled);
        systemPrompt += `

## Estado deste projeto GoCreate
- backendEnabled: ${be ? 'true' : 'false'}
${
  be
    ? `- Backend JÁ está ativo. Qualquer lista/CRUD/formulário DEVE usar window.GoCreateData (create/list/update/remove). NÃO uses useState/localStorage como base de dados.`
    : `- Backend ainda desligado. Para persistência real, o utilizador deve ativar Funções de Backend. Podes gerar código com GoCreateData (mostra CTA se BACKEND_REQUIRED); useState só como rascunho UI se a API falhar com BACKEND_REQUIRED.`
}
`;
      }
    } catch (beErr) {
      console.warn('[api/chat] backendEnabled hint:', beErr?.message);
    }

    const result = await streamGeminiChat({
      systemPrompt,
      messages,
      attachmentUrl,
      onChunk: (chunk) => {
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
      },
    });

    if (!fullResponse && result?.text) {
      fullResponse = result.text;
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: result.text })}\n\n`);
    }

    // Debita 1 crédito imediatamente após geração bem-sucedida (Admin SDK)
    // Owner / enterprise_master: debitCredit é no-op
    let creditsRemaining = req.userUnlimited ? null : Math.max(0, (req.userCredits || 1) - 1);
    try {
      if (!req.userUnlimited) {
        await debitCredit(req.user.uid, 1);
      }
    } catch (debitErr) {
      console.error('[api/chat] Falha ao debitar crédito:', debitErr);
    }

    // Persist entity schema if AI emitted <gocreate_entities>
    try {
      const entities = parseEntitiesFromAiText(fullResponse);
      if (entities.length) {
        await upsertProjectEntities(projectId, entities);
      }
    } catch (entErr) {
      console.warn('[api/chat] entities upsert:', entErr?.message);
    }

    // Salva o turno completo (pergunta do usuário + resposta da IA) no Firestore
    try {
      const lastUserMessage = messages[messages.length - 1];
      const batch = db.batch();
      const messagesRef = db
        .collection('projects')
        .doc(projectId)
        .collection('messages');

      const userMsgRef = messagesRef.doc();
      batch.set(userMsgRef, {
        role: 'user',
        text: lastUserMessage.text,
        attachmentUrl: attachmentUrl || null,
        uid: req.user.uid,
        createdAt: new Date(),
      });

      const aiMsgRef = messagesRef.doc();
      batch.set(aiMsgRef, {
        role: 'ai',
        text: fullResponse,
        uid: req.user.uid,
        model: result?.model || null,
        createdAt: new Date(),
      });

      await batch.commit();
    } catch (persistErr) {
      console.error('[api/chat] Falha ao salvar histórico no Firestore:', persistErr);
    }

    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        model: result?.model || null,
        creditsRemaining,
        unlimited: Boolean(req.userUnlimited),
      })}\n\n`
    );
    res.end();
  } catch (err) {
    console.error('[api/chat] Erro geral:', err);
    const message = err?.message || 'Erro interno.';
    if (!res.headersSent) {
      res.status(err.status || 500).json({ error: message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
      res.end();
    }
  }
});

export default router;
