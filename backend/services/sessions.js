// Active sessions / devices for account security.

import crypto from 'crypto';
import admin from '../config/firebaseAdmin.js';
import { db } from '../config/firebaseAdmin.js';

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw || '')).digest('hex').slice(0, 32);
}

export function parseUserAgent(ua) {
  const s = String(ua || '');
  let browser = 'Browser';
  if (/Edg\//i.test(s)) browser = 'Edge';
  else if (/Chrome\//i.test(s)) browser = 'Chrome';
  else if (/Firefox\//i.test(s)) browser = 'Firefox';
  else if (/Safari\//i.test(s) && !/Chrome/i.test(s)) browser = 'Safari';

  let os = 'Desconhecido';
  if (/Windows/i.test(s)) os = 'Windows';
  else if (/Mac OS X/i.test(s)) os = 'macOS';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/iPhone|iPad/i.test(s)) os = 'iOS';
  else if (/Linux/i.test(s)) os = 'Linux';

  return { browser, os, label: `${browser} · ${os}` };
}

/**
 * Upsert session for this browser. Client sends X-GoCreate-Session (stable id).
 */
export async function touchSession(uid, { sessionKey, userAgent, ip }) {
  if (!uid || !sessionKey) return null;
  const id = hashToken(sessionKey);
  const meta = parseUserAgent(userAgent);
  const ref = db.collection('users').doc(uid).collection('sessions').doc(id);
  const existing = await ref.get();
  await ref.set(
    {
      id,
      label: meta.label,
      browser: meta.browser,
      os: meta.os,
      userAgent: String(userAgent || '').slice(0, 300),
      ip: ip ? String(ip).split(',')[0].trim().slice(0, 64) : null,
      lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    },
    { merge: true }
  );

  // Cap at 20 sessions
  try {
    const snap = await db
      .collection('users')
      .doc(uid)
      .collection('sessions')
      .orderBy('lastSeenAt', 'desc')
      .limit(30)
      .get();
    if (snap.size > 20) {
      const batch = db.batch();
      snap.docs.slice(20).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch {
    /* ignore */
  }

  return { id, label: meta.label };
}

export async function listSessions(uid) {
  let docs = [];
  try {
    const snap = await db
      .collection('users')
      .doc(uid)
      .collection('sessions')
      .orderBy('lastSeenAt', 'desc')
      .limit(20)
      .get();
    docs = snap.docs;
  } catch {
    const snap = await db.collection('users').doc(uid).collection('sessions').limit(20).get();
    docs = snap.docs;
  }
  return docs.map((d) => {
    const data = d.data() || {};
    return {
      id: d.id,
      label: data.label || 'Sessão',
      browser: data.browser || null,
      os: data.os || null,
      ip: data.ip || null,
      createdAt: data.createdAt || null,
      lastSeenAt: data.lastSeenAt || null,
    };
  });
}

export async function revokeSession(uid, sessionId) {
  await db.collection('users').doc(uid).collection('sessions').doc(sessionId).delete();
  return { ok: true };
}

export async function revokeOtherSessions(uid, keepSessionKey) {
  const keepId = keepSessionKey ? hashToken(keepSessionKey) : null;
  const snap = await db.collection('users').doc(uid).collection('sessions').get();
  const batch = db.batch();
  let n = 0;
  snap.docs.forEach((d) => {
    if (keepId && d.id === keepId) return;
    batch.delete(d.ref);
    n += 1;
  });
  if (n) await batch.commit();
  return { ok: true, revoked: n };
}
