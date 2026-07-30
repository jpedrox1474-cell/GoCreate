// Rotas GitHub OAuth + export de projeto.
//
// GET  /api/github/status          (auth) — ligado? sem token
// GET  /api/github/oauth/start     (auth) — { url } para autorizar
// GET  /api/github/callback        (público) — troca code → grava secrets
// POST /api/github/export          (auth) — cria repo + push dos ficheiros
// POST /api/github/disconnect      (auth) — remove ligação

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePremium } from '../middleware/premium.js';
import {
  isGitHubOAuthConfigured,
  buildAuthorizeUrl,
  parseOAuthState,
  exchangeCodeForToken,
  fetchGitHubUser,
  saveGitHubConnection,
  clearGitHubConnection,
  getGitHubStatus,
  getStoredAccessToken,
  createRepoAndPush,
} from '../services/github.js';

const router = Router();

function appBaseUrl() {
  return (process.env.PUBLIC_APP_URL || 'https://gocreate.web.app').replace(/\/$/, '');
}

function frontendRedirect({ ok, error, login, returnPath }) {
  const base = appBaseUrl();
  const path =
    returnPath && typeof returnPath === 'string' && returnPath.startsWith('/')
      ? returnPath
      : '/dashboard';
  const params = new URLSearchParams();
  if (ok) {
    params.set('github', 'connected');
    if (login) params.set('gh_user', login);
  } else {
    params.set('github', 'error');
    params.set('message', error || 'Falha na ligação GitHub.');
  }
  const sep = path.includes('?') ? '&' : '?';
  return `${base}${path}${sep}${params.toString()}`;
}

/** Popup: postMessage + close; fallback redirect se não houver opener. */
function sendOAuthResultPage(res, { ok, error, login, returnPath }) {
  const redirect = frontendRedirect({ ok, error, login, returnPath });
  const payload = JSON.stringify({
    type: 'gocreate-github-oauth',
    ok: Boolean(ok),
    login: login || null,
    error: error || null,
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html lang="pt"><head><meta charset="utf-8"><title>GoCreate · GitHub</title></head>
<body style="font-family:system-ui;background:#09090b;color:#e4e4e7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
<p>${ok ? 'GitHub ligado. Podes fechar esta janela.' : 'Falha ao ligar GitHub.'}</p>
<script>
(function () {
  var payload = ${payload};
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, '*');
      window.close();
      return;
    }
  } catch (e) {}
  location.replace(${JSON.stringify(redirect)});
})();
</script>
</body></html>`);
}

router.get('/status', requireAuth, async (req, res) => {
  try {
    const status = await getGitHubStatus(req.user.uid);
    res.json(status);
  } catch (err) {
    console.error('[github/status]', err);
    res.status(500).json({ error: err.message || 'Erro ao ler estado GitHub.' });
  }
});

router.get('/oauth/start', requireAuth, requirePremium, async (req, res) => {
  try {
    if (!isGitHubOAuthConfigured()) {
      return res.status(503).json({
        error: 'GitHub OAuth não configurado.',
        code: 'GITHUB_NOT_CONFIGURED',
        message:
          'Define GITHUB_CLIENT_ID e GITHUB_CLIENT_SECRET nas Cloud Functions (ver .env.example).',
      });
    }
    const returnPath =
      typeof req.query.returnPath === 'string' ? req.query.returnPath : undefined;
    const { url } = buildAuthorizeUrl(req.user.uid, { returnPath });
    res.json({ url });
  } catch (err) {
    console.error('[github/oauth/start]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha ao iniciar OAuth.',
      code: err.code,
    });
  }
});

router.get('/callback', async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;

  if (error) {
    return sendOAuthResultPage(res, {
      ok: false,
      error: String(errorDescription || error),
    });
  }

  try {
    if (!code || !state) {
      return sendOAuthResultPage(res, {
        ok: false,
        error: 'Callback GitHub sem code/state.',
      });
    }

    const parsed = parseOAuthState(String(state));
    const tokenData = await exchangeCodeForToken(String(code));
    const ghUser = await fetchGitHubUser(tokenData.access_token);
    const saved = await saveGitHubConnection(parsed.uid, {
      accessToken: tokenData.access_token,
      scope: tokenData.scope,
      tokenType: tokenData.token_type,
      ghUser,
    });

    return sendOAuthResultPage(res, {
      ok: true,
      login: saved.login,
      returnPath: parsed.returnPath,
    });
  } catch (err) {
    console.error('[github/callback]', err);
    return sendOAuthResultPage(res, {
      ok: false,
      error: err.message || 'Falha no callback GitHub.',
    });
  }
});

router.post('/disconnect', requireAuth, async (req, res) => {
  try {
    await clearGitHubConnection(req.user.uid);
    res.json({ ok: true, connected: false });
  } catch (err) {
    console.error('[github/disconnect]', err);
    res.status(500).json({ error: err.message || 'Falha ao desligar GitHub.' });
  }
});

router.post('/export', requireAuth, requirePremium, async (req, res) => {
  try {
    if (!isGitHubOAuthConfigured()) {
      return res.status(503).json({
        error: 'GitHub OAuth não configurado.',
        code: 'GITHUB_NOT_CONFIGURED',
      });
    }

    const {
      repoName,
      description,
      isPrivate = true,
      private: privateAlias,
      branch = 'main',
      files,
    } = req.body || {};

    const visibilityPrivate =
      typeof privateAlias === 'boolean' ? privateAlias : Boolean(isPrivate);

    if (!repoName || typeof repoName !== 'string') {
      return res.status(400).json({ error: 'repoName é obrigatório.' });
    }
    if (!files || typeof files !== 'object' || Array.isArray(files)) {
      return res.status(400).json({ error: 'files (objeto path→conteúdo) é obrigatório.' });
    }
    if (Object.keys(files).length === 0) {
      return res.status(400).json({ error: 'Nenhum ficheiro para exportar.' });
    }
    if (Object.keys(files).length > 200) {
      return res.status(400).json({ error: 'Máximo de 200 ficheiros por export.' });
    }

    const accessToken = await getStoredAccessToken(req.user.uid);
    if (!accessToken) {
      return res.status(401).json({
        error: 'GitHub não ligado.',
        code: 'GITHUB_NOT_CONNECTED',
        message: 'Liga a tua conta GitHub antes de fazer push.',
      });
    }

    const result = await createRepoAndPush({
      accessToken,
      repoName,
      description,
      isPrivate: visibilityPrivate,
      branch: String(branch || 'main').trim() || 'main',
      files,
    });

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[github/export]', err?.github || err);
    const status = err.status && err.status < 600 ? err.status : 500;
    res.status(status).json({
      error: err.message || 'Falha ao exportar para GitHub.',
      code: err.github?.errors ? 'GITHUB_API_ERROR' : undefined,
    });
  }
});

export default router;
