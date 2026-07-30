// Rotas de billing / créditos — Mercado Pago (produção).
//
// Fluxo:
// 1. POST /api/billing/create-payment (auth) → Preference (Pro) ou Pix (Turbo)
//    + doc Firestore `transactions` pending (Admin SDK).
// 2. MP notifica POST /api/billing/webhook → valida, marca completed,
//    credita utilizador / atualiza plan via Admin (nunca confiar no cliente).
// 3. GET /api/billing/status/:transactionId (auth) → polling do Pix no PricingModal.
//
// INTEGRAÇÃO FUTURA — Stripe:
// - create-payment com provider=stripe → PaymentIntent / Checkout Session
// - webhook com stripe-signature → constructEvent → mesmo fulfillTransaction()

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

const router = Router();

/**
 * Aplica crédito + plano de forma idempotente (Admin SDK).
 */
async function fulfillTransaction({
  transactionId,
  mpPaymentId,
  paymentStatus,
}) {
  const txRef = db.collection('transactions').doc(transactionId);

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

    firestoreTx.update(txRef, {
      status: 'completed',
      provider: 'mercadopago',
      mpPaymentId: mpPaymentId ? String(mpPaymentId) : null,
      mpStatus: paymentStatus || 'approved',
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

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

    // Turbo → Pix QR; Pro → Checkout Preference (cartão/Pix no MP)
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
        // TODO(stripe): mode: 'stripe_checkout', checkoutUrl
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
      // TODO(stripe): devolver session.url do Stripe Checkout
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
 * GET /api/billing/status/:transactionId
 * Polling do PricingModal (Pix) — só o dono da transaction.
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

    // Se ainda pending e temos mpPaymentId, consulta MP (sandbox/prod)
    if (data.status === 'pending' && data.mpPaymentId && isMercadoPagoConfigured()) {
      try {
        const payment = await getPaymentById(data.mpPaymentId);
        if (payment?.status === 'approved') {
          await fulfillTransaction({
            transactionId,
            mpPaymentId: payment.id,
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
      mpStatus: data.mpStatus || null,
    });
  } catch (err) {
    console.error('[billing/status]', err);
    return res.status(500).json({ error: 'Falha ao consultar status.' });
  }
});

/**
 * POST /api/billing/webhook
 * Mercado Pago Notifications — sem auth de utilizador (Admin + MP).
 * Sempre responde 200 após processar para evitar retries infinitos.
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

    // MP também envia GET-style query; ignoramos topics que não sejam payment
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
      mpPaymentId: paymentId,
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
    // 200 para não reenviar em loop se for erro nosso de negócio; MP reenvia em 5xx
    return res.status(200).json({ ok: false, error: err.message });
  }
});

/**
 * @deprecated Preferir POST /create-payment
 * Mantido para compatibilidade — cria só o intent pending.
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
      message: 'Use POST /api/billing/create-payment para checkout Mercado Pago.',
    });
  } catch (err) {
    console.error('[billing/checkout-intent]', err);
    return res.status(500).json({ error: 'Falha ao criar intent de pagamento.' });
  }
});

export default router;
