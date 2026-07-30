// Cliente GitHub export — OAuth + create repo / push.
// VITE_API_URL vazio → same-origin /api/* (Hosting → gocreateApi).

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function githubUrl(path) {
  return `${API_URL}/api/github${path}`;
}

async function parseJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * @param {{ idToken: string }} opts
 */
export async function getGitHubStatus({ idToken }) {
  const res = await fetch(githubUrl('/status'), {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(data?.error || `Erro HTTP ${res.status}`);
  }
  return data;
}

/**
 * @param {{ idToken: string, returnPath?: string }} opts
 * @returns {Promise<{ url: string }>}
 */
export async function startGitHubOAuth({ idToken, returnPath }) {
  const q =
    returnPath && returnPath.startsWith('/')
      ? `?returnPath=${encodeURIComponent(returnPath)}`
      : '';
  const res = await fetch(githubUrl(`/oauth/start${q}`), {
    headers: { Authorization: `Bearer ${idToken}` },
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
 * Abre popup OAuth e resolve quando o callback envia postMessage.
 * @param {{ idToken: string, returnPath?: string }} opts
 */
export function connectGitHubPopup({ idToken, returnPath }) {
  return new Promise(async (resolve, reject) => {
    let settled = false;
    let popup;

    function cleanup() {
      window.removeEventListener('message', onMessage);
      if (timer) clearInterval(timer);
    }

    function finish(ok, payload) {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        popup?.close();
      } catch {
        // ignore
      }
      if (ok) resolve(payload);
      else reject(new Error(payload?.error || 'Ligação GitHub cancelada.'));
    }

    function onMessage(event) {
      const data = event?.data;
      if (!data || data.type !== 'gocreate-github-oauth') return;
      finish(Boolean(data.ok), data);
    }

    window.addEventListener('message', onMessage);

    try {
      const { url } = await startGitHubOAuth({ idToken, returnPath });
      popup = window.open(url, 'gocreate-github-oauth', 'width=720,height=720');
      if (!popup) {
        cleanup();
        // Fallback: redirect na mesma janela
        window.location.assign(url);
        reject(new Error('Popup bloqueado — a redirecionar para o GitHub…'));
        return;
      }
    } catch (err) {
      cleanup();
      reject(err);
      return;
    }

    const timer = setInterval(() => {
      try {
        if (popup && popup.closed) {
          finish(false, { error: 'Janela GitHub fechada.' });
        }
      } catch {
        // ignore
      }
    }, 600);
  });
}

/**
 * @param {{ idToken: string }} opts
 */
export async function disconnectGitHub({ idToken }) {
  const res = await fetch(githubUrl('/disconnect'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(data?.error || `Erro HTTP ${res.status}`);
  }
  return data;
}

/**
 * @param {{
 *   idToken: string,
 *   repoName: string,
 *   description?: string,
 *   isPrivate?: boolean,
 *   branch?: string,
 *   files: Record<string, string>,
 * }} opts
 */
export async function exportToGitHub({
  idToken,
  repoName,
  description,
  isPrivate = true,
  branch = 'main',
  files,
}) {
  const res = await fetch(githubUrl('/export'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      repoName,
      description,
      isPrivate,
      branch,
      files,
    }),
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
  getGitHubStatus,
  startGitHubOAuth,
  connectGitHubPopup,
  disconnectGitHub,
  exportToGitHub,
};
