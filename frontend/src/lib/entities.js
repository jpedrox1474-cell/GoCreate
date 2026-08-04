// Firestore helpers for project entities (Banco de Dados).

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { LAST_PROJECT_KEY } from './automations';

export { LAST_PROJECT_KEY };

/** Tipos de campo suportados no schema builder (Data Architect + legado). */
export const FIELD_TYPES = [
  { id: 'string', label: 'Texto' },
  { id: 'text', label: 'Texto longo' },
  { id: 'number', label: 'Número' },
  { id: 'boolean', label: 'Booleano' },
  { id: 'timestamp', label: 'Timestamp' },
  { id: 'date', label: 'Data' },
  { id: 'email', label: 'E-mail' },
  { id: 'url', label: 'URL' },
  { id: 'array', label: 'Array' },
  { id: 'map', label: 'Mapa / JSON' },
  { id: 'json', label: 'JSON (legado)' },
];

export const ALLOWED_FIELD_TYPES = new Set(FIELD_TYPES.map((t) => t.id));

/** Ingress aliases from Data Architect / older schemas. */
const INGRESS_TYPE_ALIASES = {
  date: 'timestamp',
  json: 'map',
};

export const TYPE_COLORS = {
  string: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  text: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
  number: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  boolean: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  timestamp: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  date: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  email: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  url: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  array: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20',
  map: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  json: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
};

export const TEMPLATE_ENTITIES = [
  {
    id: 'users',
    name: 'Utilizadores',
    columns: [
      { name: 'name', type: 'string' },
      { name: 'email', type: 'email' },
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
      { name: 'createdAt', type: 'date' },
    ],
    rows: [
      { customer: 'Ana Silva', total: 119.8, paid: true, createdAt: '2026-03-01' },
      { customer: 'Bruno Costa', total: 39.9, paid: false, createdAt: '2026-03-15' },
    ],
  },
];

function slugify(id) {
  return (
    String(id || 'entity')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64) || 'entity'
  );
}

export function normalizeColumn(col, index = 0) {
  if (!col) return null;
  if (typeof col === 'string') {
    return { name: col, type: 'string', required: false, order: index };
  }
  const name = String(col.name || col.key || '').trim();
  if (!name) return null;
  const rawType = String(col.type || 'string').toLowerCase();
  // Prefer exact UI type; only alias when not already a known FIELD_TYPES id
  let type = rawType;
  if (!ALLOWED_FIELD_TYPES.has(type) && INGRESS_TYPE_ALIASES[type]) {
    type = INGRESS_TYPE_ALIASES[type];
  }
  if (!ALLOWED_FIELD_TYPES.has(type)) type = 'string';
  return {
    name,
    type,
    required: col.required === true || col.required === 'true',
    label:
      typeof col.label === 'string' && col.label.trim()
        ? col.label.trim().slice(0, 80)
        : undefined,
    order: typeof col.order === 'number' ? col.order : index,
  };
}

export function normalizeColumns(columns = []) {
  return (Array.isArray(columns) ? columns : [])
    .map((c, i) => normalizeColumn(c, i))
    .filter(Boolean)
    .map((c, i) => ({ ...c, order: i }));
}

/**
 * Aviso de migração ao alterar schema (remoção / mudança de tipo).
 */
export function getSchemaMigrationWarnings(prevColumns = [], nextColumns = []) {
  const warnings = [];
  const prevMap = new Map(normalizeColumns(prevColumns).map((c) => [c.name, c]));
  const nextMap = new Map(normalizeColumns(nextColumns).map((c) => [c.name, c]));

  for (const [name, prev] of prevMap) {
    if (!nextMap.has(name)) {
      warnings.push({
        level: 'danger',
        message: `Campo “${name}” será removido do schema. Dados existentes nas linhas mantêm-se, mas deixam de aparecer na tabela.`,
      });
    } else {
      const next = nextMap.get(name);
      if (prev.type !== next.type) {
        warnings.push({
          level: 'warn',
          message: `Tipo de “${name}” muda de ${prev.type} → ${next.type}. Valores incompatíveis podem falhar na API.`,
        });
      }
    }
  }
  for (const [name] of nextMap) {
    if (!prevMap.has(name)) {
      warnings.push({
        level: 'info',
        message: `Novo campo “${name}”. Linhas existentes ficam vazias até serem editadas.`,
      });
    }
  }
  return warnings;
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
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      columns: normalizeColumns(data.columns || []),
    };
  });
}

export async function getEntity(projectId, entityId) {
  if (!projectId || !entityId) return null;
  const snap = await getDoc(doc(db, 'projects', projectId, 'entities', entityId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return { id: snap.id, ...data, columns: normalizeColumns(data.columns || []) };
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
  const columns = normalizeColumns(entity.columns || []);
  const formFields =
    Array.isArray(entity.formFields) && entity.formFields.length
      ? entity.formFields
      : columns.map((c, i) => ({
          name: c.name,
          type: c.type,
          required: Boolean(c.required),
          label: c.label || c.name,
          order: i,
        }));
  await setDoc(
    ref,
    {
      id,
      name: entity.name || id,
      columns,
      formFields,
      is_tenant_isolated: true,
      source: entity.source || 'manual',
      permissions: entity.permissions || { read: 'public', write: 'public' },
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

export async function updateEntitySchema(projectId, entityId, { name, columns } = {}) {
  if (!projectId || !entityId) throw new Error('Entidade inválida.');
  const patch = { updatedAt: serverTimestamp(), is_tenant_isolated: true };
  if (name != null) patch.name = String(name).trim() || entityId;
  if (columns != null) {
    const cols = normalizeColumns(columns);
    patch.columns = cols;
    patch.formFields = cols.map((c, i) => ({
      name: c.name,
      type: c.type,
      required: Boolean(c.required),
      label: c.label || c.name,
      order: i,
    }));
  }
  await updateDoc(doc(db, 'projects', projectId, 'entities', entityId), patch);
}

export async function createEntityRow(projectId, entityId, data = {}) {
  if (!projectId || !entityId) throw new Error('Entidade inválida.');
  const col = collection(db, 'projects', projectId, 'entities', entityId, 'rows');
  const ref = await addDoc(col, {
    data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateEntityRow(projectId, entityId, rowId, data = {}) {
  if (!projectId || !entityId || !rowId) throw new Error('Linha inválida.');
  const ref = doc(db, 'projects', projectId, 'entities', entityId, 'rows', rowId);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? snap.data()?.data || {} : {};
  await setDoc(
    ref,
    { data: { ...prev, ...data }, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function deleteEntityRow(projectId, entityId, rowId) {
  if (!projectId || !entityId || !rowId) throw new Error('Linha inválida.');
  await deleteDoc(doc(db, 'projects', projectId, 'entities', entityId, 'rows', rowId));
}

export async function deleteEntityRows(projectId, entityId, rowIds = []) {
  if (!projectId || !entityId || !rowIds.length) return { deleted: 0 };
  const batch = writeBatch(db);
  let n = 0;
  for (const id of rowIds) {
    if (!id) continue;
    batch.delete(doc(db, 'projects', projectId, 'entities', entityId, 'rows', id));
    n += 1;
    if (n >= 450) break; // Firestore batch limit
  }
  await batch.commit();
  return { deleted: n };
}

export async function duplicateEntity(projectId, entityId) {
  const ent = await getEntity(projectId, entityId);
  if (!ent) throw new Error('Entidade não encontrada.');
  const rows = await listEntityRows(projectId, entityId);
  const newId = slugify(`${ent.id}_copy`);
  let candidate = newId;
  let i = 2;
  while (await getEntity(projectId, candidate)) {
    candidate = slugify(`${ent.id}_copy_${i}`);
    i += 1;
  }
  await upsertEntity(
    projectId,
    {
      id: candidate,
      name: `${ent.name || ent.id} (cópia)`,
      columns: ent.columns,
      source: 'duplicate',
    },
    { rows: rows.map(({ id: _id, ...rest }) => rest) }
  );
  return candidate;
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
              : /email/i.test(k)
                ? 'email'
                : /url|href|link/i.test(k)
                  ? 'url'
                  : /date|at$/i.test(k)
                    ? 'date'
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
  const rows = await listEntityRows(projectId, entityId);
  if (rows.length) {
    await deleteEntityRows(
      projectId,
      entityId,
      rows.map((r) => r.id)
    );
  }
  await deleteDoc(doc(db, 'projects', projectId, 'entities', entityId));
}

/** Escape CSV cell. */
function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(columns = [], rows = []) {
  const cols = normalizeColumns(columns);
  const header = cols.map((c) => csvEscape(c.name)).join(',');
  const lines = rows.map((row) =>
    cols
      .map((c) => {
        const v = row[c.name];
        if (typeof v === 'object' && v != null) return csvEscape(JSON.stringify(v));
        return csvEscape(v);
      })
      .join(',')
  );
  return [header, ...lines].join('\n');
}

export function rowsToJson(columns = [], rows = []) {
  const cols = normalizeColumns(columns).map((c) => c.name);
  return JSON.stringify(
    {
      columns: normalizeColumns(columns),
      rows: rows.map(({ id, ...rest }) => {
        const out = {};
        for (const name of cols) {
          if (rest[name] !== undefined) out[name] = rest[name];
        }
        // keep extra keys
        for (const [k, v] of Object.entries(rest)) {
          if (!(k in out) && k !== 'id') out[k] = v;
        }
        return out;
      }),
    },
    null,
    2
  );
}

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

export function parseCsv(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!raw) return { columns: [], rows: [] };
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return { columns: [], rows: [] };
  const headers = parseCsvLine(lines[0]).map((h) => h.trim()).filter(Boolean);
  const columns = headers.map((name) => ({ name, type: 'string' }));
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      let v = cells[i] ?? '';
      if (v === 'true') v = true;
      else if (v === 'false') v = false;
      else if (v !== '' && !Number.isNaN(Number(v)) && /^-?\d+(\.\d+)?$/.test(String(v))) {
        v = Number(v);
      }
      row[h] = v;
    });
    return row;
  });
  return { columns, rows };
}

export function parseJsonImport(text) {
  const parsed = JSON.parse(String(text || ''));
  if (Array.isArray(parsed)) {
    const keys = [...new Set(parsed.flatMap((r) => Object.keys(r || {})))];
    return {
      columns: keys.map((name) => ({ name, type: 'string' })),
      rows: parsed,
    };
  }
  if (parsed && typeof parsed === 'object') {
    const columns = normalizeColumns(parsed.columns || []);
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    if (!columns.length && rows.length) {
      const keys = [...new Set(rows.flatMap((r) => Object.keys(r || {})))];
      return { columns: keys.map((name) => ({ name, type: 'string' })), rows };
    }
    return { columns, rows };
  }
  throw new Error('JSON inválido.');
}

export async function importEntityRows(projectId, entityId, rows = [], { replace = false } = {}) {
  if (!projectId || !entityId) throw new Error('Entidade inválida.');
  if (replace) {
    const existing = await listEntityRows(projectId, entityId);
    if (existing.length) {
      await deleteEntityRows(
        projectId,
        entityId,
        existing.map((r) => r.id)
      );
    }
  }
  let n = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const { id: _id, ...data } = row;
    await createEntityRow(projectId, entityId, data);
    n += 1;
  }
  return n;
}

export function downloadTextFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function coerceCellValue(raw, type) {
  if (raw === '' || raw == null) {
    if (type === 'boolean') return false;
    if (type === 'number') return 0;
    if (type === 'array') return [];
    if (type === 'map' || type === 'json') return {};
    return '';
  }
  if (type === 'number') {
    const n = Number(raw);
    return Number.isNaN(n) ? 0 : n;
  }
  if (type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    return raw === true || raw === 'true' || raw === '1' || raw === 'sim';
  }
  if (type === 'array') {
    if (Array.isArray(raw)) return raw;
    try {
      const parsed = JSON.parse(String(raw));
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return String(raw)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  if (type === 'map' || type === 'json') {
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return raw;
    try {
      return JSON.parse(String(raw));
    } catch {
      return String(raw);
    }
  }
  if (type === 'timestamp' || type === 'date') {
    return String(raw);
  }
  return String(raw);
}
