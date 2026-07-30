// Cliente canais premium — WhatsApp Evolution + Meta (Instagram/Facebook).
// Proxy no backend; VPS keys nunca no browser.

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

function throwIfError(res, data, fallback) {
  if (res.ok) return data;
  const err = new Error(data?.message || data?.error || fallback || `Erro HTTP ${res.status}`);
  err.status = res.status;
  err.code = data?.code;
  err.details = data?.details;
  throw err;
}

/** Gera QR / pairing via proxy Evolution (premium). */
export async function requestWhatsAppQr({ idToken }) {
  const res = await fetch(integrationsUrl('/whatsapp/qr'), {
    method: 'POST',
    headers: authHeaders(idToken, true),
    body: JSON.stringify({}),
  });
  const data = await parseJson(res);
  return throwIfError(res, data, 'Falha ao gerar QR WhatsApp.');
}

/** Polling connectionState Evolution. */
export async function checkWhatsAppConnection({ idToken, instanceName }) {
  const q = instanceName ? `?instanceName=${encodeURIComponent(instanceName)}` : '';
  const res = await fetch(integrationsUrl(`/whatsapp/connection${q}`), {
    headers: authHeaders(idToken),
  });
  const data = await parseJson(res);
  return throwIfError(res, data, 'Falha ao verificar WhatsApp.');
}

export async function disconnectWhatsApp({ idToken, instanceName }) {
  const res = await fetch(integrationsUrl('/whatsapp/disconnect'), {
    method: 'POST',
    headers: authHeaders(idToken, true),
    body: JSON.stringify({ instanceName }),
  });
  const data = await parseJson(res);
  return throwIfError(res, data, 'Falha ao desligar WhatsApp.');
}

/** Envia short-lived token do FB.login → troca + grava IG/FB. */
export async function connectMeta({ idToken, accessToken }) {
  const res = await fetch(integrationsUrl('/meta/connect'), {
    method: 'POST',
    headers: authHeaders(idToken, true),
    body: JSON.stringify({ accessToken }),
  });
  const data = await parseJson(res);
  return throwIfError(res, data, 'Falha ao ligar Meta.');
}

export async function disconnectMeta({ idToken }) {
  const res = await fetch(integrationsUrl('/meta/disconnect'), {
    method: 'POST',
    headers: authHeaders(idToken, true),
    body: JSON.stringify({}),
  });
  const data = await parseJson(res);
  return throwIfError(res, data, 'Falha ao desligar Meta.');
}

export async function getMetaPublicConfig({ idToken }) {
  const res = await fetch(integrationsUrl('/meta/config'), {
    headers: authHeaders(idToken),
  });
  const data = await parseJson(res);
  return throwIfError(res, data, 'Falha ao ler config Meta.');
}

export default {
  requestWhatsAppQr,
  checkWhatsAppConnection,
  disconnectWhatsApp,
  connectMeta,
  disconnectMeta,
  getMetaPublicConfig,
};
