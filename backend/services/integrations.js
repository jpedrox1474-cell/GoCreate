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
import { isMercadoPagoConfigured, getAccessToken as getPlatformMpToken } from './mercadopago.js';
import { isStripeConfigured } from './stripe.js';

/** Providers que aceitam connect via API key no backend. */
export const CONNECTABLE_PROVIDERS = new Set([
  'mercadopago',
  'stripe',
  'supabase',
  'neon',
  'resend',
  'whatsapp',
  'ga4',
  'posthog',
  'google_maps',
]);

/** Providers “sempre ligados” via plataforma GoCreate. */
export const PLATFORM_PROVIDERS = new Set([
  'firebase_auth',
  'google_oauth',
  'firebase_firestore',
  'cloudinary',
  'viacep',
  'pix',
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
  } else if (providerId === 'whatsapp') {
    meta.defaultPhone = credentials.defaultPhone || null;
    meta.hasCloudApi = Boolean(credentials.accessToken && credentials.phoneNumberId);
  } else if (providerId === 'ga4') {
    meta.measurementId = credentials.measurementId || null;
  } else if (providerId === 'supabase') {
    meta.url = credentials.url || null;
  } else if (providerId === 'resend') {
    meta.fromEmail = credentials.fromEmail || null;
  } else if (providerId === 'posthog') {
    meta.host = credentials.host || null;
  }

  return meta;
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

  if (providerId === 'mercadopago' && !cleaned.accessToken) {
    const err = new Error('Access Token do Mercado Pago é obrigatório.');
    err.status = 400;
    err.code = 'MISSING_ACCESS_TOKEN';
    throw err;
  }
  if (providerId === 'stripe' && !cleaned.secretKey) {
    const err = new Error('Secret Key do Stripe é obrigatória.');
    err.status = 400;
    err.code = 'MISSING_SECRET_KEY';
    throw err;
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
    providers[id] = {
      id,
      status: 'connected',
      source: 'platform',
      meta: { connected: true },
    };
  }

  // Pix herda do MP do utilizador OU da plataforma (billing)
  const mpUser = integrationsMeta.mercadopago;
  const mpConnected = Boolean(mpUser?.connected);
  providers.pix = {
    id: 'pix',
    status: mpConnected || isMercadoPagoConfigured() ? 'connected' : 'available',
    source: mpConnected ? 'user' : 'platform',
    meta: { connected: mpConnected || isMercadoPagoConfigured(), viaMercadoPago: true },
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

  return {
    providers,
    platform: {
      mercadopagoBilling: isMercadoPagoConfigured(),
      stripeBilling: isStripeConfigured(),
    },
  };
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

async function resolveMpAccessToken(uid) {
  const creds = await getStoredCredentials(uid, 'mercadopago');
  if (creds?.accessToken) {
    return { accessToken: creds.accessToken, source: 'user' };
  }
  // Fallback plataforma só para testes internos — apps publicados exigem BYO
  if (isMercadoPagoConfigured()) {
    return { accessToken: getPlatformMpToken(), source: 'platform' };
  }
  return null;
}

/**
 * Cria Pix ou Preference com o token do owner (ou plataforma se disponível).
 */
export async function createProjectMercadoPagoPayment({
  uid,
  projectId,
  amount,
  description,
  payerEmail,
  method = 'pix',
  allowPlatformFallback = true,
}) {
  const resolved = await resolveMpAccessToken(uid);
  if (!resolved) {
    const err = new Error(
      'Mercado Pago não ligado. Liga o teu Access Token em Integrações.'
    );
    err.status = 503;
    err.code = 'MP_NOT_CONNECTED';
    throw err;
  }
  if (!allowPlatformFallback && resolved.source === 'platform') {
    const err = new Error(
      'Liga o teu Mercado Pago em Integrações para aceitar pagamentos reais neste projeto.'
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

  const client = new MercadoPagoConfig({ accessToken: resolved.accessToken });
  const title = String(description || 'Pagamento GoCreate').slice(0, 200);
  const email = payerEmail || `buyer_${uid}@gocreate.app`;
  const externalRef = `gc-proj-${projectId}-${Date.now()}`;

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
          success: `${appUrl}/p/${projectId}?billing=success`,
          pending: `${appUrl}/p/${projectId}?billing=pending`,
          failure: `${appUrl}/p/${projectId}?billing=failure`,
        },
        auto_return: 'approved',
      },
    });
    const sandbox = resolved.accessToken.startsWith('TEST-');
    return {
      mode: 'preference',
      preferenceId: result.id,
      initPoint: sandbox
        ? result.sandbox_init_point || result.init_point
        : result.init_point || result.sandbox_init_point,
      externalReference: externalRef,
      tokenSource: resolved.source,
    };
  }

  // Pix direto
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
    tokenSource: resolved.source,
  };
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
      success_url: `${appUrl}/p/${projectId}?billing=success`,
      cancel_url: `${appUrl}/p/${projectId}?billing=cancel`,
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
 * Resolve owner de um projeto publicado para checkout público.
 */
export async function resolvePublishedProjectOwner(projectId) {
  if (!projectId) return null;
  const pub = await db.collection('publicProjects').doc(projectId).get();
  if (pub.exists) {
    return pub.data()?.ownerId || null;
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
  createProjectMercadoPagoPayment,
  createProjectStripePayment,
  resolvePublishedProjectOwner,
};
