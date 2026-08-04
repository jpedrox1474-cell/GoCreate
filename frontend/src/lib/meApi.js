// Sync server-side do perfil (owner + daily reset) + sessions helpers.

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const SESSION_KEY = 'gocreate_session_key';

export function getOrCreateSessionKey() {
  try {
    let key = localStorage.getItem(SESSION_KEY);
    if (!key) {
      key =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(SESSION_KEY, key);
    }
    return key;
  } catch {
    return `s_${Date.now()}`;
  }
}

/**
 * Chama POST /api/me/ensure após login para elevar owner e resetar créditos free.
 * @param {{ getIdToken: () => Promise<string> }} firebaseUser
 */
export async function syncUserProfile(firebaseUser) {
  if (!firebaseUser?.getIdToken) return null;
  try {
    const idToken = await firebaseUser.getIdToken();
    const sessionKey = getOrCreateSessionKey();
    const res = await fetch(`${API_URL}/api/me/ensure`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
        'X-GoCreate-Session': sessionKey,
      },
      body: JSON.stringify({ sessionKey }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn('[syncUserProfile]', data?.error || res.status);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn('[syncUserProfile]', err?.message || err);
    return null;
  }
}

export async function listMySessions(idToken) {
  const sessionKey = getOrCreateSessionKey();
  const res = await fetch(`${API_URL}/api/me/sessions`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
      'X-GoCreate-Session': sessionKey,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao listar sessões');
  return data.sessions || [];
}

export async function revokeMySession(idToken, sessionId) {
  const res = await fetch(`${API_URL}/api/me/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao revogar');
  return data;
}

export async function revokeOtherSessions(idToken) {
  const sessionKey = getOrCreateSessionKey();
  const res = await fetch(`${API_URL}/api/me/sessions/revoke-others`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      'X-GoCreate-Session': sessionKey,
    },
    body: JSON.stringify({ sessionKey }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao revogar outras');
  return data;
}

export async function listSharedProjects(idToken) {
  const res = await fetch(`${API_URL}/api/me/shared-projects`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao listar partilhados');
  return data.projects || [];
}

export default syncUserProfile;
