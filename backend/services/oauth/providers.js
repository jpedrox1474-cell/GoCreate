/**
 * OAuth popup platforms — YouTube, TikTok, Stripe Connect, PayPal, Mercado Pago.
 * postMessage type: gocreate-oauth.
 */
import { saveOAuthState } from './state.js';
import { createOAuthState, createCodeVerifier, createCodeChallenge } from './pkce.js';

const PLATFORMS = ['youtube', 'tiktok', 'stripe', 'paypal', 'mercadopago'];
/** Social channels that require premium plan. */
export const PREMIUM_OAUTH_PLATFORMS = new Set(['youtube', 'tiktok']);

const MP_AUTH_BASE = 'https://auth.mercadopago.com.br/authorization';

function pick(...keys) {
  for (const k of keys) {
    const v = String(process.env[k] || '').trim();
    if (v) return v;
  }
  return '';
}

function isMpOAuthClientId(clientId) {
  const id = String(clientId || '').trim();
  return Boolean(id && /^\d{10,}$/.test(id));
}

function isMpPkceEnabled() {
  const v = String(process.env.MP_OAUTH_PKCE || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function getPublicApiUrl() {
  return String(process.env.PUBLIC_APP_URL || 'https://gocreate.web.app').replace(/\/$/, '');
}

export function getOAuthConfig(platform) {
  if (platform === 'youtube') {
    return {
      clientId: pick('YOUTUBE_CLIENT_ID', 'GOOGLE_CLIENT_ID', 'GOOGLE_BUSINESS_CLIENT_ID'),
      clientSecret: pick(
        'YOUTUBE_CLIENT_SECRET',
        'GOOGLE_CLIENT_SECRET',
        'GOOGLE_BUSINESS_CLIENT_SECRET'
      ),
    };
  }
  if (platform === 'tiktok') {
    return {
      clientId: pick('TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_ID'),
      clientSecret: pick('TIKTOK_CLIENT_SECRET'),
    };
  }
  if (platform === 'stripe') {
    return {
      clientId: pick(
        'STRIPE_CONNECT_CLIENT_ID',
        'TENANT_STRIPE_CONNECT_CLIENT_ID',
        'STRIPE_CLIENT_ID'
      ),
      clientSecret: pick(
        'STRIPE_SECRET_KEY',
        'TENANT_STRIPE_CONNECT_SECRET',
        'STRIPE_CONNECT_CLIENT_SECRET'
      ),
    };
  }
  if (platform === 'paypal') {
    return {
      clientId: pick('PAYPAL_CLIENT_ID', 'PAYPAL_CLIENTID'),
      clientSecret: pick('PAYPAL_CLIENT_SECRET', 'PAYPAL_SECRET'),
      mode: pick('PAYPAL_MODE') || 'sandbox',
    };
  }
  if (platform === 'mercadopago') {
    // TEMP teste: mesmas vars TENANT_MP_* do BarberPro Connect.
    // Redirect canónico GoCreate (registar no painel MP):
    //   {PUBLIC_APP_URL}/api/integrations/mercadopago/oauth/callback
    const clientId = pick(
      'MERCADOPAGO_OAUTH_CLIENT_ID',
      'TENANT_MP_OAUTH_CLIENT_ID',
      'TENANT_MP_OAUTH_APP_ID',
      'MP_OAUTH_CLIENT_ID'
    );
    const clientSecret = pick(
      'MERCADOPAGO_OAUTH_CLIENT_SECRET',
      'TENANT_MP_OAUTH_APP_SECRET',
      'MP_OAUTH_CLIENT_SECRET'
    );
    return {
      clientId: isMpOAuthClientId(clientId) ? clientId : '',
      clientSecret,
      pkce: isMpPkceEnabled(),
    };
  }
  return { clientId: '', clientSecret: '' };
}

export function isOAuthPlatform(platform) {
  return PLATFORMS.includes(platform);
}

export function oauthConfigured(platform) {
  const c = getOAuthConfig(platform);
  if (platform === 'stripe') {
    // Connect needs ca_ client id + platform sk_
    return Boolean(c.clientId?.startsWith('ca_') && c.clientSecret?.startsWith('sk_'));
  }
  if (platform === 'mercadopago') {
    return Boolean(isMpOAuthClientId(c.clientId) && c.clientSecret);
  }
  return Boolean(c.clientId && c.clientSecret);
}

export function oauthConfigHints(platform) {
  const base = getPublicApiUrl();
  const hints = {
    youtube: {
      vars: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
      console: 'https://console.cloud.google.com/apis/credentials',
      redirect: `${base}/api/integrations/youtube/oauth/callback`,
      note: 'Ative YouTube Data API v3. Tipo: aplicativo Web. Adicione o redirect URI.',
    },
    tiktok: {
      vars: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
      console: 'https://developers.tiktok.com/',
      redirect: `${base}/api/integrations/tiktok/oauth/callback`,
      note: 'App Login Kit / Content Posting. Adicione o redirect URI.',
    },
    stripe: {
      vars: ['STRIPE_CONNECT_CLIENT_ID', 'STRIPE_SECRET_KEY'],
      console: 'https://dashboard.stripe.com/settings/connect',
      redirect: `${base}/api/integrations/stripe/oauth/callback`,
      note: 'Stripe Connect → Settings → Integration: Client ID (ca_…) + Secret key da plataforma (sk_…).',
    },
    paypal: {
      vars: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
      console: 'https://developer.paypal.com/dashboard/applications',
      redirect: `${base}/api/integrations/paypal/oauth/callback`,
      note: 'App REST API → Login with PayPal. Adicione o redirect URI. PAYPAL_MODE=live|sandbox.',
    },
    mercadopago: {
      vars: [
        'TENANT_MP_OAUTH_APP_ID',
        'TENANT_MP_OAUTH_APP_SECRET',
        'MERCADOPAGO_OAUTH_CLIENT_ID',
        'MERCADOPAGO_OAUTH_CLIENT_SECRET',
      ],
      console: 'https://www.mercadopago.com.br/developers/panel/app',
      redirect: `${base}/api/integrations/mercadopago/oauth/callback`,
      note:
        'OAuth Connect (vendedor). TEMP: pode usar a app MP do BarberPro — registe o redirect URI acima no painel. Credenciais de produção → Client ID + Client Secret.',
    },
  };
  return hints[platform] || null;
}

function redirectUri(platform) {
  return `${getPublicApiUrl()}/api/integrations/${platform}/oauth/callback`;
}

function missingConfigError(platform) {
  const hint = oauthConfigHints(platform);
  const vars = (hint?.vars || []).join(', ');
  return {
    error: `OAuth de ${platform} não configurado no servidor.`,
    code: 'OAUTH_NOT_CONFIGURED',
    platform,
    hint: `Defina ${vars} em functions/.env e faça redeploy.`,
    redirectUri: hint?.redirect || null,
    console: hint?.console || null,
    note: hint?.note || null,
  };
}

async function parseJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/** Build authorize URL + persist state for the signed-in Firebase user. */
export async function buildAuthorizeUrl(platform, uid) {
  if (!isOAuthPlatform(platform)) {
    throw new Error('Plataforma inválida');
  }
  if (!oauthConfigured(platform)) {
    const err = new Error('OAUTH_NOT_CONFIGURED');
    err.payload = missingConfigError(platform);
    throw err;
  }

  const state = createOAuthState();
  const redir = redirectUri(platform);
  let authUrl;

  if (platform === 'youtube') {
    const { clientId } = getOAuthConfig('youtube');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redir,
      response_type: 'code',
      scope: [
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/userinfo.email',
      ].join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  } else if (platform === 'tiktok') {
    const { clientId } = getOAuthConfig('tiktok');
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);
    const params = new URLSearchParams({
      client_key: clientId,
      redirect_uri: redir,
      response_type: 'code',
      scope: 'user.info.basic,video.upload,video.publish',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params}`;
    await saveOAuthState({ state, uid, platform, codeVerifier, redirectUri: redir });
    return { authUrl, state, redirectUri: redir };
  } else if (platform === 'stripe') {
    const { clientId } = getOAuthConfig('stripe');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: 'read_write',
      state,
      redirect_uri: redir,
    });
    authUrl = `https://connect.stripe.com/oauth/authorize?${params}`;
  } else if (platform === 'paypal') {
    const { clientId, mode } = getOAuthConfig('paypal');
    const host =
      String(mode || 'sandbox').toLowerCase() === 'live'
        ? 'https://www.paypal.com'
        : 'https://www.sandbox.paypal.com';
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: 'openid profile email https://uri.paypal.com/services/paypalattributes',
      redirect_uri: redir,
      state,
    });
    authUrl = `${host}/signin/authorize?${params}`;
  } else if (platform === 'mercadopago') {
    const { clientId, pkce } = getOAuthConfig('mercadopago');
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      platform_id: 'mp',
      state,
      redirect_uri: redir,
    });
    if (pkce) {
      const codeVerifier = createCodeVerifier();
      const codeChallenge = createCodeChallenge(codeVerifier);
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
      authUrl = `${MP_AUTH_BASE}?${params}`;
      await saveOAuthState({ state, uid, platform, codeVerifier, redirectUri: redir });
      return { authUrl, state, redirectUri: redir };
    }
    authUrl = `${MP_AUTH_BASE}?${params}`;
  } else {
    throw new Error('Plataforma inválida');
  }

  await saveOAuthState({ state, uid, platform, codeVerifier: null, redirectUri: redir });
  return { authUrl, state, redirectUri: redir };
}

async function exchangeYoutube(code, redirect) {
  const { clientId, clientSecret } = getOAuthConfig('youtube');
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirect,
      grant_type: 'authorization_code',
    }),
  });
  const tokenData = await parseJson(tokenRes);
  if (!tokenRes.ok) {
    const err = new Error(tokenData?.error_description || tokenData?.error || 'Falha no token YouTube.');
    err.details = tokenData;
    throw err;
  }
  const { access_token, refresh_token, expires_in } = tokenData;
  const chRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?${new URLSearchParams({
      part: 'snippet',
      mine: 'true',
    })}`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  const chData = await parseJson(chRes);
  const ch = chData?.items?.[0];
  return {
    youtubeConnected: true,
    youtubeAccessToken: access_token,
    youtubeRefreshToken: refresh_token || null,
    youtubeTokenExpiresAt: expires_in ? Date.now() + expires_in * 1000 : null,
    youtubeChannelId: ch?.id || null,
    youtubeChannelTitle: ch?.snippet?.title || null,
  };
}

async function exchangeTiktok(code, redirect, codeVerifier) {
  const { clientId, clientSecret } = getOAuthConfig('tiktok');
  const body = {
    client_key: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirect,
  };
  if (codeVerifier) body.code_verifier = codeVerifier;
  const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const d = await parseJson(tokenRes);
  if (d.error || !tokenRes.ok) {
    throw new Error(d.error_description || d.error || 'Falha no token TikTok.');
  }
  const access = d.access_token;
  const openId = d.open_id;
  let username = null;
  try {
    const info = await fetch(
      `https://open.tiktokapis.com/v2/user/info/?${new URLSearchParams({
        fields: 'display_name,username,avatar_url',
      })}`,
      { headers: { Authorization: `Bearer ${access}` } }
    );
    const infoData = await parseJson(info);
    username =
      infoData?.data?.user?.username || infoData?.data?.user?.display_name || null;
  } catch {
    /* username optional */
  }
  return {
    tiktokConnected: true,
    tiktokAccessToken: access,
    tiktokRefreshToken: d.refresh_token || null,
    tiktokOpenId: openId || null,
    tiktokUsername: username,
    tiktokTokenExpiresAt: d.expires_in ? Date.now() + d.expires_in * 1000 : null,
  };
}

async function exchangeStripe(code, redirect) {
  const { clientId, clientSecret } = getOAuthConfig('stripe');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code: String(code || '').trim(),
    redirect_uri: redirect,
  });
  const tokenRes = await fetch('https://connect.stripe.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const d = await parseJson(tokenRes);
  if (!tokenRes.ok) {
    throw new Error(d?.error_description || d?.error || 'Falha no token Stripe Connect.');
  }
  return {
    stripeConnected: true,
    secretKey: d.access_token || null,
    publishableKey: d.stripe_publishable_key || null,
    stripeUserId: d.stripe_user_id || null,
    refreshToken: d.refresh_token || null,
    livemode: Boolean(d.livemode),
  };
}

async function exchangePaypal(code, redirect) {
  const { clientId, clientSecret, mode } = getOAuthConfig('paypal');
  const apiHost =
    String(mode || 'sandbox').toLowerCase() === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenRes = await fetch(`${apiHost}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code || '').trim(),
      redirect_uri: redirect,
    }).toString(),
  });
  const d = await parseJson(tokenRes);
  if (!tokenRes.ok) {
    throw new Error(d?.error_description || d?.error || 'Falha no token PayPal.');
  }
  let email = null;
  let payerId = null;
  try {
    const infoRes = await fetch(`${apiHost}/v1/identity/oauth2/userinfo?schema=paypalv1.1`, {
      headers: { Authorization: `Bearer ${d.access_token}` },
    });
    const info = await parseJson(infoRes);
    email = info?.emails?.[0]?.value || info?.email || null;
    payerId = info?.payer_id || info?.user_id || null;
  } catch {
    /* optional */
  }
  return {
    paypalConnected: true,
    accessToken: d.access_token || null,
    refreshToken: d.refresh_token || null,
    expiresIn: d.expires_in || null,
    clientId,
    mode: String(mode || 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox',
    email,
    payerId,
  };
}

async function exchangeMercadoPago(code, redirect, codeVerifier) {
  const { clientId, clientSecret } = getOAuthConfig('mercadopago');
  const body = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code: String(code || '').trim(),
    redirect_uri: redirect,
  };
  if (codeVerifier) body.code_verifier = codeVerifier;

  const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await parseJson(tokenRes);
  if (!tokenRes.ok) {
    const msg = String(d?.message || d?.error_description || d?.error || 'Falha no token Mercado Pago.');
    if (/invalid client_id|client_secret/i.test(msg)) {
      throw new Error(
        'Client ID ou Client Secret inválidos. No painel MP use Credenciais de produção → Client ID + Client Secret.'
      );
    }
    throw new Error(msg);
  }
  return {
    mercadopagoConnected: true,
    accessToken: String(d.access_token || '').trim() || null,
    refreshToken: String(d.refresh_token || '').trim() || null,
    publicKey: String(d.public_key || '').trim() || null,
    mpUserId: d.user_id != null ? String(d.user_id).trim() : null,
    expiresIn: d.expires_in || null,
    scope: d.scope || null,
  };
}

export async function exchangeCode(platform, code, redirect, codeVerifier) {
  if (!oauthConfigured(platform)) {
    const err = new Error('OAUTH_NOT_CONFIGURED');
    err.payload = missingConfigError(platform);
    throw err;
  }
  if (platform === 'youtube') return exchangeYoutube(code, redirect);
  if (platform === 'tiktok') return exchangeTiktok(code, redirect, codeVerifier);
  if (platform === 'stripe') return exchangeStripe(code, redirect);
  if (platform === 'paypal') return exchangePaypal(code, redirect);
  if (platform === 'mercadopago') return exchangeMercadoPago(code, redirect, codeVerifier);
  throw new Error('Plataforma inválida');
}

export function clearOAuthFields(platform) {
  if (platform === 'tiktok') {
    return {
      tiktokConnected: false,
      tiktokAccessToken: null,
      tiktokRefreshToken: null,
      tiktokOpenId: null,
      tiktokUsername: null,
      tiktokTokenExpiresAt: null,
    };
  }
  if (platform === 'youtube') {
    return {
      youtubeConnected: false,
      youtubeAccessToken: null,
      youtubeRefreshToken: null,
      youtubeChannelId: null,
      youtubeChannelTitle: null,
      youtubeTokenExpiresAt: null,
    };
  }
  if (platform === 'stripe') {
    return {
      stripeConnected: false,
      secretKey: null,
      publishableKey: null,
      stripeUserId: null,
      refreshToken: null,
    };
  }
  if (platform === 'paypal') {
    return {
      paypalConnected: false,
      accessToken: null,
      refreshToken: null,
      clientId: null,
      email: null,
      payerId: null,
    };
  }
  if (platform === 'mercadopago') {
    return {
      mercadopagoConnected: false,
      accessToken: null,
      refreshToken: null,
      publicKey: null,
      mpUserId: null,
    };
  }
  return {};
}

export function popupResultHtml({ ok, platform, error, displayName }) {
  const payload = JSON.stringify({
    type: 'gocreate-oauth',
    ok: Boolean(ok),
    platform,
    error: error || null,
    displayName: displayName || null,
  });
  const title = ok ? 'Conectado' : 'Falha na conexão';
  const msg = ok
    ? `${platform} conectado${displayName ? `: ${displayName}` : ''}. Pode fechar esta janela.`
    : error || 'Não foi possível conectar.';
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/><title>${title} — GoCreate</title>
<style>
  body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#09090b;color:#fafafa}
  .card{max-width:360px;padding:1.5rem;border-radius:1rem;background:#18181b;border:1px solid #27272a;text-align:center}
  .ok{color:#34d399}.err{color:#fbbf24}
</style></head><body>
<div class="card">
  <p class="${ok ? 'ok' : 'err'}" style="font-weight:700;font-size:1.1rem">${title}</p>
  <p style="font-size:.9rem;opacity:.85">${String(msg).replace(/</g, '&lt;')}</p>
  <p style="font-size:.75rem;opacity:.5;margin-top:1rem">Esta janela fecha automaticamente…</p>
</div>
<script>
  (function(){
    var payload = ${payload};
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, '*');
      }
    } catch (e) {}
    setTimeout(function(){ window.close(); }, 1200);
  })();
</script>
</body></html>`;
}
