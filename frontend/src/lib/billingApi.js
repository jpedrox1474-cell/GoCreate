// Cliente billing — Mercado Pago Payment Brick + Pix + Stripe.

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function billingUrl(path) {
  return `${API_URL}/api/billing${path}`;
}

/**
 * @param {{ productId: 'pro'|'turbo', idToken: string, mode?: 'brick'|'checkout' }} opts
 */
export async function createPayment({ productId, idToken, mode }) {
  const body = { productId };
  if (mode) body.mode = mode;

  const res = await fetch(billingUrl('/create-payment'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Erro HTTP ${res.status}`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }

  return data;
}

/**
 * Processa formData do Payment Brick.
 * @param {{ transactionId: string, formData: object, selectedPaymentMethod?: string, idToken: string }} opts
 */
export async function processPayment({ transactionId, formData, selectedPaymentMethod, idToken }) {
  const res = await fetch(billingUrl('/process-payment'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ transactionId, formData, selectedPaymentMethod }),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Erro HTTP ${res.status}`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }

  return data;
}

/**
 * Stripe Checkout Session for Pro (international card).
 * @param {{ productId?: 'pro', idToken: string }} opts
 */
export async function createStripeCheckout({ productId = 'pro', idToken }) {
  const res = await fetch(billingUrl('/stripe-checkout'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ productId }),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Erro HTTP ${res.status}`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }

  return data;
}

/**
 * @returns {Promise<{ mercadopago: boolean, stripe: boolean, brick?: boolean, publicKey?: string|null, products?: object }>}
 */
export async function getBillingConfig() {
  try {
    const res = await fetch(billingUrl('/config'));
    if (!res.ok) return { mercadopago: false, stripe: false, brick: false, publicKey: null };
    return await res.json();
  } catch {
    return { mercadopago: false, stripe: false, brick: false, publicKey: null };
  }
}

/**
 * @returns {Promise<{ mercadopago: boolean, stripe: boolean, brick?: boolean }>}
 */
export async function getBillingProviders() {
  try {
    const res = await fetch(billingUrl('/providers'));
    if (!res.ok) return { mercadopago: false, stripe: false, brick: false };
    return await res.json();
  } catch {
    return { mercadopago: false, stripe: false, brick: false };
  }
}

/**
 * @param {{ transactionId: string, idToken: string }} opts
 */
export async function getPaymentStatus({ transactionId, idToken }) {
  const res = await fetch(billingUrl(`/status/${encodeURIComponent(transactionId)}`), {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    throw new Error(data?.error || `Erro HTTP ${res.status}`);
  }

  return data;
}

export default {
  createPayment,
  processPayment,
  createStripeCheckout,
  getBillingConfig,
  getBillingProviders,
  getPaymentStatus,
};
