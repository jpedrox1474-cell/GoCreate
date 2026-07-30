// Rotas /api/integrations/*
//
// GET  /status                              (auth) — estado de todos os providers
// POST /connect/:providerId                 (auth) — guarda API keys em secrets
// POST /disconnect/:providerId              (auth)
// POST /mercadopago/create-payment          (auth) — Pix/Preference do projeto
// POST /mercadopago/public-create-payment   (público) — checkout em /p/:id
// POST /stripe/create-payment               (auth)

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getGitHubStatus } from '../services/github.js';
import {
  CONNECTABLE_PROVIDERS,
  saveIntegrationConnection,
  clearIntegrationConnection,
  getIntegrationsStatus,
  createProjectMercadoPagoPayment,
  createProjectStripePayment,
  resolvePublishedProjectOwner,
} from '../services/integrations.js';

const router = Router();

router.get('/status', requireAuth, async (req, res) => {
  try {
    const githubStatus = await getGitHubStatus(req.user.uid);
    const status = await getIntegrationsStatus(req.user.uid, { githubStatus });
    res.json(status);
  } catch (err) {
    console.error('[integrations/status]', err);
    res.status(500).json({ error: err.message || 'Erro ao ler integrações.' });
  }
});

router.post('/connect/:providerId', requireAuth, async (req, res) => {
  try {
    const providerId = String(req.params.providerId || '').trim();
    if (!CONNECTABLE_PROVIDERS.has(providerId)) {
      return res.status(400).json({
        error: 'Provider não suportado para ligação por API key.',
        code: 'PROVIDER_NOT_CONNECTABLE',
        message:
          providerId === 'github'
            ? 'Usa o fluxo OAuth do GitHub (Exportar / Integrações → GitHub).'
            : `“${providerId}” ainda não aceita ligação directa.`,
      });
    }
    const credentials = req.body?.credentials || req.body || {};
    const result = await saveIntegrationConnection(req.user.uid, providerId, credentials);
    res.json(result);
  } catch (err) {
    console.error('[integrations/connect]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha ao ligar integração.',
      code: err.code,
      message: err.message,
    });
  }
});

router.post('/disconnect/:providerId', requireAuth, async (req, res) => {
  try {
    const providerId = String(req.params.providerId || '').trim();
    if (providerId === 'github') {
      return res.status(400).json({
        error: 'Usa POST /api/github/disconnect para o GitHub.',
        code: 'USE_GITHUB_DISCONNECT',
      });
    }
    if (!CONNECTABLE_PROVIDERS.has(providerId)) {
      return res.status(400).json({
        error: 'Provider de plataforma não pode ser desligado.',
        code: 'PLATFORM_PROVIDER',
      });
    }
    const result = await clearIntegrationConnection(req.user.uid, providerId);
    res.json(result);
  } catch (err) {
    console.error('[integrations/disconnect]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao desligar.' });
  }
});

/**
 * Pagamento autenticado (owner a testar no editor).
 * Body: { projectId, amount, description?, payerEmail?, method?: 'pix'|'preference' }
 */
router.post('/mercadopago/create-payment', requireAuth, async (req, res) => {
  try {
    const { projectId, amount, description, payerEmail, method } = req.body || {};
    if (!projectId) {
      return res.status(400).json({ error: 'projectId é obrigatório.' });
    }
    const result = await createProjectMercadoPagoPayment({
      uid: req.user.uid,
      projectId,
      amount,
      description,
      payerEmail: payerEmail || req.user.email,
      method: method === 'preference' ? 'preference' : 'pix',
      allowPlatformFallback: true,
    });
    res.json(result);
  } catch (err) {
    console.error('[integrations/mp/create-payment]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha ao criar pagamento Mercado Pago.',
      code: err.code,
      message: err.message,
    });
  }
});

/**
 * Checkout público em páginas publicadas — exige MP do owner (sem fallback plataforma).
 */
router.post('/mercadopago/public-create-payment', async (req, res) => {
  try {
    const { projectId, amount, description, payerEmail, method } = req.body || {};
    if (!projectId) {
      return res.status(400).json({ error: 'projectId é obrigatório.' });
    }
    const ownerId = await resolvePublishedProjectOwner(projectId);
    if (!ownerId) {
      return res.status(404).json({
        error: 'Projeto não encontrado ou não publicado.',
        code: 'PROJECT_NOT_FOUND',
      });
    }
    const result = await createProjectMercadoPagoPayment({
      uid: ownerId,
      projectId,
      amount,
      description,
      payerEmail,
      method: method === 'preference' ? 'preference' : 'pix',
      allowPlatformFallback: false,
    });
    res.json(result);
  } catch (err) {
    console.error('[integrations/mp/public-create-payment]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha ao criar pagamento.',
      code: err.code,
      message: err.message,
    });
  }
});

router.post('/stripe/create-payment', requireAuth, async (req, res) => {
  try {
    const { projectId, amount, description, currency, mode } = req.body || {};
    if (!projectId) {
      return res.status(400).json({ error: 'projectId é obrigatório.' });
    }
    const result = await createProjectStripePayment({
      uid: req.user.uid,
      projectId,
      amount,
      description,
      currency,
      mode: mode === 'checkout' ? 'checkout' : 'payment_intent',
    });
    res.json(result);
  } catch (err) {
    console.error('[integrations/stripe/create-payment]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha ao criar pagamento Stripe.',
      code: err.code,
      message: err.message,
    });
  }
});

export default router;
