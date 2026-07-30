// Firestore helpers for project entities (Banco de Dados).

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { LAST_PROJECT_KEY } from './automations';

export { LAST_PROJECT_KEY };

export const TEMPLATE_ENTITIES = [
  {
    id: 'users',
    name: 'Utilizadores',
    columns: [
      { name: 'name', type: 'string' },
      { name: 'email', type: 'string' },
      { name: 'active', type: 'boolean' },
    ],
    rows: [
      { name: 'Ana Silva', email: 'ana@exemplo.com', active: true },
      { name: 'Bruno Costa', email: 'bruno@exemplo.com', active: true },
      { name: 'Carla Dias', email: 'carla@exemplo.com', active: false },
    ],
  },
  {
    id: 'products',
    name: 'Produtos',
    columns: [
      { name: 'name', type: 'string' },
      { name: 'price', type: 'number' },
      { name: 'stock', type: 'number' },
    ],
    rows: [
      { name: 'Camiseta', price: 79.9, stock: 40 },
      { name: 'Caneca', price: 39.9, stock: 120 },
    ],
  },
  {
    id: 'orders',
    name: 'Pedidos',
    columns: [
      { name: 'customer', type: 'string' },
      { name: 'total', type: 'number' },
      { name: 'paid', type: 'boolean' },
    ],
    rows: [
      { customer: 'Ana Silva', total: 119.8, paid: true },
      { customer: 'Bruno Costa', total: 39.9, paid: false },
    ],
  },
];

function slugify(id) {
  return String(id || 'entity')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'entity';
}

export function rememberLastProjectId(id) {
  try {
    if (id) localStorage.setItem(LAST_PROJECT_KEY, id);
  } catch {
    /* ignore */
  }
}

export function getRememberedProjectId() {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

export async function listEntities(projectId) {
  if (!projectId) return [];
  const col = collection(db, 'projects', projectId, 'entities');
  let snap;
  try {
    snap = await getDocs(query(col, orderBy('name')));
  } catch {
    snap = await getDocs(col);
  }
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getEntity(projectId, entityId) {
  if (!projectId || !entityId) return null;
  const snap = await getDoc(doc(db, 'projects', projectId, 'entities', entityId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listEntityRows(projectId, entityId) {
  if (!projectId || !entityId) return [];
  const col = collection(db, 'projects', projectId, 'entities', entityId, 'rows');
  const snap = await getDocs(col);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data()?.data || d.data() || {}) }));
}

export async function upsertEntity(projectId, entity, { rows } = {}) {
  const id = slugify(entity.id || entity.name);
  const ref = doc(db, 'projects', projectId, 'entities', id);
  await setDoc(
    ref,
    {
      id,
      name: entity.name || id,
      columns: entity.columns || [],
      source: entity.source || 'manual',
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  if (Array.isArray(rows) && rows.length) {
    const batch = writeBatch(db);
    rows.forEach((row, i) => {
      const rowRef = doc(db, 'projects', projectId, 'entities', id, 'rows', `seed_${i}`);
      batch.set(rowRef, { data: row, updatedAt: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  }

  return id;
}

export async function seedTemplateEntities(projectId) {
  for (const t of TEMPLATE_ENTITIES) {
    await upsertEntity(projectId, { ...t, source: 'template' }, { rows: t.rows });
  }
  return TEMPLATE_ENTITIES.length;
}

/**
 * Heurística simples: procura mock arrays / useState([{...}]) nos ficheiros gerados.
 */
export function detectEntitiesFromFiles(files = {}) {
  const found = [];
  const seen = new Set();

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;
    if (!/\.(jsx?|tsx?|json)$/i.test(path) && !path.includes('/')) continue;

    // const products = [{ name: '...', price: 1 }]
    const re =
      /(?:const|let|var)\s+([A-Za-z_][\w]*)\s*=\s*\[\s*\{([^\]]{0,800})\}\s*(?:,|\])/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      const name = m[1];
      const body = m[2];
      const keys = [...body.matchAll(/([A-Za-z_][\w]*)\s*:/g)].map((x) => x[1]);
      const uniq = [...new Set(keys)].slice(0, 8);
      if (uniq.length < 2) continue;
      const id = slugify(name);
      if (seen.has(id)) continue;
      seen.add(id);
      found.push({
        id,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        columns: uniq.map((k) => ({
          name: k,
          type: /^(id|price|stock|qty|quantity|total|amount|age|count)$/i.test(k)
            ? 'number'
            : /^(active|paid|enabled|visible|done)$/i.test(k)
              ? 'boolean'
              : 'string',
        })),
        source: 'detected',
        rows: [],
      });
    }
  }

  return found.slice(0, 8);
}

export async function seedDetectedEntities(projectId, entities) {
  let n = 0;
  for (const e of entities) {
    await upsertEntity(projectId, e, { rows: e.rows || [] });
    n += 1;
  }
  return n;
}

export async function deleteEntity(projectId, entityId) {
  // Rows left orphaned is ok for demo; delete parent doc.
  await deleteDoc(doc(db, 'projects', projectId, 'entities', entityId));
}
