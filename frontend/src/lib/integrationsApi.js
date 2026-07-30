// Cliente Integrações — connect / status / create-payment.
// VITE_API_URL vazio → same-origin /api/* (Hosting → gocreateApi).

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function integrationsUrl(path) {
  return `${API_URL}/api/integrations${path}`;
}

async function parseJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function authHeaders(idToken, json = false) {
  const headers = { Authorization: `Bearer ${idToken}` };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

/**
 * Lista estado de todas as integrações do utilizador + flags de plataforma.
 * @param {{ idToken: string }} opts
 */
export async function getIntegrationsStatus({ idToken }) {
  const res = await fetch(integrationsUrl('/status'), {
    headers: authHeaders(idToken),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(data?.error || `Erro HTTP ${res.status}`);
  }
  return data;
}

/**
 * Liga uma integração com API keys / tokens (Admin guarda em secrets).
 * @param {{ idToken: string, providerId: string, credentials: Record<string, string> }} opts
 */
export async function connectIntegration({ idToken, providerId, credentials }) {
  const res = await fetch(integrationsUrl(`/connect/${encodeURIComponent(providerId)}`), {
    method: 'POST',
    headers: authHeaders(idToken, true),
    body: JSON.stringify({ credentials }),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Erro HTTP ${res.status}`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

/**
 * Desliga integração (remove secrets + meta).
 * @param {{ idToken: string, providerId: string }} opts
 */
export async function disconnectIntegration({ idToken, providerId }) {
  const res = await fetch(integrationsUrl(`/disconnect/${encodeURIComponent(providerId)}`), {
    method: 'POST',
    headers: authHeaders(idToken, true),
    body: JSON.stringify({}),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(data?.error || `Erro HTTP ${res.status}`);
  }
  return data;
}

/**
 * Cria pagamento Pix/Preference no projeto do utilizador (MP ligado).
 * @param {{ idToken: string, projectId: string, amount: number, description?: string, payerEmail?: string, method?: 'pix'|'preference' }} opts
 */
export async function createMercadoPagoPayment({
  idToken,
  projectId,
  amount,
  description,
  payerEmail,
  method = 'pix',
}) {
  const res = await fetch(integrationsUrl('/mercadopago/create-payment'), {
    method: 'POST',
    headers: authHeaders(idToken, true),
    body: JSON.stringify({ projectId, amount, description, payerEmail, method }),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Erro HTTP ${res.status}`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

/**
 * Checkout público (página publicada) — usa credenciais do owner do projeto.
 */
export async function createPublicMercadoPagoPayment({
  projectId,
  amount,
  description,
  payerEmail,
  method = 'pix',
}) {
  const res = await fetch(integrationsUrl('/mercadopago/public-create-payment'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, amount, description, payerEmail, method }),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Erro HTTP ${res.status}`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

/**
 * Stripe PaymentIntent / Checkout Session para projeto (owner auth).
 */
export async function createStripeProjectPayment({
  idToken,
  projectId,
  amount,
  description,
  currency = 'brl',
  mode = 'payment_intent',
}) {
  const res = await fetch(integrationsUrl('/stripe/create-payment'), {
    method: 'POST',
    headers: authHeaders(idToken, true),
    body: JSON.stringify({ projectId, amount, description, currency, mode }),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Erro HTTP ${res.status}`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

export default {
  getIntegrationsStatus,
  connectIntegration,
  disconnectIntegration,
  createMercadoPagoPayment,
  createPublicMercadoPagoPayment,
  createStripeProjectPayment,
};
