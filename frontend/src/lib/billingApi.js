// Cliente billing — Mercado Pago Pix (modal GoCreate).

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function billingUrl(path) {
  return `${API_URL}/api/billing${path}`;
}

/**
 * Cria pagamento Pix (Pro ou Turbo). Sempre mode=pix no backend.
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
 * @returns {Promise<{ mercadopago: boolean, products?: object }>}
 */
export async function getBillingConfig() {
  try {
    const res = await fetch(billingUrl('/config'));
    if (!res.ok) return { mercadopago: false, publicKey: null };
    return await res.json();
  } catch {
    return { mercadopago: false, publicKey: null };
  }
}

/**
 * @returns {Promise<{ mercadopago: boolean }>}
 */
export async function getBillingProviders() {
  try {
    const res = await fetch(billingUrl('/providers'));
    if (!res.ok) return { mercadopago: false };
    return await res.json();
  } catch {
    return { mercadopago: false };
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
  getBillingConfig,
  getBillingProviders,
  getPaymentStatus,
};
