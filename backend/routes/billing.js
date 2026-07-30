// Rotas de billing / créditos — Mercado Pago (Brasil) + Stripe Checkout (internacional).
//
// Fluxo MP:
// 1. POST /api/billing/create-payment (auth) → Preference (Pro) ou Pix (Turbo)
// 2. POST /api/billing/webhook → valida, fulfillTransaction()
// 3. GET /api/billing/status/:transactionId (auth) → polling Pix
//
// Fluxo Stripe (opcional — requer STRIPE_SECRET_KEY):
// 1. POST /api/billing/stripe-checkout (auth) → Checkout Session (Pro)
// 2. POST /api/billing/stripe-webhook (raw body) → checkout.session.completed → fulfill

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import admin from '../config/firebaseAdmin.js';
import { db } from '../config/firebaseAdmin.js';
import {
  BILLING_PRODUCTS,
  isMercadoPagoConfigured,
  createCheckoutPreference,
  createPixPayment,
  getPaymentById,
  verifyWebhookSignature,
  extractPaymentIdFromNotification,
  resolveNotificationUrl,
  resolveAppUrl,
} from '../services/mercadopago.js';
import {
  isStripeConfigured,
  createProCheckoutSession,
  constructStripeEvent,
  resolveAppUrl as resolveStripeAppUrl,
} from '../services/stripe.js';

const router = Router();

/**
 * Aplica crédito + plano de forma idempotente (Admin SDK).
 */
export async function fulfillTransaction({
  transactionId,
  provider = 'mercadopago',
  providerPaymentId = null,
  paymentStatus = 'approved',
  // legacy aliases
  mpPaymentId = null,
}) {
  const txRef = db.collection('transactions').doc(transactionId);
  const externalId = providerPaymentId || mpPaymentId;

  return db.runTransaction(async (firestoreTx) => {
    const snap = await firestoreTx.get(txRef);
    if (!snap.exists) {
      const err = new Error(`Transaction ${transactionId} não encontrada.`);
      err.status = 404;
      throw err;
    }

    const data = snap.data() || {};
    if (data.status === 'completed') {
      return { alreadyCompleted: true, data };
    }

    const credits = Number(data.credits) || 0;
    const userId = data.userId;
    if (!userId) {
      const err = new Error('Transaction sem userId.');
      err.status = 400;
      throw err;
    }

    const txUpdate = {
      status: 'completed',
      provider,
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (provider === 'stripe') {
      txUpdate.stripeSessionId = externalId ? String(externalId) : null;
      txUpdate.stripeStatus = paymentStatus || 'paid';
    } else {
      txUpdate.mpPaymentId = externalId ? String(externalId) : null;
      txUpdate.mpStatus = paymentStatus || 'approved';
    }
    firestoreTx.update(txRef, txUpdate);

    const userRef = db.collection('users').doc(userId);
    const userUpdate = {
      credits: admin.firestore.FieldValue.increment(credits),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (data.type === 'subscription' && data.plan) {
      userUpdate.plan = data.plan;
    }
    firestoreTx.set(userRef, userUpdate, { merge: true });

    return { alreadyCompleted: false, data, credits };
  });
}

/**
 * POST /api/billing/create-payment
 * Body: { productId: 'pro' | 'turbo' }
 */
router.post('/create-payment', requireAuth, async (req, res) => {
  try {
    if (!isMercadoPagoConfigured()) {
      return res.status(503).json({
        error: 'MERCADOPAGO_ACCESS_TOKEN não configurado.',
        code: 'MP_NOT_CONFIGURED',
        message:
          'Pagamentos Mercado Pago ainda não estão ativos. Adicione MERCADOPAGO_ACCESS_TOKEN no backend/functions.',
      });
    }

    const productId = String(req.body?.productId || req.body?.plan || '').toLowerCase();
    const product = BILLING_PRODUCTS[productId];
    if (!product) {
      return res.status(400).json({
        error: 'productId inválido. Use "pro" ou "turbo".',
      });
    }

    const notificationUrl = resolveNotificationUrl(req);
    const appUrl = resolveAppUrl(req);
    const email = req.user.email || null;

    const txRef = db.collection('transactions').doc();
    const transactionId = txRef.id;

    await txRef.set({
      userId: req.user.uid,
      amount: product.amount,
      credits: product.credits,
      type: product.type,
      plan: product.plan || product.id,
      status: 'pending',
      provider: 'mercadopago',
      productId: product.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (product.id === 'turbo') {
      const pix = await createPixPayment({
        product,
        transactionId,
        userId: req.user.uid,
        email,
        notificationUrl,
      });

      await txRef.update({
        mpPaymentId: pix.paymentId ? String(pix.paymentId) : null,
        mpStatus: pix.status || 'pending',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(201).json({
        provider: 'mercadopago',
        mode: 'pix',
        transactionId,
        paymentId: pix.paymentId,
        status: pix.status,
        amount: product.amount,
        credits: product.credits,
        qrCode: pix.qrCode,
        qrCodeBase64: pix.qrCodeBase64,
        ticketUrl: pix.ticketUrl,
      });
    }

    const pref = await createCheckoutPreference({
      product,
      transactionId,
      userId: req.user.uid,
      email,
      notificationUrl,
      appUrl,
    });

    await txRef.update({
      mpPreferenceId: pref.preferenceId || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({
      provider: 'mercadopago',
      mode: 'checkout',
      transactionId,
      preferenceId: pref.preferenceId,
      checkoutUrl: pref.initPoint,
      amount: product.amount,
      credits: product.credits,
      stripeAvailable: isStripeConfigured(),
    });
  } catch (err) {
    console.error('[billing/create-payment]', err);
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'Falha ao criar pagamento.',
      code: err.code || undefined,
    });
  }
});

/**
 * POST /api/billing/stripe-checkout
 * Body: { productId?: 'pro' } — Pro only (international card via Stripe Checkout).
 */
router.post('/stripe-checkout', requireAuth, async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({
        error: 'STRIPE_SECRET_KEY não configurado.',
        code: 'STRIPE_NOT_CONFIGURED',
        message:
          'Pagamentos Stripe ainda não estão ativos. Adicione STRIPE_SECRET_KEY no functions/.env e redeploy.',
      });
    }

    const productId = String(req.body?.productId || 'pro').toLowerCase();
    if (productId !== 'pro') {
      return res.status(400).json({
        error: 'Stripe Checkout disponível apenas para o plano Pro. Use Mercado Pago para Turbo/Pix.',
      });
    }

    const product = BILLING_PRODUCTS.pro;
    const appUrl = resolveStripeAppUrl(req);
    const email = req.user.email || null;

    const txRef = db.collection('transactions').doc();
    const transactionId = txRef.id;

    await txRef.set({
      userId: req.user.uid,
      amount: product.amount,
      credits: product.credits,
      type: product.type,
      plan: product.plan || product.id,
      status: 'pending',
      provider: 'stripe',
      productId: product.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const session = await createProCheckoutSession({
      transactionId,
      userId: req.user.uid,
      email,
      appUrl,
    });

    await txRef.update({
      stripeSessionId: session.sessionId || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({
      provider: 'stripe',
      mode: 'stripe_checkout',
      transactionId,
      sessionId: session.sessionId,
      checkoutUrl: session.checkoutUrl,
      amount: product.amount,
      credits: product.credits,
    });
  } catch (err) {
    console.error('[billing/stripe-checkout]', err);
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'Falha ao criar Stripe Checkout.',
      code: err.code || undefined,
    });
  }
});

/**
 * GET /api/billing/providers — which gateways are configured (no secrets).
 */
router.get('/providers', (_req, res) => {
  res.json({
    mercadopago: isMercadoPagoConfigured(),
    stripe: isStripeConfigured(),
  });
});

/**
 * GET /api/billing/status/:transactionId
 */
router.get('/status/:transactionId', requireAuth, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const snap = await db.collection('transactions').doc(transactionId).get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Transaction não encontrada.' });
    }
    const data = snap.data() || {};
    if (data.userId !== req.user.uid) {
      return res.status(403).json({ error: 'Sem permissão.' });
    }

    if (data.status === 'pending' && data.mpPaymentId && isMercadoPagoConfigured()) {
      try {
        const payment = await getPaymentById(data.mpPaymentId);
        if (payment?.status === 'approved') {
          await fulfillTransaction({
            transactionId,
            provider: 'mercadopago',
            providerPaymentId: payment.id,
            paymentStatus: payment.status,
          });
          return res.json({
            transactionId,
            status: 'completed',
            credits: data.credits,
            plan: data.plan,
          });
        }
        return res.json({
          transactionId,
          status: 'pending',
          mpStatus: payment?.status || data.mpStatus || null,
        });
      } catch (pollErr) {
        console.warn('[billing/status] poll MP:', pollErr?.message || pollErr);
      }
    }

    return res.json({
      transactionId,
      status: data.status,
      credits: data.credits,
      plan: data.plan,
      provider: data.provider || null,
      mpStatus: data.mpStatus || null,
    });
  } catch (err) {
    console.error('[billing/status]', err);
    return res.status(500).json({ error: 'Falha ao consultar status.' });
  }
});

/**
 * POST /api/billing/webhook — Mercado Pago Notifications
 */
router.post('/webhook', async (req, res) => {
  try {
    const sig = verifyWebhookSignature({
      headers: req.headers,
      query: req.query,
      body: req.body,
    });
    if (!sig.ok) {
      console.warn('[billing/webhook] assinatura inválida:', sig.reason);
      return res.status(401).json({ error: 'Assinatura inválida.' });
    }

    const topic = req.query?.topic || req.query?.type || req.body?.type || req.body?.action;
    const paymentId = extractPaymentIdFromNotification(req);

    const isPayment =
      !topic ||
      String(topic).includes('payment') ||
      req.body?.action?.includes?.('payment');

    if (!paymentId || !isPayment) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    if (!isMercadoPagoConfigured()) {
      console.warn('[billing/webhook] MP não configurado — notificação ignorada.');
      return res.status(200).json({ ok: true, skipped: 'MP_NOT_CONFIGURED' });
    }

    const payment = await getPaymentById(paymentId);
    const status = payment?.status;
    const transactionId =
      payment?.external_reference ||
      payment?.metadata?.transactionId ||
      null;

    if (!transactionId) {
      console.warn('[billing/webhook] payment sem external_reference:', paymentId);
      return res.status(200).json({ ok: true, ignored: 'no_external_reference' });
    }

    if (status !== 'approved') {
      await db
        .collection('transactions')
        .doc(String(transactionId))
        .set(
          {
            mpPaymentId: String(paymentId),
            mpStatus: status || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      return res.status(200).json({ ok: true, status });
    }

    const result = await fulfillTransaction({
      transactionId: String(transactionId),
      provider: 'mercadopago',
      providerPaymentId: paymentId,
      paymentStatus: status,
    });

    console.log(
      '[billing/webhook] fulfilled',
      transactionId,
      result.alreadyCompleted ? '(idempotent)' : `+${result.credits} credits`
    );

    return res.status(200).json({
      ok: true,
      transactionId,
      alreadyCompleted: result.alreadyCompleted,
    });
  } catch (err) {
    console.error('[billing/webhook]', err);
    return res.status(200).json({ ok: false, error: err.message });
  }
});

/**
 * Stripe webhook handler — must be mounted with express.raw({ type: 'application/json' }).
 * Exported for app.js (raw body before JSON parser).
 */
export async function stripeWebhookHandler(req, res) {
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature.' });
    }

    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody) && typeof rawBody !== 'string') {
      console.error('[billing/stripe-webhook] body não é raw — verifique middleware.');
      return res.status(400).json({ error: 'Raw body required.' });
    }

    let event;
    try {
      event = constructStripeEvent(rawBody, signature);
    } catch (err) {
      console.warn('[billing/stripe-webhook] assinatura inválida:', err?.message);
      return res.status(401).json({ error: 'Assinatura inválida.' });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object || {};
      const transactionId =
        session.client_reference_id ||
        session.metadata?.transactionId ||
        null;

      if (!transactionId) {
        console.warn('[billing/stripe-webhook] session sem transactionId');
        return res.status(200).json({ ok: true, ignored: 'no_transaction' });
      }

      if (session.payment_status === 'paid' || session.status === 'complete') {
        const result = await fulfillTransaction({
          transactionId: String(transactionId),
          provider: 'stripe',
          providerPaymentId: session.id,
          paymentStatus: session.payment_status || 'paid',
        });
        console.log(
          '[billing/stripe-webhook] fulfilled',
          transactionId,
          result.alreadyCompleted ? '(idempotent)' : `+${result.credits} credits`
        );
      }
    }

    return res.status(200).json({ ok: true, type: event.type });
  } catch (err) {
    console.error('[billing/stripe-webhook]', err);
    return res.status(200).json({ ok: false, error: err.message });
  }
}

/**
 * @deprecated Preferir POST /create-payment
 */
router.post('/checkout-intent', requireAuth, async (req, res) => {
  try {
    const { plan, type, amount, credits, provider } = req.body || {};
    if (!type || typeof amount !== 'number' || typeof credits !== 'number') {
      return res.status(400).json({ error: 'type, amount e credits são obrigatórios.' });
    }

    const ref = db.collection('transactions').doc();
    await ref.set({
      userId: req.user.uid,
      amount,
      credits,
      type,
      plan: plan || null,
      status: 'pending',
      provider: provider || 'mercadopago',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({
      transactionId: ref.id,
      status: 'pending',
      message: 'Use POST /api/billing/create-payment ou /stripe-checkout.',
    });
  } catch (err) {
    console.error('[billing/checkout-intent]', err);
    return res.status(500).json({ error: 'Falha ao criar intent de pagamento.' });
  }
});

export default router;
