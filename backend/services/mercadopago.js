/**
 * Mercado Pago — Checkout Preferences (Pro) + Pix Payments (Turbo).
 *
 * Env:
 *   MERCADOPAGO_ACCESS_TOKEN        (billing / fallback — preferir TEST- para Pix)
 *   MERCADOPAGO_TEST_ACCESS_TOKEN   (preferido em GoCreatePayments / public-create-payment)
 *   MERCADOPAGO_WEBHOOK_SECRET      (opcional — Assinatura secreta do painel Webhooks, NÃO OAuth)
 *   MERCADOPAGO_NOTIFICATION_URL    ex: https://gocreate-app.web.app/api/billing/webhook
 *   PUBLIC_APP_URL                  ex: https://gocreate-app.web.app
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

/** Credenciais sandbox clássicas (TEST-…) — necessárias para Payments API / Pix. */
export function getTestAccessToken() {
  return String(process.env.MERCADOPAGO_TEST_ACCESS_TOKEN || '').trim();
}

export function isTestAccessToken(token = getAccessToken()) {
  return String(token || '').startsWith('TEST-');
}

export function isLiveAccessToken(token = getAccessToken()) {
  return String(token || '').startsWith('APP_USR-');
}

/**
 * Token para GoCreatePayments / public-create-payment.
 * Prefere TEST- (Payments API). APP_USR de test-user automático do painel
 * costuma falhar em /v1/payments com "Unauthorized use of live credentials".
 */
export function getAccessTokenForAppPayments({ preferTest = true } = {}) {
  const test = getTestAccessToken();
  const main = getAccessToken();

  if (preferTest) {
    if (isTestAccessToken(test)) {
      return { accessToken: test, source: 'platform_test', mode: 'test' };
    }
    if (isTestAccessToken(main)) {
      return { accessToken: main, source: 'platform', mode: 'test' };
    }
    // TEST token configurado mas com prefixo inesperado
    if (test) {
      return {
        accessToken: test,
        source: 'platform_test',
        mode: isLiveAccessToken(test) ? 'live' : 'unknown',
      };
    }
  }

  if (main) {
    return {
      accessToken: main,
      source: 'platform',
      mode: isTestAccessToken(main)
        ? 'test'
        : isLiveAccessToken(main)
          ? 'live'
          : 'unknown',
    };
  }
  return null;
}

export function isMercadoPagoConfigured() {
  return Boolean(getAccessToken() || getTestAccessToken());
}

export function isLiveCredentialsUnauthorizedError(err) {
  const msg = String(err?.message || err?.error || err || '');
  const causes = err?.cause || err?.apiResponse?.cause || [];
  const causeText = Array.isArray(causes)
    ? causes.map((c) => c?.description || c?.code || '').join(' ')
    : String(causes || '');
  return /unauthorized use of live credentials/i.test(msg + ' ' + causeText);
}

export function mapMercadoPagoPaymentError(err) {
  if (isLiveCredentialsUnauthorizedError(err)) {
    const mapped = new Error(
      'Credenciais Mercado Pago incompatíveis com Pix (token APP_USR de test-user). ' +
        'Configure MERCADOPAGO_TEST_ACCESS_TOKEN com um Access Token TEST- do painel ' +
        '(Checkout API / Payments) para o preview gerar QR Code.'
    );
    mapped.status = 503;
    mapped.code = 'MP_LIVE_CREDENTIALS_UNAUTHORIZED';
    mapped.cause = err?.cause;
    return mapped;
  }
  const msg = String(err?.message || err?.error || 'Falha ao criar pagamento Mercado Pago.');
  if (/payer email forbidden/i.test(msg)) {
    const mapped = new Error(
      'E-mail do pagador não permitido pelo Mercado Pago. Use um e-mail válido (ex.: comprador@email.com).'
    );
    mapped.status = 400;
    mapped.code = 'MP_PAYER_EMAIL_FORBIDDEN';
    return mapped;
  }
  const mapped = new Error(msg);
  mapped.status = err?.status || err?.statusCode || 502;
  mapped.code = err?.code || 'MP_PAYMENT_FAILED';
  mapped.cause = err?.cause;
  return mapped;
}

function getClient({ preferTest = false } = {}) {
  const resolved = preferTest
    ? getAccessTokenForAppPayments({ preferTest: true })
    : null;
  const accessToken = resolved?.accessToken || getAccessToken() || getTestAccessToken();
  if (!accessToken) {
    const err = new Error(
      'MERCADOPAGO_ACCESS_TOKEN / MERCADOPAGO_TEST_ACCESS_TOKEN não configurado no servidor.'
    );
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

  return 'https://gocreate-app.web.app/api/billing/webhook';
}

export function resolveAppUrl(req) {
  const fromEnv = String(process.env.PUBLIC_APP_URL || '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const proto = req?.headers?.['x-forwarded-proto'] || req?.protocol || 'https';
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  if (host) return `${proto}://${host}`;

  return 'https://gocreate-app.web.app';
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
  const token = getAccessToken() || getTestAccessToken();
  const sandbox = isTestAccessToken(token);

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
  const client = getClient({ preferTest: true });
  const payment = new Payment(client);
  const idempotencyKey = `gocreate-${transactionId}`;
  const payerEmail =
    email && !/@testuser\.com$/i.test(email)
      ? email
      : `user_${userId}@gocreate.app`;

  try {
    const result = await payment.create({
      body: {
        transaction_amount: product.amount,
        description: product.title,
        payment_method_id: 'pix',
        payer: {
          email: payerEmail,
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
  } catch (err) {
    throw mapMercadoPagoPaymentError(err);
  }
}

export async function getPaymentById(paymentId) {
  const client = getClient();
  const payment = new Payment(client);
  return payment.get({ id: String(paymentId) });
}

/**
 * Procura pagamento aprovado (ou o mais recente) por external_reference.
 * Útil no retorno do Checkout Pro quando ainda não temos mpPaymentId.
 */
export async function findPaymentByExternalReference(externalReference) {
  const accessToken = getAccessToken() || getTestAccessToken();
  if (!accessToken || !externalReference) return null;

  const url = new URL('https://api.mercadopago.com/v1/payments/search');
  url.searchParams.set('external_reference', String(externalReference));
  url.searchParams.set('sort', 'date_created');
  url.searchParams.set('criteria', 'desc');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`MP search failed (${res.status}): ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  if (!results.length) return null;
  const approved = results.find((p) => p?.status === 'approved');
  return approved || results[0] || null;
}

/**
 * Valida x-signature do webhook (quando MERCADOPAGO_WEBHOOK_SECRET está definido).
 * Secret = painel MP → Webhooks → Assinatura secreta (NÃO o OAuth Client Secret).
 * Docs: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 *
 * Sem secret: aceita (notification_url / IPN legado).
 * Com secret mas sem headers: aceita com warn (IPN não assina).
 * Com secret + headers: HMAC obrigatório.
 */
export function verifyWebhookSignature({ headers, query, body }) {
  const secret = String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();
  if (!secret) return { ok: true, skipped: true };

  const xSignature = headers['x-signature'] || headers['X-Signature'];
  const xRequestId = headers['x-request-id'] || headers['X-Request-Id'];
  if (!xSignature || !xRequestId) {
    return { ok: true, skipped: 'missing_signature_headers' };
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

  // MP: data.id alfanumérico deve ir em minúsculas no manifest.
  let dataId = String(
    query?.['data.id'] || query?.id || body?.data?.id || ''
  ).trim();
  if (dataId && /[a-zA-Z]/.test(dataId)) {
    dataId = dataId.toLowerCase();
  }

  // Campos ausentes saem do template (doc MP).
  const manifestParts = [];
  if (dataId) manifestParts.push(`id:${dataId}`);
  if (xRequestId) manifestParts.push(`request-id:${xRequestId}`);
  manifestParts.push(`ts:${ts}`);
  const manifest = `${manifestParts.join(';')};`;

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
