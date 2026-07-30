// Sync server-side do perfil (owner + daily reset) — Admin SDK via Cloud Function.

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/**
 * Chama POST /api/me/ensure após login para elevar owner e resetar créditos free.
 * @param {{ getIdToken: () => Promise<string> }} firebaseUser
 */
export async function syncUserProfile(firebaseUser) {
  if (!firebaseUser?.getIdToken) return null;
  try {
    const idToken = await firebaseUser.getIdToken();
    const res = await fetch(`${API_URL}/api/me/ensure`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
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

export default syncUserProfile;
