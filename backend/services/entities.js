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

export default { parseEntitiesFromAiText, upsertProjectEntities };
