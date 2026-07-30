// GitHub OAuth + REST helpers (export / create repo).
// Tokens nunca vão para o cliente — só Admin SDK em users/{uid}/secrets/github.

import crypto from 'crypto';
import admin, { db } from '../config/firebaseAdmin.js';

const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token';
const GITHUB_API = 'https://api.github.com';

const OAUTH_SCOPES = 'repo read:user';
const STATE_TTL_MS = 10 * 60 * 1000;

export function isGitHubOAuthConfigured() {
  return Boolean(
    process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim()
  );
}

export function resolveGitHubRedirectUri() {
  const explicit = process.env.GITHUB_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const app = (process.env.PUBLIC_APP_URL || 'https://gocreate.web.app').replace(/\/$/, '');
  return `${app}/api/github/callback`;
}

function getStateSecret() {
  return (
    process.env.GITHUB_OAUTH_STATE_SECRET?.trim() ||
    process.env.GITHUB_CLIENT_SECRET?.trim() ||
    'gocreate-github-oauth-dev'
  );
}

/**
 * State assinado: uid + nonce + exp (+ returnPath opcional). Evita CSRF no callback.
 */
export function createOAuthState(uid, { returnPath } = {}) {
  const payload = {
    uid,
    n: crypto.randomBytes(8).toString('hex'),
    exp: Date.now() + STATE_TTL_MS,
  };
  if (returnPath && typeof returnPath === 'string' && returnPath.startsWith('/')) {
    payload.returnPath = returnPath.slice(0, 200);
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getStateSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function parseOAuthState(state) {
  if (!state || typeof state !== 'string' || !state.includes('.')) {
    const err = new Error('State OAuth inválido.');
    err.status = 400;
    throw err;
  }
  const [body, sig] = state.split('.');
  const expected = crypto.createHmac('sha256', getStateSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const err = new Error('State OAuth adulterado.');
    err.status = 400;
    throw err;
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    const err = new Error('State OAuth corrompido.');
    err.status = 400;
    throw err;
  }
  if (!payload?.uid || !payload.exp || Date.now() > payload.exp) {
    const err = new Error('State OAuth expirado. Tenta ligar o GitHub outra vez.');
    err.status = 400;
    throw err;
  }
  return payload;
}

export function buildAuthorizeUrl(uid, { returnPath } = {}) {
  if (!isGitHubOAuthConfigured()) {
    const err = new Error('GitHub OAuth não configurado (GITHUB_CLIENT_ID/SECRET).');
    err.status = 503;
    err.code = 'GITHUB_NOT_CONFIGURED';
    throw err;
  }
  const state = createOAuthState(uid, { returnPath });
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID.trim(),
    redirect_uri: resolveGitHubRedirectUri(),
    scope: OAUTH_SCOPES,
    state,
    allow_signup: 'true',
  });
  return { url: `${GITHUB_AUTHORIZE}?${params}`, state };
}

async function githubJson(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'GoCreate',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!res.ok) {
    const msg = data?.message || `GitHub API ${res.status}`;
    const err = new Error(msg);
    err.status = res.status >= 500 ? 502 : res.status;
    err.github = data;
    throw err;
  }

  return data;
}

export async function exchangeCodeForToken(code) {
  const res = await fetch(GITHUB_TOKEN, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID.trim(),
      client_secret: process.env.GITHUB_CLIENT_SECRET.trim(),
      code,
      redirect_uri: resolveGitHubRedirectUri(),
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error || !data.access_token) {
    const err = new Error(data.error_description || data.error || 'Falha ao obter token GitHub.');
    err.status = 400;
    throw err;
  }
  return data;
}

export async function fetchGitHubUser(accessToken) {
  return githubJson('/user', { token: accessToken });
}

function secretsRef(uid) {
  return db.collection('users').doc(uid).collection('secrets').doc('github');
}

/**
 * Guarda access_token só em secrets (Admin). Metadados públicos em users/{uid}.github.
 */
export async function saveGitHubConnection(uid, { accessToken, scope, tokenType, ghUser }) {
  const login = ghUser?.login || null;
  const now = admin.firestore.FieldValue.serverTimestamp();

  await secretsRef(uid).set(
    {
      accessToken,
      scope: scope || null,
      tokenType: tokenType || 'bearer',
      login,
      githubUserId: ghUser?.id != null ? String(ghUser.id) : null,
      updatedAt: now,
    },
    { merge: true }
  );

  await db
    .collection('users')
    .doc(uid)
    .set(
      {
        github: {
          connected: true,
          login,
          avatarUrl: ghUser?.avatar_url || null,
          htmlUrl: ghUser?.html_url || null,
          connectedAt: now,
        },
        updatedAt: now,
      },
      { merge: true }
    );

  return { login, avatarUrl: ghUser?.avatar_url || null };
}

export async function clearGitHubConnection(uid) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  await secretsRef(uid).delete().catch(() => {});
  await db
    .collection('users')
    .doc(uid)
    .set(
      {
        github: {
          connected: false,
          login: null,
          avatarUrl: null,
          htmlUrl: null,
          disconnectedAt: now,
        },
        updatedAt: now,
      },
      { merge: true }
    );
}

export async function getGitHubStatus(uid) {
  const userSnap = await db.collection('users').doc(uid).get();
  const meta = userSnap.exists ? userSnap.data()?.github || {} : {};
  const secretSnap = await secretsRef(uid).get();
  const hasToken = secretSnap.exists && Boolean(secretSnap.data()?.accessToken);
  return {
    configured: isGitHubOAuthConfigured(),
    connected: Boolean(hasToken && meta.connected !== false),
    login: meta.login || secretSnap.data()?.login || null,
    avatarUrl: meta.avatarUrl || null,
    htmlUrl: meta.htmlUrl || null,
  };
}

export async function getStoredAccessToken(uid) {
  const snap = await secretsRef(uid).get();
  if (!snap.exists) return null;
  return snap.data()?.accessToken || null;
}

function normalizeRepoName(name) {
  const raw = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return raw || 'gocreate-project';
}

function normalizeFilePath(p) {
  let path = String(p || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (path.startsWith('/')) path = path.slice(1);
  return path;
}

/**
 * Cria repositório (se necessário) e faz 1 commit com todos os ficheiros.
 */
export async function createRepoAndPush({
  accessToken,
  repoName,
  description,
  isPrivate,
  branch = 'main',
  files,
}) {
  const name = normalizeRepoName(repoName);
  const fileEntries = Object.entries(files || {})
    .map(([path, content]) => [normalizeFilePath(path), content])
    .filter(([path, content]) => path && typeof content === 'string');

  if (!fileEntries.length) {
    const err = new Error('Nenhum ficheiro para enviar.');
    err.status = 400;
    throw err;
  }

  const repo = await githubJson('/user/repos', {
    method: 'POST',
    token: accessToken,
    body: {
      name,
      description: description || 'Exportado do GoCreate',
      private: Boolean(isPrivate),
      auto_init: false,
      has_issues: true,
      has_projects: false,
      has_wiki: false,
    },
  });

  const owner = repo.owner?.login;
  const repoFull = repo.name;
  const defaultBranch = branch || 'main';

  // Blobs em paralelo (lotes) para não estourar rate limit em projetos grandes
  const blobs = [];
  const BATCH = 8;
  for (let i = 0; i < fileEntries.length; i += BATCH) {
    const slice = fileEntries.slice(i, i + BATCH);
    const part = await Promise.all(
      slice.map(async ([path, content]) => {
        const blob = await githubJson(`/repos/${owner}/${repoFull}/git/blobs`, {
          method: 'POST',
          token: accessToken,
          body: {
            content: Buffer.from(content, 'utf8').toString('base64'),
            encoding: 'base64',
          },
        });
        return {
          path,
          mode: '100644',
          type: 'blob',
          sha: blob.sha,
        };
      })
    );
    blobs.push(...part);
  }

  const tree = await githubJson(`/repos/${owner}/${repoFull}/git/trees`, {
    method: 'POST',
    token: accessToken,
    body: { tree: blobs },
  });

  const commit = await githubJson(`/repos/${owner}/${repoFull}/git/commits`, {
    method: 'POST',
    token: accessToken,
    body: {
      message: 'Initial commit from GoCreate',
      tree: tree.sha,
      parents: [],
    },
  });

  await githubJson(`/repos/${owner}/${repoFull}/git/refs`, {
    method: 'POST',
    token: accessToken,
    body: {
      ref: `refs/heads/${defaultBranch}`,
      sha: commit.sha,
    },
  });

  // Preferir default_branch = main
  try {
    await githubJson(`/repos/${owner}/${repoFull}`, {
      method: 'PATCH',
      token: accessToken,
      body: { default_branch: defaultBranch },
    });
  } catch {
    // ignore
  }

  return {
    repoUrl: repo.html_url,
    cloneUrl: repo.clone_url,
    fullName: repo.full_name,
    branch: defaultBranch,
    commitSha: commit.sha,
    fileCount: fileEntries.length,
  };
}

export default {
  isGitHubOAuthConfigured,
  resolveGitHubRedirectUri,
  buildAuthorizeUrl,
  parseOAuthState,
  exchangeCodeForToken,
  fetchGitHubUser,
  saveGitHubConnection,
  clearGitHubConnection,
  getGitHubStatus,
  getStoredAccessToken,
  createRepoAndPush,
};
