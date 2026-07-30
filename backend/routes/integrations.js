// Rotas /api/integrations/*
//
// GET  /status                              (auth) — estado de todos os providers
// POST /connect/:providerId                 (auth) — guarda API keys em secrets
// POST /disconnect/:providerId              (auth)
// POST /mercadopago/create-payment          (auth) — Pix/Preference do projeto
// POST /mercadopago/public-create-payment   (público) — checkout em /p/:id
// POST /stripe/create-payment               (auth)
// —— Canais premium (Evolution / Meta) — exigem requirePremium ——
// POST /whatsapp/qr                         — cria instância + QR Evolution
// GET  /whatsapp/connection                 — polling connectionState
// POST /whatsapp/disconnect                 — logout/delete instância
// POST /meta/connect                        — FB.login token → IG + Page
// POST /meta/disconnect                     — limpa Instagram/Facebook

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePremium } from '../middleware/premium.js';
import { getGitHubStatus } from '../services/github.js';
import {
  CONNECTABLE_PROVIDERS,
  saveIntegrationConnection,
  clearIntegrationConnection,
  getIntegrationsStatus,
  createProjectMercadoPagoPayment,
  createProjectStripePayment,
  resolvePublishedProjectOwner,
  markWhatsAppEvolutionConnected,
  clearWhatsAppEvolutionConnection,
  saveMetaSocialConnection,
  clearMetaSocialConnection,
} from '../services/integrations.js';
import {
  provisionUserWhatsAppQr,
  checkUserWhatsAppConnection,
  disconnectUserWhatsApp,
  buildInstanceNameForUser,
  isEvolutionConfigured,
} from '../services/evolution.js';
import {
  exchangeMetaToken,
  fetchPagesWithInstagram,
  isMetaConfigured,
  getMetaConfig,
} from '../services/meta.js';

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
    if (providerId === 'whatsapp_evolution') {
      return res.status(400).json({
        error: 'Usa POST /api/integrations/whatsapp/disconnect.',
        code: 'USE_WHATSAPP_DISCONNECT',
      });
    }
    if (providerId === 'instagram' || providerId === 'facebook' || providerId === 'meta') {
      return res.status(400).json({
        error: 'Usa POST /api/integrations/meta/disconnect.',
        code: 'USE_META_DISCONNECT',
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

// ═══════════════════════════════════════════════════════════════════════════
// WhatsApp Evolution (premium / VPS) — proxy; keys nunca no frontend
// ═══════════════════════════════════════════════════════════════════════════

router.post('/whatsapp/qr', requireAuth, requirePremium, async (req, res) => {
  try {
    if (!isEvolutionConfigured()) {
      return res.status(503).json({
        error: 'Evolution API não configurada (EVOLUTION_API_URL / EVOLUTION_API_KEY).',
        code: 'EVOLUTION_NOT_CONFIGURED',
      });
    }
    const result = await provisionUserWhatsAppQr(req.user.uid);
    res.json(result);
  } catch (err) {
    console.error('[integrations/whatsapp/qr]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha ao gerar QR WhatsApp.',
      code: err.code,
      message: err.message,
    });
  }
});

router.get('/whatsapp/connection', requireAuth, requirePremium, async (req, res) => {
  try {
    const instanceName =
      String(req.query.instanceName || '').trim() || buildInstanceNameForUser(req.user.uid);
    const result = await checkUserWhatsAppConnection(req.user.uid, instanceName);
    if (result.connected) {
      await markWhatsAppEvolutionConnected(req.user.uid, { instanceName: result.instanceName });
    }
    res.json(result);
  } catch (err) {
    console.error('[integrations/whatsapp/connection]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha ao verificar conexão WhatsApp.',
      code: err.code,
    });
  }
});

router.post('/whatsapp/disconnect', requireAuth, requirePremium, async (req, res) => {
  try {
    const instanceName =
      String(req.body?.instanceName || '').trim() || buildInstanceNameForUser(req.user.uid);
    const evo = await disconnectUserWhatsApp(req.user.uid, instanceName);
    await clearWhatsAppEvolutionConnection(req.user.uid);
    res.json({ ok: true, evolution: evo });
  } catch (err) {
    console.error('[integrations/whatsapp/disconnect]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha ao desligar WhatsApp.',
      code: err.code,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Meta — Instagram + Facebook (premium; FB.login no cliente → token aqui)
// ═══════════════════════════════════════════════════════════════════════════

router.post('/meta/connect', requireAuth, requirePremium, async (req, res) => {
  try {
    if (!isMetaConfigured()) {
      return res.status(503).json({
        error: 'META_APP_ID / META_APP_SECRET não configurados.',
        code: 'META_NOT_CONFIGURED',
      });
    }
    const accessToken = String(req.body?.accessToken || '').trim();
    if (!accessToken) {
      return res.status(400).json({ error: 'accessToken é obrigatório.' });
    }

    const longLived = await exchangeMetaToken(accessToken);
    if (!longLived) {
      return res.status(400).json({ error: 'Token Meta inválido.' });
    }

    const { pages, debug } = await fetchPagesWithInstagram(longLived);
    const pageWithIg = pages.find((p) => p.instagram_business_account?.id && p.access_token);
    if (!pageWithIg) {
      const hasIgScope = (debug?.scopes || []).some((s) =>
        /instagram_basic|instagram_manage|instagram_content/i.test(s)
      );
      return res.status(400).json({
        error: hasIgScope
          ? 'Não encontramos Página com Instagram Business. Vincule a conta Professional a uma Página do Facebook e tente de novo.'
          : 'Conexão incompleta: o token não tem permissão para ler o Instagram da Página (precisa instagram_basic).',
        details: {
          pageCount: pages.length,
          scopes: (debug?.scopes || []).join(',') || null,
        },
      });
    }

    const ig = pageWithIg.instagram_business_account;
    const result = await saveMetaSocialConnection(req.user.uid, {
      pageId: pageWithIg.id,
      pageName: pageWithIg.name,
      pageAccessToken: pageWithIg.access_token,
      instagramAccountId: ig.id,
      instagramUsername: ig.username || null,
      userAccessToken: longLived,
    });
    res.json(result);
  } catch (err) {
    console.error('[integrations/meta/connect]', err);
    res.status(err.status || 400).json({
      error: err.message || 'Não foi possível concluir a conexão Meta.',
      code: err.code,
      details: err.details,
    });
  }
});

router.post('/meta/disconnect', requireAuth, requirePremium, async (req, res) => {
  try {
    const result = await clearMetaSocialConnection(req.user.uid);
    res.json(result);
  } catch (err) {
    console.error('[integrations/meta/disconnect]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao desligar Meta.' });
  }
});

router.get('/meta/config', requireAuth, (_req, res) => {
  const cfg = getMetaConfig();
  res.json({
    configured: cfg.configured,
    appId: cfg.configured ? cfg.appId : null,
    graphVersion: cfg.graphVersion,
  });
});

export default router;
