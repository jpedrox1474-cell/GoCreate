// API keys por projeto (hash SHA-256). Plaintext só no create.

import crypto from 'crypto';
import admin from '../config/firebaseAdmin.js';
import { db } from '../config/firebaseAdmin.js';

const PREFIX = 'gck_';

function hashKey(plain) {
  return crypto.createHash('sha256').update(String(plain)).digest('hex');
}

function generatePlainKey() {
  return `${PREFIX}${crypto.randomBytes(24).toString('base64url')}`;
}

export async function createProjectApiKey(projectId, { name = 'Default' } = {}) {
  const plain = generatePlainKey();
  const keyHash = hashKey(plain);
  const prefix = plain.slice(0, 10);
  const ref = db.collection('projects').doc(projectId).collection('apiKeys').doc();
  await ref.set({
    name: String(name || 'Default').slice(0, 80),
    prefix,
    keyHash,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastUsedAt: null,
    revoked: false,
  });
  return {
    id: ref.id,
    name: String(name || 'Default').slice(0, 80),
    prefix,
    key: plain,
    createdAt: new Date().toISOString(),
  };
}

export async function listProjectApiKeys(projectId) {
  const snap = await db
    .collection('projects')
    .doc(projectId)
    .collection('apiKeys')
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map((d) => {
    const data = d.data() || {};
    return {
      id: d.id,
      name: data.name || 'Key',
      prefix: data.prefix || '',
      revoked: Boolean(data.revoked),
      createdAt: data.createdAt || null,
      lastUsedAt: data.lastUsedAt || null,
    };
  });
}

export async function revokeProjectApiKey(projectId, keyId) {
  const ref = db.collection('projects').doc(projectId).collection('apiKeys').doc(keyId);
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error('API key não encontrada.');
    err.status = 404;
    throw err;
  }
  await ref.set(
    {
      revoked: true,
      revokedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true, id: keyId };
}

/**
 * Resolve access level from request headers.
 * @returns {'public'|'authenticated'|'admin'}
 */
export async function resolveDataAccessLevel(projectId, { apiKeyHeader, firebaseUser, projectOwnerId }) {
  if (firebaseUser?.uid && projectOwnerId && firebaseUser.uid === projectOwnerId) {
    return 'admin';
  }

  const raw = String(apiKeyHeader || '').trim();
  if (raw && raw.startsWith(PREFIX)) {
    const keyHash = hashKey(raw);
    const snap = await db
      .collection('projects')
      .doc(projectId)
      .collection('apiKeys')
      .where('keyHash', '==', keyHash)
      .limit(1)
      .get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      const data = doc.data() || {};
      if (!data.revoked) {
        doc.ref
          .set({ lastUsedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
          .catch(() => {});
        return 'authenticated';
      }
    }
  }

  if (firebaseUser?.uid) {
    return 'authenticated';
  }

  return 'public';
}

const LEVEL_RANK = { public: 0, authenticated: 1, admin: 2 };

export function accessAllows(required, actual) {
  const need = LEVEL_RANK[required] ?? 0;
  const have = LEVEL_RANK[actual] ?? 0;
  return have >= need;
}

export const ACCESS_LEVELS = ['public', 'authenticated', 'admin'];

export function normalizeAccessLevel(v, fallback = 'public') {
  const s = String(v || '').toLowerCase();
  return ACCESS_LEVELS.includes(s) ? s : fallback;
}

export default {
  createProjectApiKey,
  listProjectApiKeys,
  revokeProjectApiKey,
  resolveDataAccessLevel,
  accessAllows,
  normalizeAccessLevel,
};
