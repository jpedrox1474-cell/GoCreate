// Platform audit log — critical actions (Admin SDK write only).

import admin from '../config/firebaseAdmin.js';
import { db } from '../config/firebaseAdmin.js';

/**
 * @param {{ action: string, actorUid?: string, actorEmail?: string, projectId?: string|null, targetUid?: string|null, meta?: object }} entry
 */
export async function writeAuditLog(entry) {
  const action = String(entry?.action || '').trim().slice(0, 80);
  if (!action) return null;
  try {
    const ref = db.collection('auditLogs').doc();
    await ref.set({
      action,
      actorUid: entry.actorUid || null,
      actorEmail: entry.actorEmail
        ? String(entry.actorEmail).trim().toLowerCase()
        : null,
      projectId: entry.projectId || null,
      targetUid: entry.targetUid || null,
      meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    console.warn('[audit]', err?.message || err);
    return null;
  }
}

export async function listAuditLogs({ limit = 40 } = {}) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 40));
  let docs = [];
  try {
    const snap = await db
      .collection('auditLogs')
      .orderBy('createdAt', 'desc')
      .limit(lim)
      .get();
    docs = snap.docs;
  } catch {
    const snap = await db.collection('auditLogs').limit(lim).get();
    docs = snap.docs;
  }
  return docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}
