// Cliente billing — Mercado Pago Payment Brick (modal GoCreate).

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function billingUrl(path) {
  return `${API_URL}/api/billing${path}`;
}

/**
 * Inicia checkout Brick (Pro ou Turbo).
 * Resposta: mode=brick + preferenceId + publicKey + transactionId.
 * @param {{ productId: 'pro'|'turbo', idToken: string }} opts
 */
export async function createPayment({ productId, idToken }) {
  const res = await fetch(billingUrl('/create-payment'), {
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
 * Processa formData do Payment Brick → POST /api/billing/process-payment.
 * @param {{ transactionId: string, formData: object, selectedPaymentMethod?: string, idToken: string }} opts
 */
export async function processPayment({
  transactionId,
  formData,
  selectedPaymentMethod,
  idToken,
}) {
  const res = await fetch(billingUrl('/process-payment'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      transactionId,
      formData,
      selectedPaymentMethod: selectedPaymentMethod || undefined,
    }),
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
 * @returns {Promise<{ mercadopago: boolean, brick?: boolean, publicKey?: string|null, products?: object }>}
 */
export async function getBillingConfig() {
  try {
    const res = await fetch(billingUrl('/config'));
    if (!res.ok) return { mercadopago: false, publicKey: null, brick: false };
    return await res.json();
  } catch {
    return { mercadopago: false, publicKey: null, brick: false };
  }
}

/**
 * @returns {Promise<{ mercadopago: boolean, brick?: boolean }>}
 */
export async function getBillingProviders() {
  try {
    const res = await fetch(billingUrl('/providers'));
    if (!res.ok) return { mercadopago: false, brick: false };
    return await res.json();
  } catch {
    return { mercadopago: false, brick: false };
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
  getBillingConfig,
  getBillingProviders,
  getPaymentStatus,
};
