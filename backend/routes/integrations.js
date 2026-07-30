// Rotas /api/integrations/*
//
// GET  /status                              (auth) — estado de todos os providers
// POST /connect/:providerId                 (auth) — guarda API keys em secrets
// POST /disconnect/:providerId              (auth)
// POST /test/:providerId                    (auth) — ping / validação de keys
// POST /mercadopago/create-payment          (auth) — Pix/Preference do projeto
// POST /mercadopago/public-create-payment   (público) — checkout em /p/:id
// POST /stripe/create-payment               (auth)
// POST /paypal/create-payment               (auth) — order PayPal (BYO)
// POST /telegram/webhook                    (auth) — setWebhook stub
// POST /nfe/emit                            (auth) — emissão stub
// —— Canais premium (WhatsApp / Meta / YouTube / TikTok) — exigem requirePremium ——
// POST /whatsapp/qr                         — cria instância + QR WhatsApp
// GET  /whatsapp/connection                 — polling connectionState
// POST /whatsapp/disconnect                 — logout/delete instância
// POST /meta/connect                        — FB.login token → IG + Page
// POST /meta/disconnect                     — limpa Instagram/Facebook
// GET  /:platform/oauth/start               — YouTube / TikTok authorize URL
// GET  /:platform/oauth/callback            — OAuth callback (popup HTML)
// POST /:platform/oauth/disconnect          — limpa YouTube / TikTok

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
  createProjectPayPalPaymentStub,
  testIntegrationConnection,
  setupTelegramWebhookStub,
  emitNfeStub,
  resolvePublishedProjectOwner,
  markWhatsAppEvolutionConnected,
  clearWhatsAppEvolutionConnection,
  saveMetaSocialConnection,
  clearMetaSocialConnection,
  saveSocialOAuthConnection,
  clearSocialOAuthConnection,
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
import {
  buildAuthorizeUrl,
  exchangeCode,
  getPublicApiUrl,
  isOAuthPlatform,
  oauthConfigHints,
  oauthConfigured,
  popupResultHtml,
} from '../services/oauth/providers.js';
import { consumeOAuthState } from '../services/oauth/state.js';

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
    if (providerId === 'youtube' || providerId === 'tiktok') {
      return res.status(400).json({
        error: `Usa POST /api/integrations/${providerId}/oauth/disconnect.`,
        code: 'USE_OAUTH_DISCONNECT',
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
 * Checkout público em páginas publicadas (/p/:id + GoCreatePayments).
 * Usa MERCADOPAGO_ACCESS_TOKEN da plataforma — não exige o end-user colar API key.
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
      allowPlatformFallback: true,
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

/**
 * PayPal order (BYO Client ID/Secret) — autentica + cria order.
 */
router.post('/paypal/create-payment', requireAuth, async (req, res) => {
  try {
    const { projectId, amount, description, currency } = req.body || {};
    if (!projectId) {
      return res.status(400).json({ error: 'projectId é obrigatório.' });
    }
    const result = await createProjectPayPalPaymentStub({
      uid: req.user.uid,
      projectId,
      amount,
      description,
      currency,
    });
    res.json(result);
  } catch (err) {
    console.error('[integrations/paypal/create-payment]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha ao criar pagamento PayPal.',
      code: err.code,
      message: err.message,
    });
  }
});

/**
 * Teste / ping de credenciais BYO.
 */
router.post('/test/:providerId', requireAuth, async (req, res) => {
  try {
    const providerId = String(req.params.providerId || '').trim();
    const result = await testIntegrationConnection(req.user.uid, providerId);
    res.json(result);
  } catch (err) {
    console.error('[integrations/test]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha no teste.',
      code: err.code,
      message: err.message,
      ok: false,
    });
  }
});

/**
 * Telegram setWebhook stub.
 */
router.post('/telegram/webhook', requireAuth, async (req, res) => {
  try {
    const result = await setupTelegramWebhookStub(req.user.uid, {
      webhookUrl: req.body?.webhookUrl,
    });
    res.json(result);
  } catch (err) {
    console.error('[integrations/telegram/webhook]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha no webhook Telegram.',
      code: err.code,
      message: err.message,
    });
  }
});

/**
 * NF-e emissão stub (credenciais BYO).
 */
router.post('/nfe/emit', requireAuth, async (req, res) => {
  try {
    const result = await emitNfeStub(req.user.uid, {
      amount: req.body?.amount,
      description: req.body?.description,
    });
    res.json(result);
  } catch (err) {
    console.error('[integrations/nfe/emit]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha na emissão NF-e.',
      code: err.code,
      message: err.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// WhatsApp (premium / VPS) — proxy; keys nunca no frontend
// ═══════════════════════════════════════════════════════════════════════════

router.post('/whatsapp/qr', requireAuth, requirePremium, async (req, res) => {
  try {
    if (!isEvolutionConfigured()) {
      return res.status(503).json({
        error: 'WhatsApp não configurado no servidor.',
        code: 'WHATSAPP_NOT_CONFIGURED',
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

// ═══════════════════════════════════════════════════════════════════════════
// YouTube / TikTok — OAuth popup (premium)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/:platform/oauth/start', requireAuth, requirePremium, async (req, res) => {
  const { platform } = req.params;
  if (!isOAuthPlatform(platform)) {
    return res.status(400).json({ error: 'Plataforma inválida.' });
  }
  try {
    const { authUrl, state, redirectUri } = await buildAuthorizeUrl(platform, req.user.uid);
    return res.json({
      authUrl,
      state,
      redirectUri,
      platform,
      oauthConfigured: true,
    });
  } catch (err) {
    if (
      err.message === 'OAUTH_NOT_CONFIGURED' ||
      err.payload?.code === 'OAUTH_NOT_CONFIGURED'
    ) {
      return res.status(501).json(err.payload || { error: err.message, code: 'OAUTH_NOT_CONFIGURED' });
    }
    console.error(`[integrations/${platform}/oauth/start]`, err);
    return res.status(500).json({
      error: `Falha ao iniciar OAuth de ${platform}.`,
      details: err?.details || err.message,
    });
  }
});

/** Callback OAuth (sem Firebase Auth — state amarra o uid). */
router.get('/:platform/oauth/callback', async (req, res) => {
  const { platform } = req.params;
  if (!isOAuthPlatform(platform)) {
    return res.status(400).send(popupResultHtml({ ok: false, platform, error: 'Plataforma inválida.' }));
  }

  const { code, state, error, error_description: errorDesc } = req.query;
  if (error) {
    return res.status(400).send(
      popupResultHtml({
        ok: false,
        platform,
        error: String(errorDesc || error || 'Login cancelado.'),
      })
    );
  }
  if (!code || !state) {
    return res
      .status(400)
      .send(popupResultHtml({ ok: false, platform, error: 'Código OAuth ausente. Tente conectar de novo.' }));
  }

  try {
    const saved = await consumeOAuthState(String(state));
    if (!saved || saved.platform !== platform) {
      return res
        .status(400)
        .send(
          popupResultHtml({
            ok: false,
            platform,
            error: 'Sessão OAuth expirada. Feche e clique em Conectar de novo.',
          })
        );
    }

    const fields = await exchangeCode(
      platform,
      String(code),
      saved.redirectUri || `${getPublicApiUrl()}/api/integrations/${platform}/oauth/callback`,
      saved.codeVerifier
    );

    const savedConn = await saveSocialOAuthConnection(saved.uid, platform, fields);
    const displayName =
      savedConn.displayName ||
      fields.tiktokUsername ||
      fields.youtubeChannelTitle ||
      null;

    return res.send(popupResultHtml({ ok: true, platform, displayName }));
  } catch (err) {
    console.error(`[integrations/${platform}/oauth/callback]`, err);
    const msg =
      err?.payload?.error ||
      err?.details?.error_description ||
      err?.details?.error ||
      err.message ||
      'Falha ao trocar código OAuth.';
    return res.status(400).send(popupResultHtml({ ok: false, platform, error: String(msg) }));
  }
});

router.post('/:platform/oauth/disconnect', requireAuth, requirePremium, async (req, res) => {
  const { platform } = req.params;
  if (!isOAuthPlatform(platform)) {
    return res.status(400).json({ error: 'Plataforma inválida.' });
  }
  try {
    const result = await clearSocialOAuthConnection(req.user.uid, platform);
    res.json(result);
  } catch (err) {
    console.error(`[integrations/${platform}/oauth/disconnect]`, err);
    res.status(err.status || 500).json({
      error: err.message || `Falha ao desligar ${platform}.`,
      code: err.code,
    });
  }
});

router.get('/:platform/oauth/config', requireAuth, (req, res) => {
  const { platform } = req.params;
  if (!isOAuthPlatform(platform)) {
    return res.status(400).json({ error: 'Plataforma inválida.' });
  }
  const hint = oauthConfigHints(platform);
  res.json({
    platform,
    configured: oauthConfigured(platform),
    redirectUri: hint?.redirect || null,
    console: hint?.console || null,
  });
});

export default router;
