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
  const { projectId, messages, attachmentUrl, attachmentResourceType, attachmentMimeType } =
    req.body;

  if (!projectId || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'projectId e messages (array não vazio) são obrigatórios.' });
  }

  if (!getGeminiApiKey()) {
    return res.status(503).json({
      error: 'GEMINI_API_KEY não configurada no servidor.',
    });
  }

  // ACL: viewers cannot mutate via AI
  try {
    const { resolveProjectRole, canEditProject } = await import('../services/collaborators.js');
    const snap = await db.collection('projects').doc(projectId).get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Projeto não encontrado.' });
    }
    const role = resolveProjectRole(snap.data() || {}, req.user.email, req.user.uid);
    if (!canEditProject(role)) {
      return res.status(403).json({
        error: 'Sem permissão para gerar neste projeto (modo visualizador).',
        code: 'PROJECT_READ_ONLY',
      });
    }
  } catch (aclErr) {
    console.error('[chat] ACL', aclErr);
    return res.status(aclErr.status || 500).json({ error: aclErr.message || 'Falha de permissão.' });
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

    // Estado Backend + Auth deste projeto
    try {
      const projectSnap = await db.collection('projects').doc(projectId).get();
      if (projectSnap.exists) {
        const pdata = projectSnap.data() || {};
        const be = Boolean(pdata.backendEnabled);
        const { normalizeProjectAuth, publicProjectAuthPayload } = await import(
          '../services/projectAuth.js'
        );
        const auth = normalizeProjectAuth(pdata.auth);
        const authPublic = publicProjectAuthPayload(pdata);

        systemPrompt += `

## Estado deste projeto GoCreate
- backendEnabled: ${be ? 'true' : 'false'}
- auth.googleEnabled: ${auth.googleEnabled ? 'true' : 'false'}
- auth.googleMode: ${auth.googleMode}
- googleAuthEnabled (backend+flag): ${authPublic.googleAuthEnabled ? 'true' : 'false'}
${
  be
    ? `- Backend JÁ está ativo. Qualquer lista/CRUD/formulário DEVE usar window.GoCreateData (create/list/update/remove). NÃO uses useState/localStorage como base de dados.`
    : `- Backend ainda desligado. Para persistência real, o utilizador deve ativar Funções de Backend. Podes gerar código com GoCreateData (mostra CTA se BACKEND_REQUIRED); useState só como rascunho UI se a API falhar com BACKEND_REQUIRED.`
}
${
  authPublic.googleAuthEnabled
    ? `- Google Auth ATIVO: mostra botão "Continuar com Google" via window.GoCreateAuth; respeita window.__GOCREATE_AUTH__.googleAuthEnabled.`
    : `- Google Auth OFF ou Backend off: NÃO mostres Login/Register Google como "ligado". Se o user pedir login Google, indica Configurações → Authentication (ou usa o motor de orquestração).`
}
`;
      }
    } catch (beErr) {
      console.warn('[api/chat] project state hint:', beErr?.message);
    }

    // Intent → orchestrate JSON (auth / entities) before free-form codegen
    try {
      const { detectOrchestrateIntent, applyOrchestrate } = await import(
        '../services/orchestrate.js'
      );
      const intent = detectOrchestrateIntent(lastUserText);
      if (intent) {
        const projectSnap = await db.collection('projects').doc(projectId).get();
        if (projectSnap.exists) {
          const orchestrateResult = await applyOrchestrate(
            projectId,
            projectSnap.data() || {},
            intent
          );
          if (orchestrateResult?.wiringPrompt) {
            systemPrompt += `

## Auth wiring (pedido do utilizador / orquestração)
${orchestrateResult.wiringPrompt}
`;
          }
          if (orchestrateResult?.ai_response_to_user) {
            const isSchema =
              (orchestrateResult.applied || []).includes('deploy_schema') ||
              (orchestrateResult.applied || []).includes('entities');
            systemPrompt += `

## Resultado da orquestração (já aplicado no backend — NÃO inventes API keys nem schemas Firestore)
- ${orchestrateResult.ai_response_to_user}
- applied: ${(orchestrateResult.applied || []).join(', ')}
${
  isSchema
    ? `- Schema persistido em projects/{projectId}/entities (isolado por tenant). Use window.GoCreateData para CRUD.
- Responde em UMA linha curta confirmando o módulo criado; gera UI de listagem/formulário se o user pediu app.`
    : `- Responde em UMA linha curta confirmando; se houver wiring de UI auth, gera o artefacto React com o botão Google.`
}
`;
          }
        }
      }
    } catch (orchErr) {
      console.warn('[api/chat] orchestrate intent:', orchErr?.message);
    }

    // Explicit wiring flag from "Add to pages" button
    if (req.body?.wiringPrompt && typeof req.body.wiringPrompt === 'string') {
      systemPrompt += `

## Auth wiring (pedido do utilizador)
${String(req.body.wiringPrompt).slice(0, 2000)}
`;
    }

    const result = await streamGeminiChat({
      systemPrompt,
      messages,
      attachmentUrl,
      attachmentResourceType: attachmentResourceType || null,
      attachmentMimeType: attachmentMimeType || null,
      // Vídeos: download Cloudinary + Files API pode demorar
      timeoutMs: attachmentUrl ? 170000 : 120000,
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
