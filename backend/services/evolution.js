/**
 * Proxy Evolution API (WhatsApp Baileys) — VPS keys nunca vão para o frontend.
 * Padrão BarberPro: EVOLUTION_API_URL + EVOLUTION_API_KEY (header apikey).
 */

const EVOLUTION_HEADER = 'apikey';

export function getPlatformEvolutionConfig() {
  const apiUrl = String(process.env.EVOLUTION_API_URL || process.env.EVOLUTION_API_PUBLIC_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const apiKey = String(process.env.EVOLUTION_API_KEY || '').trim();
  return {
    apiUrl,
    apiKey,
    configured: Boolean(apiUrl && apiKey),
  };
}

export function isEvolutionConfigured() {
  return getPlatformEvolutionConfig().configured;
}

function normalizeBaseUrl(url) {
  let base = String(url || '')
    .trim()
    .replace(/\/+$/, '');
  if (!base) return '';
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base.replace(/\/manager$/i, '').replace(/\/+$/, '');
}

function authHeaders(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) return {};
  return { [EVOLUTION_HEADER]: key };
}

function getBaseCandidates(apiUrl) {
  const raw = normalizeBaseUrl(apiUrl);
  if (!raw) return [];
  const withApi = raw.endsWith('/api') ? raw : `${raw}/api`;
  return Array.from(new Set([raw, withApi]));
}

/** Instância estável por utilizador GoCreate (Evolution). */
export function buildInstanceNameForUser(uid) {
  const clean = String(uid || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20);
  if (!clean) return 'gc_main';
  return `gc_${clean}`;
}

async function parseJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function extractPairingCode(data = {}) {
  const candidates = [
    data?.pairingCode,
    data?.pair_code,
    data?.pairing_code,
    data?.pairCode,
    data?.qrcode?.pairingCode,
    data?.data?.pairingCode,
    data?.code,
  ];
  for (const c of candidates) {
    const code = String(c || '').trim();
    if (code && code.length >= 4 && code.length <= 12 && /^[A-Z0-9-]+$/i.test(code)) {
      return code;
    }
  }
  return null;
}

export async function createEvolutionInstance({ apiUrl, apiKey, instanceName }) {
  const bases = getBaseCandidates(apiUrl);
  const name = String(instanceName || '').trim() || 'main';
  let lastError = 'URL inválida';

  for (const base of bases) {
    try {
      const res = await fetch(`${base}/instance/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(apiKey),
        },
        body: JSON.stringify({
          instanceName: name,
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true,
          browser: ['Android', 'Chrome', '20.0.0'],
          always_online: false,
          read_messages: true,
          reject_call: false,
          sync_full_history: false,
        }),
      });
      const data = await parseJson(res);
      if (res.status === 201 || res.ok) return { ok: true };
      if (res.status === 403 && /already in use|já está em uso/i.test(JSON.stringify(data))) {
        return { ok: true, exists: true };
      }
      lastError =
        data?.response?.message?.[0] || data?.error || data?.message || res.statusText || `HTTP ${res.status}`;
      if (res.status === 401) {
        return { ok: false, error: 'Chave da API Evolution inválida.' };
      }
    } catch (err) {
      lastError = err?.message || 'Erro de rede';
    }
  }
  return { ok: false, error: lastError };
}

export async function getEvolutionConnectQR({ apiUrl, apiKey, instanceName }) {
  const bases = getBaseCandidates(apiUrl);
  const name = encodeURIComponent(String(instanceName || '').trim() || 'main');
  let lastError = 'URL inválida';

  for (const base of bases) {
    try {
      const res = await fetch(`${base}/instance/connect/${name}`, {
        method: 'GET',
        headers: authHeaders(apiKey),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        lastError =
          data?.response?.message?.[0] || data?.error || data?.message || res.statusText || `HTTP ${res.status}`;
        if (res.status === 404) continue;
        continue;
      }
      const code = data?.code ?? data?.base64 ?? data?.qrcode?.base64 ?? data?.qrcode?.code;
      if (!code && !extractPairingCode(data)) {
        lastError = 'QR não disponível. Aguarde e tente de novo.';
        continue;
      }
      return {
        ok: true,
        code: code || undefined,
        pairingCode: extractPairingCode(data),
      };
    } catch (err) {
      lastError = err?.message || 'Erro de rede';
    }
  }
  return { ok: false, error: lastError };
}

export async function getEvolutionConnectionState({ apiUrl, apiKey, instanceName }) {
  const bases = getBaseCandidates(apiUrl);
  const name = String(instanceName || '').trim() || 'main';

  for (const base of bases) {
    try {
      const res = await fetch(`${base}/instance/connectionState/${encodeURIComponent(name)}`, {
        method: 'GET',
        headers: authHeaders(apiKey),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        if (res.status === 404) continue;
        continue;
      }
      const state = String(
        data?.state || data?.instance?.state || data?.instance?.status || ''
      ).toLowerCase();
      return { ok: true, state, open: state === 'open' || state === 'connected' };
    } catch {
      /* next */
    }
  }

  for (const base of bases) {
    try {
      const res = await fetch(
        `${base}/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`,
        { method: 'GET', headers: authHeaders(apiKey) }
      );
      const data = await parseJson(res);
      if (!res.ok) continue;
      const list = Array.isArray(data)
        ? data
        : data?.instance
          ? [data.instance]
          : Array.isArray(data?.response)
            ? data.response
            : [];
      for (const i of list) {
        const status = String(i?.status || i?.state || '').toLowerCase();
        if (status === 'open' || status === 'connected') {
          return { ok: true, state: 'open', open: true };
        }
      }
    } catch {
      /* next */
    }
  }

  return { ok: true, state: 'close', open: false };
}

export async function logoutEvolutionInstance({ apiUrl, apiKey, instanceName }) {
  const bases = getBaseCandidates(apiUrl);
  const name = encodeURIComponent(String(instanceName || '').trim() || 'main');
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/instance/logout/${name}`, {
        method: 'DELETE',
        headers: authHeaders(apiKey),
      });
      if (res.ok || res.status === 404) return { ok: true };
    } catch {
      /* next */
    }
  }
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/instance/delete/${name}`, {
        method: 'DELETE',
        headers: authHeaders(apiKey),
      });
      if (res.ok || res.status === 404) return { ok: true };
    } catch {
      /* next */
    }
  }
  return { ok: false, error: 'Não foi possível desligar a instância Evolution.' };
}

/**
 * Cria (se preciso) + devolve QR para o utilizador.
 */
export async function provisionUserWhatsAppQr(uid) {
  const platform = getPlatformEvolutionConfig();
  if (!platform.configured) {
    const err = new Error(
      'Evolution API não configurada no servidor (EVOLUTION_API_URL / EVOLUTION_API_KEY).'
    );
    err.status = 503;
    err.code = 'EVOLUTION_NOT_CONFIGURED';
    throw err;
  }

  const instanceName = buildInstanceNameForUser(uid);
  const created = await createEvolutionInstance({
    apiUrl: platform.apiUrl,
    apiKey: platform.apiKey,
    instanceName,
  });
  if (!created.ok && !created.exists) {
    const err = new Error(created.error || 'Falha ao criar instância WhatsApp.');
    err.status = 502;
    err.code = 'EVOLUTION_CREATE_FAILED';
    throw err;
  }

  let qr = await getEvolutionConnectQR({
    apiUrl: platform.apiUrl,
    apiKey: platform.apiKey,
    instanceName,
  });
  if (!qr.ok) {
    await new Promise((r) => setTimeout(r, 1500));
    qr = await getEvolutionConnectQR({
      apiUrl: platform.apiUrl,
      apiKey: platform.apiKey,
      instanceName,
    });
  }

  return {
    ok: true,
    instanceName,
    exists: Boolean(created.exists),
    qrBase64: qr.ok ? qr.code || null : null,
    pairingCode: qr.ok ? qr.pairingCode || null : null,
    qrError: qr.ok ? null : qr.error || null,
  };
}

export async function checkUserWhatsAppConnection(uid, instanceName) {
  const platform = getPlatformEvolutionConfig();
  if (!platform.configured) {
    return { ok: false, connected: false, error: 'Evolution não configurada.' };
  }
  const name = String(instanceName || '').trim() || buildInstanceNameForUser(uid);
  const state = await getEvolutionConnectionState({
    apiUrl: platform.apiUrl,
    apiKey: platform.apiKey,
    instanceName: name,
  });
  return {
    ok: state.ok,
    connected: Boolean(state.open),
    state: state.state || 'close',
    instanceName: name,
  };
}

export async function disconnectUserWhatsApp(uid, instanceName) {
  const platform = getPlatformEvolutionConfig();
  if (!platform.configured) {
    const err = new Error('Evolution não configurada.');
    err.status = 503;
    err.code = 'EVOLUTION_NOT_CONFIGURED';
    throw err;
  }
  const name = String(instanceName || '').trim() || buildInstanceNameForUser(uid);
  return logoutEvolutionInstance({
    apiUrl: platform.apiUrl,
    apiKey: platform.apiKey,
    instanceName: name,
  });
}

export default {
  getPlatformEvolutionConfig,
  isEvolutionConfigured,
  buildInstanceNameForUser,
  provisionUserWhatsAppQr,
  checkUserWhatsAppConnection,
  disconnectUserWhatsApp,
};
