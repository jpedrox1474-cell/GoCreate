// Rotas de billing / créditos.
//
// INTEGRAÇÃO FUTURA — Stripe / Mercado Pago:
// 1. Checkout (frontend PricingModal) cria PaymentIntent / Preference e um doc
//    `transactions` com status: 'pending'.
// 2. O provedor chama POST /api/billing/webhook com a assinatura no header.
// 3. Este handler valida a assinatura, marca a transaction como 'completed'
//    e credita o utilizador via Admin SDK (FieldValue.increment).
// 4. Nunca confiar no cliente para incrementar credits.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import admin from '../config/firebaseAdmin.js';
import { db } from '../config/firebaseAdmin.js';

const router = Router();

/**
 * POST /api/billing/webhook
 * Placeholder — Stripe (stripe-signature) ou Mercado Pago (x-signature).
 * Quando ativo: verificar assinatura → ler userId/credits → Admin increment.
 */
router.post('/webhook', async (req, res) => {
  // TODO(stripe): const event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  // TODO(mercadopago): validar x-signature / x-request-id e payload.type === 'payment'
  // TODO: após pagamento aprovado:
  //   await db.collection('transactions').doc(txId).update({ status: 'completed', provider: 'stripe'|'mercadopago' });
  //   await db.collection('users').doc(userId).update({ credits: admin.firestore.FieldValue.increment(credits) });

  console.warn('[billing/webhook] Recebido mas ainda não implementado. Body keys:', Object.keys(req.body || {}));
  return res.status(501).json({
    message: 'Webhook de billing ainda não configurado (Stripe / Mercado Pago).',
  });
});

/**
 * POST /api/billing/checkout-intent
 * Cria um transaction pending (estrutura pronta para o webhook completar).
 * O frontend PricingModal também pode criar pending direto no Firestore.
 */
router.post('/checkout-intent', requireAuth, async (req, res) => {
  try {
    const { plan, type, amount, credits, provider } = req.body || {};
    if (!type || typeof amount !== 'number' || typeof credits !== 'number') {
      return res.status(400).json({ error: 'type, amount e credits são obrigatórios.' });
    }

    const ref = db.collection('transactions').doc();
    const payload = {
      userId: req.user.uid,
      amount,
      credits,
      type, // 'subscription' | 'topup'
      plan: plan || null,
      status: 'pending',
      provider: provider || null, // 'stripe' | 'mercadopago' | null
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(payload);

    // TODO(stripe|mp): devolver checkoutUrl do provedor aqui
    return res.status(201).json({
      transactionId: ref.id,
      status: 'pending',
      message: 'Intent criado. Checkout do provedor em breve.',
    });
  } catch (err) {
    console.error('[billing/checkout-intent]', err);
    return res.status(500).json({ error: 'Falha ao criar intent de pagamento.' });
  }
});

export default router;
