/**
 * Serviço de integrações BYO (bring your own keys).
 *
 * Secrets: users/{uid}/secrets/integrations_{providerId}  (Admin only)
 * Meta pública: users/{uid}.integrations.{providerId}     (connected, labels)
 *
 * Mercado Pago / Stripe usam o token do utilizador para pagamentos de apps gerados
 * (não confundir com billing da plataforma em /api/billing).
 */

import admin, { db } from '../config/firebaseAdmin.js';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import Stripe from 'stripe';
import {
  isMercadoPagoConfigured,
  getAccessTokenForAppPayments,
  getTestAccessToken,
  isTestAccessToken,
  isLiveCredentialsUnauthorizedError,
  mapMercadoPagoPaymentError,
} from './mercadopago.js';
import { isStripeConfigured } from './stripe.js';
import { isEvolutionConfigured, buildInstanceNameForUser } from './evolution.js';
import { oauthConfigured } from './oauth/providers.js';
import { isMetaConfigured } from './meta.js';

function isPayPalPlatformConfigured() {
  return Boolean(
    String(process.env.PAYPAL_CLIENT_ID || '').trim() &&
      String(process.env.PAYPAL_CLIENT_SECRET || '').trim()
  );
}
/** Providers que aceitam connect via API key no backend (BYO — Free ok).
 * Mercado Pago / Stripe / PayPal NÃO estão aqui: OAuth ou token da plataforma.
 */
export const CONNECTABLE_PROVIDERS = new Set([
  'pagseguro',
  'clerk',
  'auth0',
  'supabase',
  'neon',
  'planetscale',
  'resend',
  'sendgrid',
  'mailchimp',
  'whatsapp',
  'twilio',
  'telegram',
  'ga4',
  'mixpanel',
  'posthog',
  's3',
  'shopify',
  'google_maps',
  'nfe',
]);

/** Campos obrigatórios por provider (além da limpeza genérica). */
const REQUIRED_FIELDS = {
  pagseguro: ['token'],
  clerk: ['publishableKey', 'secretKey'],
  auth0: ['domain', 'clientId', 'clientSecret'],
  supabase: ['url', 'anonKey'],
  neon: ['connectionString'],
  planetscale: ['connectionString'],
  resend: ['apiKey'],
  sendgrid: ['apiKey'],
  mailchimp: ['apiKey'],
  whatsapp: ['defaultPhone'],
  twilio: ['accountSid', 'authToken', 'fromNumber'],
  telegram: ['botToken'],
  ga4: ['measurementId'],
  mixpanel: ['projectToken'],
  posthog: ['apiKey'],
  s3: ['accessKeyId', 'secretAccessKey', 'bucket'],
  shopify: ['shop', 'accessToken'],
  google_maps: ['apiKey'],
  nfe: ['apiToken'],
};

/** Canais premium (WhatsApp QR / Meta / YouTube / TikTok) — estado em users.integrations. */
export const SOCIAL_CHANNEL_PROVIDERS = new Set([
  'whatsapp_evolution',
  'instagram',
  'facebook',
  'youtube',
  'tiktok',
]);

/** Providers “sempre ligados” via plataforma GoCreate (quando env configurado). */
export const PLATFORM_PROVIDERS = new Set([
  'firebase_auth',
  'google_oauth',
  'firebase_firestore',
  'firebase_storage',
  'cloudinary',
  'viacep',
  'pix',
  'mercadopago',
]);

function secretsRef(uid, providerId) {
  return db.collection('users').doc(uid).collection('secrets').doc(`integrations_${providerId}`);
}

function userRef(uid) {
  return db.collection('users').doc(uid);
}

function sanitizePublicMeta(providerId, credentials = {}) {
  const meta = {
    connected: true,
    connectedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (providerId === 'mercadopago') {
    meta.hasAccessToken = Boolean(credentials.accessToken);
    meta.hasPublicKey = Boolean(credentials.publicKey);
    meta.label = credentials.publicKey ? 'MP + Public Key' : 'Access Token';
  } else if (providerId === 'stripe') {
    meta.hasSecretKey = Boolean(credentials.secretKey);
    meta.hasPublishableKey = Boolean(credentials.publishableKey);
    const sk = String(credentials.secretKey || '');
    meta.mode = sk.startsWith('sk_live') ? 'live' : 'test';
  } else if (providerId === 'paypal') {
    meta.hasClientId = Boolean(credentials.clientId);
    meta.hasClientSecret = Boolean(credentials.clientSecret);
    const mode = String(credentials.mode || 'sandbox').toLowerCase();
    meta.mode = mode === 'live' ? 'live' : 'sandbox';
    meta.label = `PayPal (${meta.mode})`;
  } else if (providerId === 'pagseguro') {
    meta.hasToken = Boolean(credentials.token);
    meta.email = credentials.email || null;
    meta.label = credentials.email ? `PagBank (${credentials.email})` : 'PagBank token';
  } else if (providerId === 'clerk') {
    meta.hasPublishableKey = Boolean(credentials.publishableKey);
    meta.hasSecretKey = Boolean(credentials.secretKey);
    meta.domain = credentials.domain || null;
  } else if (providerId === 'auth0') {
    meta.domain = credentials.domain || null;
    meta.hasClientId = Boolean(credentials.clientId);
    meta.hasClientSecret = Boolean(credentials.clientSecret);
  } else if (providerId === 'whatsapp') {
    meta.defaultPhone = credentials.defaultPhone || null;
    meta.hasCloudApi = Boolean(credentials.accessToken && credentials.phoneNumberId);
  } else if (providerId === 'ga4') {
    meta.measurementId = credentials.measurementId || null;
  } else if (providerId === 'supabase') {
    meta.url = credentials.url || null;
  } else if (providerId === 'neon' || providerId === 'planetscale') {
    meta.hasConnectionString = Boolean(credentials.connectionString);
  } else if (providerId === 'resend' || providerId === 'sendgrid') {
    meta.fromEmail = credentials.fromEmail || null;
    meta.hasApiKey = Boolean(credentials.apiKey);
  } else if (providerId === 'mailchimp') {
    meta.hasApiKey = Boolean(credentials.apiKey);
    meta.serverPrefix = credentials.serverPrefix || inferMailchimpPrefix(credentials.apiKey);
  } else if (providerId === 'posthog') {
    meta.host = credentials.host || null;
    meta.hasApiKey = Boolean(credentials.apiKey);
  } else if (providerId === 'mixpanel') {
    meta.hasProjectToken = Boolean(credentials.projectToken);
  } else if (providerId === 'twilio') {
    meta.fromNumber = credentials.fromNumber || null;
    meta.hasAccountSid = Boolean(credentials.accountSid);
  } else if (providerId === 'telegram') {
    meta.hasBotToken = Boolean(credentials.botToken);
    meta.webhookUrl = credentials.webhookUrl || null;
  } else if (providerId === 's3') {
    meta.bucket = credentials.bucket || null;
    meta.region = credentials.region || null;
    meta.hasAccessKey = Boolean(credentials.accessKeyId);
  } else if (providerId === 'shopify') {
    meta.shop = normalizeShopifyShop(credentials.shop);
    meta.hasAccessToken = Boolean(credentials.accessToken);
  } else if (providerId === 'google_maps') {
    meta.hasApiKey = Boolean(credentials.apiKey);
  } else if (providerId === 'nfe') {
    meta.hasApiToken = Boolean(credentials.apiToken);
    meta.cnpj = credentials.cnpj || null;
    meta.environment = String(credentials.environment || 'homologacao').toLowerCase();
    meta.provider = String(credentials.provider || 'focus').toLowerCase();
  }

  return meta;
}

function inferMailchimpPrefix(apiKey) {
  const s = String(apiKey || '');
  const idx = s.lastIndexOf('-');
  if (idx > 0 && idx < s.length - 1) return s.slice(idx + 1);
  return null;
}

function normalizeShopifyShop(shop) {
  let s = String(shop || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  if (s && !s.includes('.')) s = `${s}.myshopify.com`;
  return s || null;
}

function validateRequired(providerId, cleaned) {
  const required = REQUIRED_FIELDS[providerId] || [];
  for (const key of required) {
    if (!cleaned[key]) {
      const err = new Error(`Campo obrigatório em falta: ${key}`);
      err.status = 400;
      err.code = 'MISSING_FIELD';
      err.field = key;
      throw err;
    }
  }
}

/**
 * Guarda credenciais (Admin) + meta pública em users.integrations.
 */
export async function saveIntegrationConnection(uid, providerId, credentials) {
  if (!CONNECTABLE_PROVIDERS.has(providerId)) {
    const err = new Error(`Provider "${providerId}" não aceita ligação por API key.`);
    err.status = 400;
    err.code = 'PROVIDER_NOT_CONNECTABLE';
    throw err;
  }

  const cleaned = {};
  for (const [k, v] of Object.entries(credentials || {})) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) cleaned[k] = s;
  }

  validateRequired(providerId, cleaned);

  if (providerId === 'shopify' && cleaned.shop) {
    cleaned.shop = normalizeShopifyShop(cleaned.shop);
  }
  if (providerId === 'paypal') {
    const mode = String(cleaned.mode || 'sandbox').toLowerCase();
    cleaned.mode = mode === 'live' ? 'live' : 'sandbox';
  }
  if (providerId === 'mailchimp' && !cleaned.serverPrefix) {
    const inferred = inferMailchimpPrefix(cleaned.apiKey);
    if (inferred) cleaned.serverPrefix = inferred;
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  await secretsRef(uid, providerId).set(
    {
      ...cleaned,
      providerId,
      updatedAt: now,
    },
    { merge: true }
  );

  const publicMeta = sanitizePublicMeta(providerId, cleaned);
  await userRef(uid).set(
    {
      integrations: {
        [providerId]: publicMeta,
      },
    },
    { merge: true }
  );

  return { providerId, connected: true, meta: stripTimestamps(publicMeta) };
}

export async function clearIntegrationConnection(uid, providerId) {
  await secretsRef(uid, providerId).delete().catch(() => {});
  await userRef(uid).set(
    {
      integrations: {
        [providerId]: admin.firestore.FieldValue.delete(),
      },
    },
    { merge: true }
  );
  return { providerId, connected: false };
}

export async function getStoredCredentials(uid, providerId) {
  const snap = await secretsRef(uid, providerId).get();
  if (!snap.exists) return null;
  return snap.data() || null;
}

/**
 * Estado agregado para o frontend (sem secrets).
 */
export async function getIntegrationsStatus(uid, { githubStatus } = {}) {
  const userSnap = await userRef(uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const integrationsMeta = userData?.integrations || {};
  const github = githubStatus || userData?.github || {};

  const providers = {};

  for (const id of PLATFORM_PROVIDERS) {
    if (id === 'mercadopago' || id === 'pix') continue;
    providers[id] = {
      id,
      status: 'connected',
      source: 'platform',
      meta: { connected: true },
    };
  }

  // Mercado Pago / Pix: token da plataforma (env). BYO user opcional legado se existir.
  const mpUser = integrationsMeta.mercadopago;
  const mpUserConnected = Boolean(mpUser?.connected);
  const mpPlatform = isMercadoPagoConfigured();
  const mpOk = mpPlatform || mpUserConnected;
  providers.mercadopago = {
    id: 'mercadopago',
    status: mpOk ? 'connected' : 'available',
    source: mpPlatform ? 'platform' : mpUserConnected ? 'user' : 'none',
    meta: {
      connected: mpOk,
      label: mpPlatform
        ? 'Ligado (plataforma)'
        : mpUserConnected
          ? mpUser?.label || 'Access Token (conta)'
          : undefined,
      platformPowered: mpPlatform,
    },
  };
  providers.pix = {
    id: 'pix',
    status: mpOk ? 'connected' : 'available',
    source: mpPlatform ? 'platform' : mpUserConnected ? 'user' : 'none',
    meta: {
      connected: mpOk,
      viaMercadoPago: true,
      label: mpPlatform ? 'Ligado (plataforma)' : undefined,
      platformPowered: mpPlatform,
    },
  };

  for (const id of CONNECTABLE_PROVIDERS) {
    const meta = integrationsMeta[id];
    const connected = Boolean(meta?.connected);
    providers[id] = {
      id,
      status: connected ? 'connected' : 'available',
      source: 'user',
      meta: connected ? stripTimestamps(meta) : {},
    };
  }

  // Stripe — OAuth Connect (conta ligada) ou billing da plataforma
  const stripeUser = integrationsMeta.stripe;
  const stripeUserConnected = Boolean(stripeUser?.connected);
  const stripePlatformBilling = isStripeConfigured();
  const stripeOAuthReady = oauthConfigured('stripe');
  providers.stripe = {
    id: 'stripe',
    status: stripeUserConnected ? 'connected' : 'available',
    source: stripeUserConnected ? 'oauth' : 'none',
    meta: stripeUserConnected
      ? {
          ...stripTimestamps(stripeUser),
          label: stripeUser?.stripeUserId
            ? `Stripe Connect (${stripeUser.stripeUserId})`
            : stripeUser?.label || 'Stripe Connect',
        }
      : {
          oauthConfigured: stripeOAuthReady,
          platformBilling: stripePlatformBilling,
          label: stripeOAuthReady
            ? 'Conectar com Stripe'
            : stripePlatformBilling
              ? 'OAuth não configurado (billing plataforma OK)'
              : undefined,
        },
  };

  // PayPal — OAuth Login (sem colar Client Secret)
  const paypalUser = integrationsMeta.paypal;
  const paypalUserConnected = Boolean(paypalUser?.connected);
  const paypalOAuthReady = oauthConfigured('paypal');
  providers.paypal = {
    id: 'paypal',
    status: paypalUserConnected ? 'connected' : 'available',
    source: paypalUserConnected ? 'oauth' : 'none',
    meta: paypalUserConnected
      ? {
          ...stripTimestamps(paypalUser),
          label:
            paypalUser?.label ||
            (paypalUser?.email ? `PayPal (${paypalUser.email})` : 'PayPal OAuth'),
        }
      : {
          oauthConfigured: paypalOAuthReady,
          platformConfigured: isPayPalPlatformConfigured(),
          label: paypalOAuthReady ? 'Conectar com PayPal' : undefined,
        },
  };

  providers.github = {
    id: 'github',
    status: github?.connected ? 'connected' : 'available',
    source: 'oauth',
    meta: {
      connected: Boolean(github?.connected),
      login: github?.login || null,
      avatarUrl: github?.avatarUrl || null,
    },
  };

  // —— Canais premium (WhatsApp / Meta / YouTube / TikTok) ——
  const waEvo = integrationsMeta.whatsapp_evolution;
  providers.whatsapp_evolution = {
    id: 'whatsapp_evolution',
    status: waEvo?.connected ? 'connected' : 'available',
    source: 'whatsapp',
    meta: waEvo?.connected
      ? stripTimestamps(waEvo)
      : { configured: isEvolutionConfigured() },
  };

  const ig = integrationsMeta.instagram;
  const fb = integrationsMeta.facebook;
  providers.instagram = {
    id: 'instagram',
    status: ig?.connected ? 'connected' : 'available',
    source: 'meta',
    meta: ig?.connected
      ? stripTimestamps(ig)
      : { metaConfigured: isMetaConfigured() },
  };
  providers.facebook = {
    id: 'facebook',
    status: fb?.connected ? 'connected' : 'available',
    source: 'meta',
    meta: fb?.connected
      ? stripTimestamps(fb)
      : { metaConfigured: isMetaConfigured() },
  };

  const yt = integrationsMeta.youtube;
  const tt = integrationsMeta.tiktok;
  providers.youtube = {
    id: 'youtube',
    status: yt?.connected ? 'connected' : 'available',
    source: 'oauth',
    meta: yt?.connected
      ? stripTimestamps(yt)
      : { oauthConfigured: oauthConfigured('youtube') },
  };
  providers.tiktok = {
    id: 'tiktok',
    status: tt?.connected ? 'connected' : 'available',
    source: 'oauth',
    meta: tt?.connected
      ? stripTimestamps(tt)
      : { oauthConfigured: oauthConfigured('tiktok') },
  };

  return {
    providers,
    platform: {
      mercadopagoBilling: isMercadoPagoConfigured(),
      stripeBilling: isStripeConfigured(),
      evolutionApi: isEvolutionConfigured(),
      metaApp: isMetaConfigured(),
      youtubeOAuth: oauthConfigured('youtube'),
      tiktokOAuth: oauthConfigured('tiktok'),
      stripeOAuth: oauthConfigured('stripe'),
      paypalOAuth: oauthConfigured('paypal'),
    },
  };
}

/**
 * Persiste estado público WhatsApp Evolution (após QR confirmado).
 */
export async function markWhatsAppEvolutionConnected(uid, { instanceName } = {}) {
  const name = String(instanceName || '').trim() || buildInstanceNameForUser(uid);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const meta = {
    connected: true,
    instanceName: name,
    connectedAt: now,
    updatedAt: now,
  };
  await userRef(uid).set({ integrations: { whatsapp_evolution: meta } }, { merge: true });
  return { providerId: 'whatsapp_evolution', connected: true, meta: stripTimestamps(meta) };
}

export async function clearWhatsAppEvolutionConnection(uid) {
  await userRef(uid).set(
    { integrations: { whatsapp_evolution: admin.firestore.FieldValue.delete() } },
    { merge: true }
  );
  return { providerId: 'whatsapp_evolution', connected: false };
}

/**
 * Guarda tokens Meta (secrets) + meta pública Instagram/Facebook.
 */
export async function saveMetaSocialConnection(uid, payload) {
  const {
    pageId,
    pageName,
    pageAccessToken,
    instagramAccountId,
    instagramUsername,
    userAccessToken,
  } = payload || {};

  if (!pageId || !pageAccessToken || !instagramAccountId) {
    const err = new Error('Dados Meta incompletos (página + Instagram Business).');
    err.status = 400;
    err.code = 'META_INCOMPLETE';
    throw err;
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  await secretsRef(uid, 'meta').set(
    {
      providerId: 'meta',
      metaPageAccessToken: pageAccessToken,
      metaUserAccessToken: userAccessToken || null,
      metaFacebookPageId: pageId,
      metaInstagramAccountId: instagramAccountId,
      updatedAt: now,
    },
    { merge: true }
  );

  const igMeta = {
    connected: true,
    username: instagramUsername || null,
    accountId: instagramAccountId,
    connectedAt: now,
    updatedAt: now,
  };
  const fbMeta = {
    connected: true,
    pageName: pageName || null,
    pageId,
    connectedAt: now,
    updatedAt: now,
  };

  await userRef(uid).set(
    {
      integrations: {
        instagram: igMeta,
        facebook: fbMeta,
      },
    },
    { merge: true }
  );

  return {
    success: true,
    instagram: stripTimestamps(igMeta),
    facebook: stripTimestamps(fbMeta),
  };
}

export async function clearMetaSocialConnection(uid) {
  await secretsRef(uid, 'meta').delete().catch(() => {});
  await userRef(uid).set(
    {
      integrations: {
        instagram: admin.firestore.FieldValue.delete(),
        facebook: admin.firestore.FieldValue.delete(),
      },
    },
    { merge: true }
  );
  return { success: true, connected: false };
}

/**
 * Persiste tokens OAuth YouTube/TikTok/Stripe/PayPal (secrets) + meta pública.
 */
export async function saveSocialOAuthConnection(uid, platform, fields) {
  const allowed = new Set(['youtube', 'tiktok', 'stripe', 'paypal']);
  if (!allowed.has(platform)) {
    const err = new Error('Plataforma OAuth inválida.');
    err.status = 400;
    throw err;
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  if (platform === 'youtube') {
    await secretsRef(uid, 'youtube').set(
      {
        providerId: 'youtube',
        youtubeAccessToken: fields.youtubeAccessToken || null,
        youtubeRefreshToken: fields.youtubeRefreshToken || null,
        youtubeTokenExpiresAt: fields.youtubeTokenExpiresAt || null,
        youtubeChannelId: fields.youtubeChannelId || null,
        updatedAt: now,
      },
      { merge: true }
    );
    const meta = {
      connected: true,
      channelId: fields.youtubeChannelId || null,
      channelTitle: fields.youtubeChannelTitle || null,
      connectedAt: now,
      updatedAt: now,
    };
    await userRef(uid).set({ integrations: { youtube: meta } }, { merge: true });
    return {
      success: true,
      providerId: 'youtube',
      displayName: fields.youtubeChannelTitle || null,
      meta: stripTimestamps(meta),
    };
  }

  if (platform === 'tiktok') {
    await secretsRef(uid, 'tiktok').set(
      {
        providerId: 'tiktok',
        tiktokAccessToken: fields.tiktokAccessToken || null,
        tiktokRefreshToken: fields.tiktokRefreshToken || null,
        tiktokOpenId: fields.tiktokOpenId || null,
        tiktokTokenExpiresAt: fields.tiktokTokenExpiresAt || null,
        updatedAt: now,
      },
      { merge: true }
    );
    const meta = {
      connected: true,
      username: fields.tiktokUsername || null,
      openId: fields.tiktokOpenId || null,
      connectedAt: now,
      updatedAt: now,
    };
    await userRef(uid).set({ integrations: { tiktok: meta } }, { merge: true });
    return {
      success: true,
      providerId: 'tiktok',
      displayName: fields.tiktokUsername || null,
      meta: stripTimestamps(meta),
    };
  }

  if (platform === 'stripe') {
    await secretsRef(uid, 'stripe').set(
      {
        providerId: 'stripe',
        source: 'oauth',
        secretKey: fields.secretKey || null,
        publishableKey: fields.publishableKey || null,
        stripeUserId: fields.stripeUserId || null,
        refreshToken: fields.refreshToken || null,
        livemode: Boolean(fields.livemode),
        updatedAt: now,
      },
      { merge: true }
    );
    const meta = {
      connected: true,
      source: 'oauth',
      stripeUserId: fields.stripeUserId || null,
      hasPublishableKey: Boolean(fields.publishableKey),
      mode: fields.livemode ? 'live' : 'test',
      label: fields.stripeUserId
        ? `Stripe Connect (${fields.stripeUserId})`
        : 'Stripe Connect',
      connectedAt: now,
      updatedAt: now,
    };
    await userRef(uid).set({ integrations: { stripe: meta } }, { merge: true });
    return {
      success: true,
      providerId: 'stripe',
      displayName: fields.stripeUserId || 'Stripe',
      meta: stripTimestamps(meta),
    };
  }

  // paypal
  await secretsRef(uid, 'paypal').set(
    {
      providerId: 'paypal',
      source: 'oauth',
      accessToken: fields.accessToken || null,
      refreshToken: fields.refreshToken || null,
      clientId: fields.clientId || null,
      // create-order usa clientId+clientSecret plataforma se BYO secret ausente
      clientSecret: String(process.env.PAYPAL_CLIENT_SECRET || '').trim() || null,
      mode: fields.mode || 'sandbox',
      email: fields.email || null,
      payerId: fields.payerId || null,
      updatedAt: now,
    },
    { merge: true }
  );
  const meta = {
    connected: true,
    source: 'oauth',
    email: fields.email || null,
    payerId: fields.payerId || null,
    mode: fields.mode || 'sandbox',
    label: fields.email ? `PayPal (${fields.email})` : 'PayPal OAuth',
    connectedAt: now,
    updatedAt: now,
  };
  await userRef(uid).set({ integrations: { paypal: meta } }, { merge: true });
  return {
    success: true,
    providerId: 'paypal',
    displayName: fields.email || fields.payerId || 'PayPal',
    meta: stripTimestamps(meta),
  };
}

export async function clearSocialOAuthConnection(uid, platform) {
  const allowed = new Set(['youtube', 'tiktok', 'stripe', 'paypal']);
  if (!allowed.has(platform)) {
    const err = new Error('Plataforma OAuth inválida.');
    err.status = 400;
    throw err;
  }
  await secretsRef(uid, platform).delete().catch(() => {});
  await userRef(uid).set(
    { integrations: { [platform]: admin.firestore.FieldValue.delete() } },
    { merge: true }
  );
  return { success: true, providerId: platform, connected: false };
}

function stripTimestamps(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const out = { ...obj };
  delete out.connectedAt;
  delete out.updatedAt;
  return out;
}

/**
 * Lista IDs ligados (para injectar no system prompt).
 */
export async function listConnectedProviderIds(uid) {
  const status = await getIntegrationsStatus(uid);
  return Object.values(status.providers)
    .filter((p) => p.status === 'connected')
    .map((p) => p.id);
}

/**
 * Carrega integrações do utilizador autenticado para o system prompt do chat.
 * Inclui IDs públicos e tokens (só para o LLM gerar código DESTE uid).
 * NUNCA logar o retorno — contém secrets.
 *
 * Shape:
 * {
 *   whatsapp: { connected, instanceId, source },
 *   whatsappCloud?: { connected, defaultPhone, phoneNumberId, accessToken? },
 *   instagram: { connected, username, accountId, accessToken?, pageId? },
 *   facebook: { connected, pageName, pageId, accessToken? },
 *   youtube: { connected, channelId, channelTitle, accessToken? },
 *   tiktok: { connected, username, openId, accessToken? },
 *   mercadopago: { connected, platform: true },
 *   stripe?: { connected, mode },
 * }
 */
export async function loadUserIntegrationsForPrompt(uid) {
  if (!uid) return {};

  const status = await getIntegrationsStatus(uid);
  const providers = status?.providers || {};
  const out = {};

  const waEvo = providers.whatsapp_evolution;
  if (waEvo?.status === 'connected') {
    out.whatsapp = {
      connected: true,
      source: 'evolution',
      instanceId: waEvo.meta?.instanceName || buildInstanceNameForUser(uid),
      proxyPath: '/api/integrations/whatsapp',
    };
  }

  const waByo = providers.whatsapp;
  if (waByo?.status === 'connected') {
    const creds = await getStoredCredentials(uid, 'whatsapp');
    out.whatsappCloud = {
      connected: true,
      defaultPhone: waByo.meta?.defaultPhone || creds?.defaultPhone || null,
      phoneNumberId: creds?.phoneNumberId || null,
      accessToken: creds?.accessToken || null,
      hasCloudApi: Boolean(creds?.accessToken && creds?.phoneNumberId),
    };
    if (!out.whatsapp) {
      out.whatsapp = {
        connected: true,
        source: 'cloud_api',
        defaultPhone: out.whatsappCloud.defaultPhone,
      };
    }
  }

  const needMeta =
    providers.instagram?.status === 'connected' ||
    providers.facebook?.status === 'connected';
  const metaSecrets = needMeta ? await getStoredCredentials(uid, 'meta') : null;

  if (providers.instagram?.status === 'connected') {
    out.instagram = {
      connected: true,
      username: providers.instagram.meta?.username || null,
      accountId:
        providers.instagram.meta?.accountId ||
        metaSecrets?.metaInstagramAccountId ||
        null,
      pageId:
        providers.facebook?.meta?.pageId ||
        metaSecrets?.metaFacebookPageId ||
        null,
      accessToken: metaSecrets?.metaPageAccessToken || null,
    };
  }

  if (providers.facebook?.status === 'connected') {
    out.facebook = {
      connected: true,
      pageName: providers.facebook.meta?.pageName || null,
      pageId:
        providers.facebook.meta?.pageId || metaSecrets?.metaFacebookPageId || null,
      accessToken: metaSecrets?.metaPageAccessToken || null,
    };
  }

  if (providers.youtube?.status === 'connected') {
    const yt = await getStoredCredentials(uid, 'youtube');
    out.youtube = {
      connected: true,
      channelId:
        providers.youtube.meta?.channelId || yt?.youtubeChannelId || null,
      channelTitle: providers.youtube.meta?.channelTitle || null,
      accessToken: yt?.youtubeAccessToken || null,
    };
  }

  if (providers.tiktok?.status === 'connected') {
    const tt = await getStoredCredentials(uid, 'tiktok');
    out.tiktok = {
      connected: true,
      username: providers.tiktok.meta?.username || null,
      openId: providers.tiktok.meta?.openId || tt?.tiktokOpenId || null,
      accessToken: tt?.tiktokAccessToken || null,
    };
  }

  if (providers.mercadopago?.status === 'connected') {
    out.mercadopago = {
      connected: true,
      platform: providers.mercadopago.source === 'platform',
      source: providers.mercadopago.source || 'none',
    };
  }

  if (providers.pix?.status === 'connected' && !out.mercadopago) {
    out.mercadopago = {
      connected: true,
      platform: providers.pix.source === 'platform',
      source: providers.pix.source || 'none',
    };
  }

  if (providers.stripe?.status === 'connected') {
    out.stripe = {
      connected: true,
      mode: providers.stripe.meta?.mode || null,
    };
  }

  // Platform Firebase Google Auth — always available for generated apps
  out.googleAuth = {
    connected: true,
    source: 'platform',
    bridge: 'window.GoCreateAuth.signInWithGoogle()',
  };
  out.firebaseAuth = {
    connected: true,
    source: 'platform',
    bridge: 'window.GoCreateAuth',
  };

  return out;
}

/**
 * Preferência: TEST- da plataforma para GoCreatePayments / public-create-payment
 * (Payments API / Pix). Fallback: MERCADOPAGO_ACCESS_TOKEN. BYO só se a
 * plataforma não tiver token.
 */
async function resolveMpAccessToken(uid, { preferTest = true } = {}) {
  const platform = getAccessTokenForAppPayments({ preferTest });
  if (platform?.accessToken) {
    return platform;
  }
  const creds = await getStoredCredentials(uid, 'mercadopago');
  if (creds?.accessToken) {
    return {
      accessToken: creds.accessToken,
      source: 'user',
      mode: isTestAccessToken(creds.accessToken) ? 'test' : 'live',
    };
  }
  return null;
}

function sanitizePayerEmail(payerEmail, uid) {
  const raw = String(payerEmail || '').trim().toLowerCase();
  // MP bloqueia alguns padrões *@testuser.com em sandbox
  if (raw && !/@testuser\.com$/i.test(raw) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return raw;
  }
  return `buyer_${String(uid || 'guest').slice(0, 24)}@gocreate.app`;
}

async function createMpPaymentWithToken({
  accessToken,
  tokenSource,
  tokenMode,
  uid,
  projectId,
  amountNum,
  title,
  email,
  externalRef,
  publicPathKey,
  method,
}) {
  const client = new MercadoPagoConfig({ accessToken });

  if (method === 'preference') {
    const preference = new Preference(client);
    const appUrl = (process.env.PUBLIC_APP_URL || 'https://gocreate.web.app').replace(/\/$/, '');
    const result = await preference.create({
      body: {
        items: [
          {
            id: String(projectId || 'item'),
            title,
            quantity: 1,
            unit_price: amountNum,
            currency_id: 'BRL',
          },
        ],
        payer: { email },
        external_reference: externalRef,
        metadata: {
          projectId: projectId || null,
          ownerId: uid,
          source: 'gocreate_integrations',
        },
        back_urls: {
          success: `${appUrl}/p/${publicPathKey}?billing=success`,
          pending: `${appUrl}/p/${publicPathKey}?billing=pending`,
          failure: `${appUrl}/p/${publicPathKey}?billing=failure`,
        },
        auto_return: 'approved',
      },
    });
    const sandbox = isTestAccessToken(accessToken) || tokenMode === 'test';
    return {
      mode: 'preference',
      preferenceId: result.id,
      initPoint: sandbox
        ? result.sandbox_init_point || result.init_point
        : result.init_point || result.sandbox_init_point,
      externalReference: externalRef,
      tokenSource,
      tokenMode: sandbox ? 'test' : 'live',
    };
  }

  const payment = new Payment(client);
  const result = await payment.create({
    body: {
      transaction_amount: amountNum,
      description: title,
      payment_method_id: 'pix',
      payer: { email },
      external_reference: externalRef,
      metadata: {
        projectId: projectId || null,
        ownerId: uid,
        source: 'gocreate_integrations',
      },
    },
    requestOptions: { idempotencyKey: `gc-int-${externalRef}` },
  });

  const txData = result.point_of_interaction?.transaction_data || {};
  return {
    mode: 'pix',
    paymentId: result.id,
    status: result.status,
    qrCode: txData.qr_code || null,
    qrCodeBase64: txData.qr_code_base64 || null,
    ticketUrl: txData.ticket_url || null,
    externalReference: externalRef,
    tokenSource,
    tokenMode: isTestAccessToken(accessToken) ? 'test' : tokenMode || 'live',
  };
}

/**
 * Cria Pix ou Preference com token da plataforma (preferido TEST) ou BYO legado.
 */
export async function createProjectMercadoPagoPayment({
  uid,
  projectId,
  amount,
  description,
  payerEmail,
  method = 'pix',
  allowPlatformFallback = true,
  preferTest = true,
}) {
  const resolved = await resolveMpAccessToken(uid, { preferTest });
  if (!resolved) {
    const err = new Error(
      'Mercado Pago da plataforma não configurado (MERCADOPAGO_ACCESS_TOKEN / MERCADOPAGO_TEST_ACCESS_TOKEN).'
    );
    err.status = 503;
    err.code = 'MP_NOT_CONNECTED';
    throw err;
  }
  if (
    !allowPlatformFallback &&
    (resolved.source === 'platform' || resolved.source === 'platform_test')
  ) {
    const err = new Error(
      'Mercado Pago requer token de utilizador neste contexto.'
    );
    err.status = 503;
    err.code = 'MP_USER_REQUIRED';
    throw err;
  }

  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    const err = new Error('Valor inválido.');
    err.status = 400;
    throw err;
  }

  const title = String(description || 'Pagamento GoCreate').slice(0, 200);
  const email = sanitizePayerEmail(payerEmail, uid);
  const externalRef = `gc-proj-${projectId}-${Date.now()}`;

  let publicPathKey = projectId;
  if (projectId) {
    try {
      const projSnap = await db.collection('projects').doc(projectId).get();
      const customSlug = String(projSnap.data()?.slug || '').trim().toLowerCase();
      if (customSlug) publicPathKey = customSlug;
    } catch {
      /* keep projectId */
    }
  }

  const payload = {
    uid,
    projectId,
    amountNum,
    title,
    email,
    externalRef,
    publicPathKey,
    method: method === 'preference' ? 'preference' : 'pix',
  };

  try {
    return await createMpPaymentWithToken({
      accessToken: resolved.accessToken,
      tokenSource: resolved.source,
      tokenMode: resolved.mode,
      ...payload,
    });
  } catch (err) {
    // Se APP_USR (test-user) falhar, tenta TEST- explícito uma vez
    const fallbackTest = getTestAccessToken();
    if (
      isLiveCredentialsUnauthorizedError(err) &&
      fallbackTest &&
      fallbackTest !== resolved.accessToken &&
      isTestAccessToken(fallbackTest)
    ) {
      try {
        return await createMpPaymentWithToken({
          accessToken: fallbackTest,
          tokenSource: 'platform_test_fallback',
          tokenMode: 'test',
          ...payload,
        });
      } catch (err2) {
        throw mapMercadoPagoPaymentError(err2);
      }
    }
    throw mapMercadoPagoPaymentError(err);
  }
}

export async function createProjectStripePayment({
  uid,
  projectId,
  amount,
  description,
  currency = 'brl',
  mode = 'payment_intent',
}) {
  const creds = await getStoredCredentials(uid, 'stripe');
  if (!creds?.secretKey) {
    const err = new Error('Stripe não ligado. Adiciona a Secret Key em Integrações.');
    err.status = 503;
    err.code = 'STRIPE_NOT_CONNECTED';
    throw err;
  }

  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    const err = new Error('Valor inválido.');
    err.status = 400;
    throw err;
  }

  // Stripe espera centavos
  const unitAmount = Math.round(amountNum * 100);
  const stripe = new Stripe(creds.secretKey);
  const title = String(description || 'Pagamento GoCreate').slice(0, 200);

  if (mode === 'checkout') {
    const appUrl = (process.env.PUBLIC_APP_URL || 'https://gocreate.web.app').replace(/\/$/, '');
    let publicPathKey = projectId;
    if (projectId) {
      try {
        const projSnap = await db.collection('projects').doc(projectId).get();
        const customSlug = String(projSnap.data()?.slug || '').trim().toLowerCase();
        if (customSlug) publicPathKey = customSlug;
      } catch {
        /* keep */
      }
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: String(currency || 'brl').toLowerCase(),
            unit_amount: unitAmount,
            product_data: { name: title },
          },
        },
      ],
      success_url: `${appUrl}/p/${publicPathKey}?billing=success`,
      cancel_url: `${appUrl}/p/${publicPathKey}?billing=cancel`,
      metadata: { projectId: String(projectId || ''), ownerId: uid },
    });
    return {
      mode: 'checkout',
      sessionId: session.id,
      url: session.url,
    };
  }

  const intent = await stripe.paymentIntents.create({
    amount: unitAmount,
    currency: String(currency || 'brl').toLowerCase(),
    description: title,
    metadata: { projectId: String(projectId || ''), ownerId: uid },
    automatic_payment_methods: { enabled: true },
  });

  return {
    mode: 'payment_intent',
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
    publishableKey: creds.publishableKey || null,
  };
}

/**
 * Stub PayPal — valida credenciais e devolve payload de order (sem charge real).
 * Docs: https://developer.paypal.com/docs/api/orders/v2/
 */
export async function createProjectPayPalPaymentStub({
  uid,
  projectId,
  amount,
  description,
  currency = 'BRL',
}) {
  const creds = await getStoredCredentials(uid, 'paypal');
  if (!creds?.clientId || !creds?.clientSecret) {
    const err = new Error('PayPal não ligado. Adiciona Client ID e Secret em Integrações.');
    err.status = 503;
    err.code = 'PAYPAL_NOT_CONNECTED';
    throw err;
  }

  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    const err = new Error('Valor inválido.');
    err.status = 400;
    throw err;
  }

  const mode = String(creds.mode || 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox';
  const base =
    mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

  // OAuth token — prova que as keys funcionam
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenData.access_token) {
    const err = new Error(
      tokenData?.error_description ||
        tokenData?.error ||
        'Credenciais PayPal inválidas (OAuth falhou).'
    );
    err.status = 401;
    err.code = 'PAYPAL_AUTH_FAILED';
    throw err;
  }

  const title = String(description || 'Pagamento GoCreate').slice(0, 120);
  const orderBody = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: `gc-${projectId || 'item'}`,
        description: title,
        amount: {
          currency_code: String(currency || 'BRL').toUpperCase(),
          value: amountNum.toFixed(2),
        },
      },
    ],
  };

  const orderRes = await fetch(`${base}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderBody),
  });
  const orderData = await orderRes.json().catch(() => ({}));
  if (!orderRes.ok) {
    const err = new Error(
      orderData?.message || orderData?.details?.[0]?.description || 'Falha ao criar order PayPal.'
    );
    err.status = orderRes.status >= 400 && orderRes.status < 600 ? orderRes.status : 502;
    err.code = 'PAYPAL_ORDER_FAILED';
    throw err;
  }

  const approve = (orderData.links || []).find((l) => l.rel === 'approve');
  return {
    mode,
    orderId: orderData.id,
    status: orderData.status,
    approveUrl: approve?.href || null,
    docsUrl: 'https://developer.paypal.com/docs/api/orders/v2/',
    stub: false,
  };
}

/**
 * Test ping — valida credenciais contra API do provider quando viável.
 */
export async function testIntegrationConnection(uid, providerId) {
  if (!CONNECTABLE_PROVIDERS.has(providerId)) {
    const err = new Error('Provider não suportado.');
    err.status = 400;
    err.code = 'PROVIDER_NOT_CONNECTABLE';
    throw err;
  }

  const creds = await getStoredCredentials(uid, providerId);
  if (!creds) {
    const err = new Error('Integração não ligada.');
    err.status = 404;
    err.code = 'NOT_CONNECTED';
    throw err;
  }

  if (providerId === 'supabase') {
    const url = String(creds.url || '').replace(/\/$/, '');
    const key = creds.anonKey || creds.serviceRoleKey;
    if (!url || !key) {
      return { ok: false, message: 'URL ou key em falta.' };
    }
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    }).catch(() => null);
    if (!res) return { ok: false, message: 'Sem resposta do Supabase.' };
    return { ok: res.ok || res.status < 500, status: res.status, message: 'Supabase alcançável.' };
  }

  if (providerId === 'resend') {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    }).catch(() => null);
    if (!res) return { ok: false, message: 'Sem resposta do Resend.' };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, message: 'API Key Resend inválida.' };
    }
    return { ok: true, status: res.status, message: 'API Key Resend válida.' };
  }

  if (providerId === 'sendgrid') {
    const res = await fetch('https://api.sendgrid.com/v3/user/profile', {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    }).catch(() => null);
    if (!res) return { ok: false, message: 'Sem resposta do SendGrid.' };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, message: 'API Key SendGrid inválida.' };
    }
    return { ok: true, status: res.status, message: 'API Key SendGrid válida.' };
  }

  if (providerId === 'telegram') {
    const res = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(creds.botToken)}/getMe`
    ).catch(() => null);
    if (!res) return { ok: false, message: 'Sem resposta do Telegram.' };
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      return { ok: false, message: data.description || 'Bot token inválido.' };
    }
    return {
      ok: true,
      message: `Bot @${data.result?.username || 'ok'}`,
      username: data.result?.username || null,
    };
  }

  if (providerId === 'twilio') {
    const basic = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds.accountSid)}.json`,
      { headers: { Authorization: `Basic ${basic}` } }
    ).catch(() => null);
    if (!res) return { ok: false, message: 'Sem resposta do Twilio.' };
    if (!res.ok) {
      return { ok: false, status: res.status, message: 'Credenciais Twilio inválidas.' };
    }
    return { ok: true, status: res.status, message: 'Conta Twilio válida.' };
  }

  if (providerId === 'shopify') {
    const shop = normalizeShopifyShop(creds.shop);
    const res = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': creds.accessToken },
    }).catch(() => null);
    if (!res) return { ok: false, message: 'Sem resposta do Shopify.' };
    if (!res.ok) {
      return { ok: false, status: res.status, message: 'Shop ou token Shopify inválidos.' };
    }
    const data = await res.json().catch(() => ({}));
    return {
      ok: true,
      message: data?.shop?.name ? `Loja ${data.shop.name}` : 'Shopify OK',
      shopName: data?.shop?.name || null,
    };
  }

  if (providerId === 'paypal') {
    try {
      const result = await createProjectPayPalPaymentStub({
        uid,
        projectId: 'ping',
        amount: 1,
        description: 'GoCreate ping',
        currency: 'BRL',
      });
      return { ok: true, message: `PayPal ${result.mode} OK`, orderId: result.orderId };
    } catch (err) {
      return { ok: false, message: err.message || 'PayPal ping falhou.', code: err.code };
    }
  }

  if (providerId === 'posthog') {
    const host = String(creds.host || 'https://app.posthog.com').replace(/\/$/, '');
    // Não há endpoint público simples; confirmar formato da key
    const key = String(creds.apiKey || '');
    if (!key.startsWith('phc_') && key.length < 16) {
      return { ok: false, message: 'Project API Key com formato suspeito.' };
    }
    return { ok: true, message: 'Credenciais PostHog guardadas (formato OK).', host };
  }

  // Default: credentials present
  return {
    ok: true,
    message: 'Credenciais guardadas. Teste automático não disponível para este provider.',
    stub: true,
  };
}

/**
 * Stub webhook Telegram — regista URL se fornecida (setWebhook).
 */
export async function setupTelegramWebhookStub(uid, { webhookUrl } = {}) {
  const creds = await getStoredCredentials(uid, 'telegram');
  if (!creds?.botToken) {
    const err = new Error('Telegram não ligado.');
    err.status = 404;
    err.code = 'NOT_CONNECTED';
    throw err;
  }

  const url = String(webhookUrl || creds.webhookUrl || '').trim();
  if (!url) {
    return {
      ok: true,
      stub: true,
      message:
        'Bot ligado. Define webhookUrl no connect ou envia { webhookUrl } aqui para setWebhook.',
      docsUrl: 'https://core.telegram.org/bots/api#setwebhook',
    };
  }

  const res = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(creds.botToken)}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    const err = new Error(data.description || 'setWebhook falhou.');
    err.status = 400;
    err.code = 'TELEGRAM_WEBHOOK_FAILED';
    throw err;
  }

  await secretsRef(uid, 'telegram').set({ webhookUrl: url }, { merge: true });
  await userRef(uid).set(
    {
      integrations: {
        telegram: {
          connected: true,
          hasBotToken: true,
          webhookUrl: url,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
    },
    { merge: true }
  );

  return { ok: true, webhookUrl: url, description: data.description || 'Webhook definido.' };
}

/**
 * Stub emissão NF-e — valida credenciais guardadas e devolve payload de exemplo.
 */
export async function emitNfeStub(uid, { amount, description } = {}) {
  const creds = await getStoredCredentials(uid, 'nfe');
  if (!creds?.apiToken) {
    const err = new Error('NF-e não ligada. Adiciona o API Token em Integrações.');
    err.status = 503;
    err.code = 'NFE_NOT_CONNECTED';
    throw err;
  }

  return {
    stub: true,
    status: 'queued',
    provider: String(creds.provider || 'focus').toLowerCase(),
    environment: String(creds.environment || 'homologacao').toLowerCase(),
    cnpj: creds.cnpj || null,
    amount: amount != null ? Number(amount) : null,
    description: description || null,
    message:
      'Emissão real ainda é stub. Credenciais guardadas — integra o provedor fiscal no app gerado.',
    docsUrl: 'https://focusnfe.com.br/doc/',
  };
}

/**
 * Resolve owner de um projeto publicado para checkout público.
 */
export async function resolvePublishedProjectOwner(projectId) {
  if (!projectId) return null;
  const pub = await db.collection('publicProjects').doc(projectId).get();
  if (pub.exists) {
    return pub.data()?.ownerId || null;
  }
  const slugDoc = await db.collection('projectSlugs').doc(String(projectId).toLowerCase()).get();
  if (slugDoc.exists) {
    const mappedId = slugDoc.data()?.projectId;
    if (mappedId) {
      const bySlug = await db.collection('publicProjects').doc(mappedId).get();
      if (bySlug.exists) return bySlug.data()?.ownerId || null;
      const projBySlug = await db.collection('projects').doc(mappedId).get();
      if (projBySlug.exists) return projBySlug.data()?.ownerId || null;
    }
  }
  const proj = await db.collection('projects').doc(projectId).get();
  if (proj.exists) {
    return proj.data()?.ownerId || null;
  }
  return null;
}

export default {
  CONNECTABLE_PROVIDERS,
  PLATFORM_PROVIDERS,
  saveIntegrationConnection,
  clearIntegrationConnection,
  getStoredCredentials,
  getIntegrationsStatus,
  listConnectedProviderIds,
  loadUserIntegrationsForPrompt,
  createProjectMercadoPagoPayment,
  createProjectStripePayment,
  createProjectPayPalPaymentStub,
  testIntegrationConnection,
  setupTelegramWebhookStub,
  emitNfeStub,
  resolvePublishedProjectOwner,
};
