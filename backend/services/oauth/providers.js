/**
 * OAuth popup platforms — YouTube (Google) + TikTok.
 * Portado do Hub Social (Manuvet TV); postMessage type: gocreate-oauth.
 */
import { saveOAuthState } from './state.js';
import { createOAuthState } from './pkce.js';

const PLATFORMS = ['youtube', 'tiktok'];

function pick(...keys) {
  for (const k of keys) {
    const v = String(process.env[k] || '').trim();
    if (v) return v;
  }
  return '';
}

export function getPublicApiUrl() {
  return String(process.env.PUBLIC_APP_URL || 'https://gocreate.web.app').replace(/\/$/, '');
}

export function getOAuthConfig(platform) {
  if (platform === 'youtube') {
    return {
      clientId: pick('YOUTUBE_CLIENT_ID', 'GOOGLE_CLIENT_ID'),
      clientSecret: pick('YOUTUBE_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET'),
    };
  }
  if (platform === 'tiktok') {
    return {
      clientId: pick('TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_ID'),
      clientSecret: pick('TIKTOK_CLIENT_SECRET'),
    };
  }
  return { clientId: '', clientSecret: '' };
}

export function isOAuthPlatform(platform) {
  return PLATFORMS.includes(platform);
}

export function oauthConfigured(platform) {
  const c = getOAuthConfig(platform);
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
    const params = new URLSearchParams({
      client_key: clientId,
      redirect_uri: redir,
      response_type: 'code',
      scope: 'user.info.basic,video.upload,video.publish',
      state,
    });
    authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params}`;
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

export async function exchangeCode(platform, code, redirect, codeVerifier) {
  if (!oauthConfigured(platform)) {
    const err = new Error('OAUTH_NOT_CONFIGURED');
    err.payload = missingConfigError(platform);
    throw err;
  }
  if (platform === 'youtube') return exchangeYoutube(code, redirect);
  if (platform === 'tiktok') return exchangeTiktok(code, redirect, codeVerifier);
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
