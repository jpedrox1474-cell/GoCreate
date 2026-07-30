/**
 * Mercado Pago — Checkout Preferences (Pro) + Pix Payments (Turbo).
 *
 * Env:
 *   MERCADOPAGO_ACCESS_TOKEN   (obrigatório para criar pagamentos)
 *   MERCADOPAGO_WEBHOOK_SECRET (opcional — valida x-signature)
 *   MERCADOPAGO_NOTIFICATION_URL  ex: https://gocreate.web.app/api/billing/webhook
 *   PUBLIC_APP_URL                ex: https://gocreate.web.app
 *
 * Futuro Stripe: espelhar createCheckoutSession / constructWebhookEvent
 * em services/stripe.js e ramificar em routes/billing.js por provider.
 */

import crypto from 'crypto';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

export const BILLING_PRODUCTS = {
  pro: {
    id: 'pro',
    title: 'GoCreate Pro — 500 créditos/mês',
    amount: 49,
    credits: 500,
    type: 'subscription',
    plan: 'pro',
    currency: 'BRL',
  },
  turbo: {
    id: 'turbo',
    title: 'GoCreate Turbo — +100 créditos (PIX)',
    amount: 20,
    credits: 100,
    type: 'topup',
    plan: null,
    currency: 'BRL',
  },
};

export function getAccessToken() {
  return String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
}

export function isMercadoPagoConfigured() {
  return Boolean(getAccessToken());
}

function getClient() {
  const accessToken = getAccessToken();
  if (!accessToken) {
    const err = new Error('MERCADOPAGO_ACCESS_TOKEN não configurado no servidor.');
    err.status = 503;
    err.code = 'MP_NOT_CONFIGURED';
    throw err;
  }
  return new MercadoPagoConfig({ accessToken });
}

export function resolveNotificationUrl(req) {
  const fromEnv = String(process.env.MERCADOPAGO_NOTIFICATION_URL || '').trim();
  if (fromEnv) return fromEnv;

  const proto = req?.headers?.['x-forwarded-proto'] || req?.protocol || 'https';
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  if (host) return `${proto}://${host}/api/billing/webhook`;

  return 'https://gocreate.web.app/api/billing/webhook';
}

export function resolveAppUrl(req) {
  const fromEnv = String(process.env.PUBLIC_APP_URL || '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const proto = req?.headers?.['x-forwarded-proto'] || req?.protocol || 'https';
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  if (host) return `${proto}://${host}`;

  return 'https://gocreate.web.app';
}

/**
 * Preferência Checkout Pro — redireciona para init_point (cartão / Pix no MP).
 */
export async function createCheckoutPreference({
  product,
  transactionId,
  userId,
  email,
  notificationUrl,
  appUrl,
}) {
  const client = getClient();
  const preference = new Preference(client);

  const body = {
    items: [
      {
        id: product.id,
        title: product.title,
        quantity: 1,
        unit_price: product.amount,
        currency_id: product.currency || 'BRL',
      },
    ],
    payer: {
      email: email || undefined,
    },
    external_reference: transactionId,
    metadata: {
      transactionId,
      userId,
      plan: product.plan || product.id,
      type: product.type,
      credits: product.credits,
      provider: 'mercadopago',
    },
    notification_url: notificationUrl,
    back_urls: {
      success: `${appUrl}/dashboard?billing=success&tx=${transactionId}`,
      pending: `${appUrl}/dashboard?billing=pending&tx=${transactionId}`,
      failure: `${appUrl}/dashboard?billing=failure&tx=${transactionId}`,
    },
    auto_return: 'approved',
    statement_descriptor: 'GOCREATE',
  };

  const result = await preference.create({ body });
  const sandbox = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').startsWith('TEST-');

  return {
    preferenceId: result.id,
    initPoint: sandbox
      ? result.sandbox_init_point || result.init_point
      : result.init_point || result.sandbox_init_point,
    sandboxInitPoint: result.sandbox_init_point || null,
  };
}

/**
 * Pagamento Pix direto — devolve QR (base64) + copia-e-cola.
 */
export async function createPixPayment({
  product,
  transactionId,
  userId,
  email,
  notificationUrl,
}) {
  const client = getClient();
  const payment = new Payment(client);
  const idempotencyKey = `gocreate-${transactionId}`;

  const result = await payment.create({
    body: {
      transaction_amount: product.amount,
      description: product.title,
      payment_method_id: 'pix',
      payer: {
        email: email || `user_${userId}@gocreate.app`,
      },
      external_reference: transactionId,
      notification_url: notificationUrl,
      metadata: {
        transactionId,
        userId,
        plan: product.plan || product.id,
        type: product.type,
        credits: product.credits,
        provider: 'mercadopago',
      },
    },
    requestOptions: { idempotencyKey },
  });

  const txData = result.point_of_interaction?.transaction_data || {};

  return {
    paymentId: result.id,
    status: result.status,
    qrCode: txData.qr_code || null,
    qrCodeBase64: txData.qr_code_base64 || null,
    ticketUrl: txData.ticket_url || null,
  };
}

export async function getPaymentById(paymentId) {
  const client = getClient();
  const payment = new Payment(client);
  return payment.get({ id: String(paymentId) });
}

/**
 * Valida x-signature do webhook (quando MERCADOPAGO_WEBHOOK_SECRET está definido).
 * Docs: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
export function verifyWebhookSignature({ headers, query, body }) {
  const secret = String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();
  if (!secret) return { ok: true, skipped: true };

  const xSignature = headers['x-signature'] || headers['X-Signature'];
  const xRequestId = headers['x-request-id'] || headers['X-Request-Id'];
  if (!xSignature || !xRequestId) {
    return { ok: false, reason: 'missing_signature_headers' };
  }

  const parts = Object.fromEntries(
    String(xSignature)
      .split(',')
      .map((p) => p.trim().split('='))
      .filter((kv) => kv.length === 2)
  );
  const ts = parts.ts;
  const hash = parts.v1;
  if (!ts || !hash) return { ok: false, reason: 'malformed_x_signature' };

  const dataId =
    query?.['data.id'] ||
    query?.id ||
    body?.data?.id ||
    '';

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(hash), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'invalid_signature' };
  }
  return { ok: true };
}

export function extractPaymentIdFromNotification(req) {
  return (
    req.body?.data?.id ||
    req.query?.['data.id'] ||
    req.query?.id ||
    req.body?.id ||
    null
  );
}
