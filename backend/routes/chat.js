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
import { GOCREATE_SYSTEM_PROMPT, buildIntegrationsPromptAddon } from '../prompts/systemPrompt.js';
import { streamGeminiChat, getGeminiApiKey } from '../services/gemini.js';
import { listConnectedProviderIds } from '../services/integrations.js';

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
    let integrationsAddon = '';
    try {
      const connected = await listConnectedProviderIds(req.user.uid);
      integrationsAddon = buildIntegrationsPromptAddon(connected);
    } catch (intErr) {
      console.warn('[api/chat] integrations addon:', intErr?.message);
    }

    const result = await streamGeminiChat({
      systemPrompt: GOCREATE_SYSTEM_PROMPT + integrationsAddon,
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
    try {
      await debitCredit(req.user.uid, 1);
    } catch (debitErr) {
      console.error('[api/chat] Falha ao debitar crédito:', debitErr);
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
        creditsRemaining: Math.max(0, (req.userCredits || 1) - 1),
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
