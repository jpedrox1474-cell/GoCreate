import { db } from '../../config/firebaseAdmin.js';

const COLLECTION = 'oauthStates';
const TTL_MS = 15 * 60 * 1000;

export async function saveOAuthState({ state, uid, platform, codeVerifier, redirectUri }) {
  const expiresAt = Date.now() + TTL_MS;
  await db.collection(COLLECTION).doc(state).set({
    uid,
    platform,
    codeVerifier: codeVerifier || null,
    redirectUri: redirectUri || null,
    expiresAt,
    createdAt: Date.now(),
  });
  return expiresAt;
}

export async function consumeOAuthState(state) {
  if (!state) return null;
  const ref = db.collection(COLLECTION).doc(state);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data();
  await ref.delete().catch(() => {});
  if (!data || data.expiresAt < Date.now()) return null;
  return data;
}
