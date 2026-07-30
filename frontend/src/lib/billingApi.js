// Cliente billing — Mercado Pago create-payment + status poll.
// VITE_API_URL vazio → same-origin /api/* (Hosting → gocreateApi).

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function billingUrl(path) {
  return `${API_URL}/api/billing${path}`;
}

/**
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

export default { createPayment, getPaymentStatus };
