/**
 * Stripe Checkout (hosted) — optional international card path alongside Mercado Pago.
 *
 * Env:
 *   STRIPE_SECRET_KEY          (sk_… or rk_…)
 *   STRIPE_WEBHOOK_SECRET      (whsec_…)
 *   PUBLIC_APP_URL             ex: https://gocreate-app.web.app
 *
 * Pro only for now (same product catalog as mercadopago BILLING_PRODUCTS.pro).
 */

import Stripe from 'stripe';
import { BILLING_PRODUCTS } from './mercadopago.js';

let stripeClient = null;

export function getStripeSecretKey() {
  return String(process.env.STRIPE_SECRET_KEY || '').trim();
}

export function isStripeConfigured() {
  return Boolean(getStripeSecretKey());
}

function getStripe() {
  const key = getStripeSecretKey();
  if (!key) {
    const err = new Error('STRIPE_SECRET_KEY não configurado no servidor.');
    err.status = 503;
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }
  return stripeClient;
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
 * Hosted Checkout Session for Pro (mode=payment, one-time).
 * Amount in BRL cents (Stripe minor units).
 */
export async function createProCheckoutSession({
  transactionId,
  userId,
  email,
  appUrl,
}) {
  const product = BILLING_PRODUCTS.pro;
  const stripe = getStripe();
  const base = (appUrl || 'https://gocreate-app.web.app').replace(/\/$/, '');

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: email || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'brl',
          unit_amount: Math.round(Number(product.amount) * 100),
          product_data: {
            name: product.title,
            description: `${product.credits} créditos · plano Pro`,
          },
        },
      },
    ],
    success_url: `${base}/dashboard?billing=stripe_success&tx=${encodeURIComponent(transactionId)}`,
    cancel_url: `${base}/dashboard?billing=stripe_cancel`,
    client_reference_id: transactionId,
    metadata: {
      transactionId,
      userId,
      productId: product.id,
      plan: product.plan || 'pro',
      credits: String(product.credits),
    },
  });

  return {
    sessionId: session.id,
    checkoutUrl: session.url,
  };
}

/**
 * Verify Stripe webhook signature. Requires raw body Buffer/string.
 */
export function constructStripeEvent(rawBody, signatureHeader) {
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    const err = new Error('STRIPE_WEBHOOK_SECRET não configurado.');
    err.status = 503;
    err.code = 'STRIPE_WEBHOOK_NOT_CONFIGURED';
    throw err;
  }
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);
}
