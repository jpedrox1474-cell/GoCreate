// Cliente canais premium — WhatsApp + Meta + YouTube + TikTok.
// Proxy no backend; credentials de plataforma nunca no browser.

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
  err.details = data?.details || data;
  throw err;
}

/** Gera QR / pairing WhatsApp (premium). */
export async function requestWhatsAppQr({ idToken }) {
  const res = await fetch(integrationsUrl('/whatsapp/qr'), {
    method: 'POST',
    headers: authHeaders(idToken, true),
    body: JSON.stringify({}),
  });
  const data = await parseJson(res);
  return throwIfError(res, data, 'Falha ao gerar QR WhatsApp.');
}

/** Polling connectionState WhatsApp. */
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

/** YouTube / TikTok — inicia OAuth (retorna authUrl para popup). */
export async function startPlatformOAuth({ idToken, platform }) {
  const res = await fetch(integrationsUrl(`/${platform}/oauth/start`), {
    headers: authHeaders(idToken),
  });
  const data = await parseJson(res);
  return throwIfError(res, data, `Falha ao iniciar OAuth ${platform}.`);
}

export async function disconnectPlatformOAuth({ idToken, platform }) {
  const res = await fetch(integrationsUrl(`/${platform}/oauth/disconnect`), {
    method: 'POST',
    headers: authHeaders(idToken, true),
    body: JSON.stringify({}),
  });
  const data = await parseJson(res);
  return throwIfError(res, data, `Falha ao desligar ${platform}.`);
}

export function openOAuthPopup(authUrl) {
  const w = 600;
  const h = 720;
  const left = Math.max(0, window.screenX + (window.outerWidth - w) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - h) / 2);
  const popup = window.open(
    authUrl,
    'gocreate_oauth',
    `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`
  );
  if (!popup) {
    throw new Error('Popup bloqueado pelo navegador. Permita pop-ups e tente de novo.');
  }
  return popup;
}

export function waitForOAuthMessage(platform, popup) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearInterval(timer);
      clearTimeout(timeout);
    };
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };
    const onMessage = (event) => {
      const data = event?.data;
      if (!data || data.type !== 'gocreate-oauth') return;
      if (data.platform && data.platform !== platform) return;
      if (data.ok) finish(resolve, data);
      else finish(reject, new Error(data.error || 'OAuth falhou.'));
    };
    window.addEventListener('message', onMessage);
    const timer = setInterval(() => {
      try {
        if (popup.closed) {
          finish(reject, new Error('Login cancelado (janela fechada).'));
        }
      } catch {
        /* ignore cross-origin */
      }
    }, 500);
    const timeout = setTimeout(() => {
      finish(reject, new Error('Tempo esgotado no login OAuth. Tente de novo.'));
    }, 5 * 60 * 1000);
  });
}

export default {
  requestWhatsAppQr,
  checkWhatsAppConnection,
  disconnectWhatsApp,
  connectMeta,
  disconnectMeta,
  getMetaPublicConfig,
  startPlatformOAuth,
  disconnectPlatformOAuth,
  openOAuthPopup,
  waitForOAuthMessage,
};
