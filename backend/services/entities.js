// Persist AI-emitted entity schemas into projects/{id}/entities.

import admin from '../config/firebaseAdmin.js';
import { db } from '../config/firebaseAdmin.js';

const ALLOWED_TYPES = new Set(['string', 'number', 'boolean']);

function slugify(id) {
  return String(id || 'entity')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'entity';
}

function normalizeEntity(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = slugify(raw.id || raw.name || raw.table);
  const name = String(raw.name || raw.id || id);
  const columns = Array.isArray(raw.columns)
    ? raw.columns
        .map((c) => {
          if (!c) return null;
          if (typeof c === 'string') return { name: c, type: 'string' };
          const colName = String(c.name || c.key || '').trim();
          if (!colName) return null;
          const type = ALLOWED_TYPES.has(c.type) ? c.type : 'string';
          return { name: colName, type };
        })
        .filter(Boolean)
    : [];
  if (!columns.length) return null;
  const rows = Array.isArray(raw.rows) ? raw.rows.slice(0, 50) : [];
  return { id, name, columns, rows };
}

/**
 * Parse optional <gocreate_entities>[...]</gocreate_entities> from AI text.
 */
export function parseEntitiesFromAiText(text) {
  if (!text || typeof text !== 'string') return [];
  const match = text.match(/<gocreate_entities>([\s\S]*?)<\/gocreate_entities>/i);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1].trim());
    const list = Array.isArray(parsed) ? parsed : parsed?.entities || [];
    return list.map(normalizeEntity).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Upsert entity docs + optional seed rows.
 */
export async function upsertProjectEntities(projectId, entities) {
  if (!projectId || !entities?.length) return 0;
  const batch = db.batch();
  let count = 0;

  for (const ent of entities) {
    const ref = db.collection('projects').doc(projectId).collection('entities').doc(ent.id);
    batch.set(
      ref,
      {
        id: ent.id,
        name: ent.name,
        columns: ent.columns,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'ai',
      },
      { merge: true }
    );
    count += 1;

    if (ent.rows?.length) {
      for (let i = 0; i < ent.rows.length; i++) {
        const row = ent.rows[i];
        if (!row || typeof row !== 'object') continue;
        const rowRef = ref.collection('rows').doc(`seed_${i}`);
        batch.set(
          rowRef,
          {
            data: row,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
  }

  await batch.commit();
  return count;
}

/**
 * Public/runtime data ops for published apps (Admin SDK).
 * Caller must already assert project.backendEnabled.
 */
export async function projectDataOp(projectId, { action, entity, id, data } = {}) {
  const entityId = slugify(entity);
  if (!entityId || entityId === 'entity') {
    const err = new Error('entity é obrigatório.');
    err.status = 400;
    throw err;
  }

  const entityRef = db.collection('projects').doc(projectId).collection('entities').doc(entityId);
  const entitySnap = await entityRef.get();
  if (!entitySnap.exists && action !== 'create' && action !== 'list') {
    // Auto-create thin schema on first write
    if (action === 'create' || action === 'update') {
      await entityRef.set(
        {
          id: entityId,
          name: entityId,
          columns: [],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          source: 'runtime',
        },
        { merge: true }
      );
    }
  }

  const op = String(action || 'list').toLowerCase();

  if (op === 'list') {
    const rowsSnap = await entityRef.collection('rows').limit(200).get();
    return {
      ok: true,
      entity: entityId,
      rows: rowsSnap.docs.map((d) => ({ id: d.id, ...(d.data()?.data || d.data() || {}) })),
    };
  }

  if (op === 'get') {
    if (!id) {
      const err = new Error('id é obrigatório para get.');
      err.status = 400;
      throw err;
    }
    const rowSnap = await entityRef.collection('rows').doc(String(id)).get();
    if (!rowSnap.exists) {
      const err = new Error('Registo não encontrado.');
      err.status = 404;
      throw err;
    }
    return { ok: true, entity: entityId, id: rowSnap.id, data: rowSnap.data()?.data || {} };
  }

  if (op === 'create') {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      const err = new Error('data (objeto) é obrigatório para create.');
      err.status = 400;
      throw err;
    }
    if (!entitySnap.exists) {
      await entityRef.set(
        {
          id: entityId,
          name: entityId,
          columns: Object.keys(data).map((name) => ({
            name,
            type: typeof data[name] === 'number' ? 'number' : typeof data[name] === 'boolean' ? 'boolean' : 'string',
          })),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          source: 'runtime',
        },
        { merge: true }
      );
    }
    const rowRef = entityRef.collection('rows').doc();
    await rowRef.set({
      data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ok: true, entity: entityId, id: rowRef.id, data };
  }

  if (op === 'update') {
    if (!id) {
      const err = new Error('id é obrigatório para update.');
      err.status = 400;
      throw err;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      const err = new Error('data (objeto) é obrigatório para update.');
      err.status = 400;
      throw err;
    }
    const rowRef = entityRef.collection('rows').doc(String(id));
    const rowSnap = await rowRef.get();
    if (!rowSnap.exists) {
      const err = new Error('Registo não encontrado.');
      err.status = 404;
      throw err;
    }
    const prev = rowSnap.data()?.data || {};
    const next = { ...prev, ...data };
    await rowRef.set(
      { data: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    return { ok: true, entity: entityId, id: String(id), data: next };
  }

  if (op === 'delete') {
    if (!id) {
      const err = new Error('id é obrigatório para delete.');
      err.status = 400;
      throw err;
    }
    await entityRef.collection('rows').doc(String(id)).delete();
    return { ok: true, entity: entityId, id: String(id), deleted: true };
  }

  const err = new Error('action inválida. Use list|get|create|update|delete.');
  err.status = 400;
  throw err;
}

export default { parseEntitiesFromAiText, upsertProjectEntities, projectDataOp };
