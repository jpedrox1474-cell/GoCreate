// Rotas de billing / créditos — Mercado Pago Payment Brick (modal GoCreate).
//
// Fluxo Pro + Turbo (checkout transparente in-app):
// 1. GET  /api/billing/config (público) → publicKey + produtos
// 2. POST /api/billing/create-payment (auth) → preferenceId p/ Payment Brick
// 3. POST /api/billing/process-payment (auth) → formData do Brick → /v1/payments
// 4. GET  /api/billing/status/:transactionId (auth) → polling até approved
// 5. POST /api/billing/webhook → valida, fulfillTransaction()
//
// createPixPayment fica só como fallback interno se Brick/publicKey falhar.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import admin from '../config/firebaseAdmin.js';
import { db } from '../config/firebaseAdmin.js';
import {
  BILLING_PRODUCTS,
  isMercadoPagoConfigured,
  isMercadoPagoBillingEnabled,
  isMercadoPagoBillingReady,
  getPublicKey,
  isPublicKeyConfigured,
  createCheckoutPreference,
  createPixPayment,
  processBrickPayment,
  getPaymentById,
  findPaymentByExternalReference,
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
  }).then(async (result) => {
    if (!result?.alreadyCompleted) {
      await maybeSendBillingReceipt(result, transactionId).catch((err) => {
        console.warn('[billing/fulfill] receipt email', err?.message || err);
      });
    }
    return result;
  });
}

async function maybeSendBillingReceipt(result, transactionId) {
  const { sendBillingReceiptEmail, isResendConfigured } = await import(
    '../services/resendMail.js'
  );
  if (!isResendConfigured()) return;
  const data = result?.data || {};
  let email = data.email || null;
  if (!email && data.userId) {
    try {
      const userSnap = await db.collection('users').doc(data.userId).get();
      email = userSnap.data()?.email || null;
    } catch {
      /* ignore */
    }
    if (!email) {
      try {
        const userRecord = await admin.auth().getUser(data.userId);
        email = userRecord.email || null;
      } catch {
        /* ignore */
      }
    }
  }
  if (!email) return;

  const productId = data.productId || data.plan;
  const product = productId ? BILLING_PRODUCTS[String(productId).toLowerCase()] : null;
  await sendBillingReceiptEmail({
    to: email,
    productLabel: product?.title || data.plan || data.productId || 'GoCreate',
    amount: data.amount ?? product?.amount,
    credits: result.credits ?? data.credits,
    currency: product?.currency || 'BRL',
    transactionId: transactionId || null,
    plan: data.plan || product?.plan,
  });
}

/**
 * POST /api/billing/create-payment
 * Body: { productId: 'pro' | 'turbo' }
 * Cria transaction + preference para Payment Brick (Pix/cartão/boleto/Conta MP).
 * Sem redirect Checkout Pro como fluxo primário.
 */
router.post('/create-payment', requireAuth, async (req, res) => {
  try {
    if (!isMercadoPagoBillingEnabled()) {
      return res.status(503).json({
        error: 'Billing Mercado Pago temporariamente desativado.',
        code: 'MP_BILLING_DISABLED',
        message:
          'Billing Mercado Pago está desativado (MERCADOPAGO_BILLING_ENABLED=false).',
      });
    }
    if (!isMercadoPagoConfigured()) {
      return res.status(503).json({
        error: 'MERCADOPAGO_ACCESS_TOKEN não configurado.',
        code: 'MP_NOT_CONFIGURED',
        message:
          'Pagamentos Mercado Pago ainda não estão ativos. Adicione MERCADOPAGO_ACCESS_TOKEN no backend/functions.',
      });
    }

    const publicKey = getPublicKey();
    if (!publicKey) {
      return res.status(503).json({
        error: 'MERCADOPAGO_PUBLIC_KEY não configurada.',
        code: 'MP_PUBLIC_KEY_MISSING',
        message:
          'Checkout transparente precisa de MERCADOPAGO_PUBLIC_KEY (TEST-… ou APP_USR-…) no servidor.',
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
      email: email || null,
      amount: product.amount,
      credits: product.credits,
      type: product.type,
      plan: product.plan || product.id,
      status: 'pending',
      provider: 'mercadopago',
      productId: product.id,
      checkoutMode: 'brick',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const preference = await createCheckoutPreference({
      product,
      transactionId,
      userId: req.user.uid,
      email,
      notificationUrl,
      appUrl,
      purpose: 'wallet_purchase',
    });

    if (!preference?.preferenceId) {
      console.error('[billing/create-payment] preference sem id', preference);
      return res.status(502).json({
        error: 'Mercado Pago não devolveu preferenceId para o Payment Brick.',
        code: 'MP_PREFERENCE_MISSING',
      });
    }

    await txRef.update({
      mpPreferenceId: String(preference.preferenceId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({
      provider: 'mercadopago',
      mode: 'brick',
      transactionId,
      preferenceId: preference.preferenceId,
      publicKey,
      amount: product.amount,
      credits: product.credits,
      plan: product.plan || null,
      title: product.title,
      // init_point só para fallback manual — UI não redireciona por defeito
      checkoutUrl: preference.initPoint || null,
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
 * POST /api/billing/process-payment
 * Body: { transactionId, formData, selectedPaymentMethod? }
 * Recebe formData do Payment Brick e cria o pagamento na API MP.
 */
router.post('/process-payment', requireAuth, async (req, res) => {
  try {
    if (!isMercadoPagoBillingEnabled()) {
      return res.status(503).json({
        error: 'Billing Mercado Pago temporariamente desativado.',
        code: 'MP_BILLING_DISABLED',
        message: 'Assinatura via Mercado Pago está indisponível de momento.',
      });
    }
    if (!isMercadoPagoConfigured()) {
      return res.status(503).json({
        error: 'MERCADOPAGO_ACCESS_TOKEN não configurado.',
        code: 'MP_NOT_CONFIGURED',
      });
    }

    const transactionId = String(req.body?.transactionId || '').trim();
    const formData = req.body?.formData;
    if (!transactionId) {
      return res.status(400).json({ error: 'transactionId é obrigatório.' });
    }
    if (!formData || typeof formData !== 'object') {
      return res.status(400).json({ error: 'formData do Payment Brick é obrigatório.' });
    }

    const snap = await db.collection('transactions').doc(transactionId).get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Transaction não encontrada.' });
    }
    const tx = snap.data() || {};
    if (tx.userId !== req.user.uid) {
      return res.status(403).json({ error: 'Sem permissão.' });
    }
    if (tx.status === 'completed') {
      return res.json({
        transactionId,
        status: 'approved',
        alreadyCompleted: true,
        credits: tx.credits,
        plan: tx.plan,
      });
    }

    const productId = String(tx.productId || tx.plan || 'pro').toLowerCase();
    const product = BILLING_PRODUCTS[productId] || {
      id: productId,
      title: tx.plan ? `GoCreate ${tx.plan}` : 'GoCreate',
      amount: Number(tx.amount) || 0,
      credits: Number(tx.credits) || 0,
      type: tx.type || 'subscription',
      plan: tx.plan || productId,
      currency: 'BRL',
    };

    const notificationUrl = resolveNotificationUrl(req);
    const result = await processBrickPayment({
      formData,
      product,
      transactionId,
      userId: req.user.uid,
      email: req.user.email || null,
      notificationUrl,
    });

    await db
      .collection('transactions')
      .doc(transactionId)
      .set(
        {
          mpPaymentId: result.paymentId ? String(result.paymentId) : null,
          mpStatus: result.status || null,
          mpStatusDetail: result.statusDetail || null,
          mpPaymentMethodId: result.paymentMethodId || null,
          selectedPaymentMethod: req.body?.selectedPaymentMethod || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    if (result.status === 'approved') {
      await fulfillTransaction({
        transactionId,
        provider: 'mercadopago',
        providerPaymentId: result.paymentId,
        paymentStatus: result.status,
      });
    }

    return res.status(201).json({
      provider: 'mercadopago',
      mode: 'brick',
      transactionId,
      paymentId: result.paymentId,
      status: result.status,
      statusDetail: result.statusDetail,
      paymentMethodId: result.paymentMethodId,
      paymentTypeId: result.paymentTypeId,
      amount: product.amount,
      credits: product.credits,
      plan: product.plan,
      qrCode: result.qrCode,
      qrCodeBase64: result.qrCodeBase64,
      ticketUrl: result.ticketUrl,
      barcode: result.barcode,
    });
  } catch (err) {
    console.error('[billing/process-payment]', err);
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'Falha ao processar pagamento.',
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
      email: email || null,
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
    mercadopago: isMercadoPagoBillingReady(),
    stripe: isStripeConfigured(),
    brick: isMercadoPagoBillingReady() && isPublicKeyConfigured(),
    mercadopagoBillingEnabled: isMercadoPagoBillingEnabled(),
  });
});

/**
 * GET /api/billing/config — chave pública + catálogo (sem access token).
 */
router.get('/config', (_req, res) => {
  const billingOn = isMercadoPagoBillingReady();
  const publicKey = billingOn ? getPublicKey() : null;
  res.json({
    mercadopago: billingOn,
    brick: Boolean(publicKey) && billingOn,
    publicKey: publicKey || null,
    stripe: isStripeConfigured(),
    mercadopagoBillingEnabled: isMercadoPagoBillingEnabled(),
    products: Object.fromEntries(
      Object.entries(BILLING_PRODUCTS).map(([id, p]) => [
        id,
        {
          id: p.id,
          title: p.title,
          amount: p.amount,
          credits: p.credits,
          currency: p.currency || 'BRL',
          type: p.type,
          plan: p.plan,
        },
      ])
    ),
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

    if (data.status === 'pending' && isMercadoPagoConfigured()) {
      try {
        let payment = null;
        if (data.mpPaymentId) {
          payment = await getPaymentById(data.mpPaymentId);
        } else {
          payment = await findPaymentByExternalReference(transactionId);
        }
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
        if (payment) {
          return res.json({
            transactionId,
            status: 'pending',
            mpStatus: payment?.status || data.mpStatus || null,
          });
        }
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
 * GET  /api/billing/webhook — IPN legado (?topic=payment&id=…)
 */
async function handleMercadoPagoWebhook(req, res) {
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
    if (sig.skipped === 'missing_signature_headers') {
      console.warn(
        '[billing/webhook] sem x-signature — a aceitar (IPN). Configure MERCADOPAGO_WEBHOOK_SECRET só com a Assinatura secreta do painel Webhooks.'
      );
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
}

router.post('/webhook', handleMercadoPagoWebhook);
router.get('/webhook', handleMercadoPagoWebhook);

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
      message: 'Use POST /api/billing/create-payment (Pix).',
    });
  } catch (err) {
    console.error('[billing/checkout-intent]', err);
    return res.status(500).json({ error: 'Falha ao criar intent de pagamento.' });
  }
});

export default router;
