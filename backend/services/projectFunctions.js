// Project serverless functions — sandboxed JS handlers (HTTP / entity events / cron).

import vm from 'vm';
import admin from '../config/firebaseAdmin.js';
import { db } from '../config/firebaseAdmin.js';
import { projectDataOp } from './entities.js';

const NAME_RE = /^[a-z][a-z0-9_]{1,47}$/;
const TRIGGERS = new Set(['http', 'event', 'cron']);
const EVENT_ACTIONS = new Set(['create', 'update', 'delete', 'write']);
const MAX_CODE = 40_000;
const DEFAULT_TIMEOUT_MS = 8000;

export function normalizeFnName(raw) {
  const name = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  if (!NAME_RE.test(name)) {
    return { ok: false, error: 'Nome inválido (ex: on_order_created).' };
  }
  return { ok: true, name };
}

function normalizeTrigger(raw) {
  const trigger = String(raw || 'http').toLowerCase();
  if (!TRIGGERS.has(trigger)) {
    return { ok: false, error: 'Trigger deve ser http, event ou cron.' };
  }
  return { ok: true, trigger };
}

export async function listProjectFunctions(projectId) {
  const snap = await db
    .collection('projects')
    .doc(projectId)
    .collection('backendFunctions')
    .orderBy('updatedAt', 'desc')
    .get()
    .catch(async () =>
      db.collection('projects').doc(projectId).collection('backendFunctions').get()
    );
  return snap.docs.map((d) => {
    const data = d.data() || {};
    return {
      id: d.id,
      name: data.name || d.id,
      trigger: data.trigger || 'http',
      enabled: data.enabled !== false,
      event: data.event || null,
      cron: data.cron || null,
      description: data.description || '',
      updatedAt: data.updatedAt || null,
      lastRunAt: data.lastRunAt || null,
      lastStatus: data.lastStatus || null,
    };
  });
}

export async function getProjectFunction(projectId, nameOrId) {
  const ref = db.collection('projects').doc(projectId).collection('backendFunctions').doc(nameOrId);
  let snap = await ref.get();
  if (!snap.exists) {
    const q = await db
      .collection('projects')
      .doc(projectId)
      .collection('backendFunctions')
      .where('name', '==', nameOrId)
      .limit(1)
      .get();
    if (q.empty) return null;
    snap = q.docs[0];
  }
  return { id: snap.id, ...(snap.data() || {}) };
}

export async function upsertProjectFunction(projectId, payload) {
  const nameNorm = normalizeFnName(payload?.name);
  if (!nameNorm.ok) {
    const err = new Error(nameNorm.error);
    err.status = 400;
    throw err;
  }
  const trig = normalizeTrigger(payload?.trigger);
  if (!trig.ok) {
    const err = new Error(trig.error);
    err.status = 400;
    throw err;
  }
  const code = String(payload?.code ?? '');
  if (!code.trim()) {
    const err = new Error('Código é obrigatório (async function handler(ctx) { … }).');
    err.status = 400;
    throw err;
  }
  if (code.length > MAX_CODE) {
    const err = new Error(`Código demasiado longo (máx. ${MAX_CODE} chars).`);
    err.status = 400;
    throw err;
  }

  let event = null;
  if (trig.trigger === 'event') {
    const entity = String(payload?.event?.entity || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');
    const action = String(payload?.event?.action || 'write').toLowerCase();
    if (!entity) {
      const err = new Error('Evento requer entity.');
      err.status = 400;
      throw err;
    }
    if (!EVENT_ACTIONS.has(action)) {
      const err = new Error('Ação de evento inválida.');
      err.status = 400;
      throw err;
    }
    event = { entity, action };
  }

  let cron = null;
  if (trig.trigger === 'cron') {
    const intervalMinutes = Math.min(
      24 * 60,
      Math.max(5, Number(payload?.cron?.intervalMinutes) || 60)
    );
    cron = {
      intervalMinutes,
      nextRunAt: admin.firestore.Timestamp.fromMillis(Date.now() + intervalMinutes * 60_000),
    };
  }

  const id = nameNorm.name;
  const ref = db.collection('projects').doc(projectId).collection('backendFunctions').doc(id);
  const existing = await ref.get();
  await ref.set(
    {
      name: id,
      trigger: trig.trigger,
      code,
      enabled: payload?.enabled === false ? false : true,
      description: String(payload?.description || '').slice(0, 200),
      event,
      cron,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    },
    { merge: true }
  );
  return getProjectFunction(projectId, id);
}

export async function deleteProjectFunction(projectId, nameOrId) {
  const fn = await getProjectFunction(projectId, nameOrId);
  if (!fn) {
    const err = new Error('Função não encontrada.');
    err.status = 404;
    throw err;
  }
  await db.collection('projects').doc(projectId).collection('backendFunctions').doc(fn.id).delete();
  return { ok: true, id: fn.id };
}

async function loadEnvMap(projectId) {
  const env = {};
  const { secretValueFromDoc } = await import('./secretsCrypto.js');
  const snap = await db.collection('projects').doc(projectId).collection('envSecrets').get();
  snap.docs.forEach((d) => {
    const data = d.data() || {};
    const key = String(data.key || d.id || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '');
    try {
      const value = secretValueFromDoc(data);
      if (key && value != null) env[key] = value;
    } catch {
      /* skip */
    }
  });
  return env;
}

async function appendFnLog(projectId, fnId, entry) {
  const ref = db
    .collection('projects')
    .doc(projectId)
    .collection('backendFunctions')
    .doc(fnId)
    .collection('logs')
    .doc();
  await ref.set({
    ...entry,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  // Keep last ~40 logs
  try {
    const logs = await db
      .collection('projects')
      .doc(projectId)
      .collection('backendFunctions')
      .doc(fnId)
      .collection('logs')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    if (logs.size > 40) {
      const batch = db.batch();
      logs.docs.slice(40).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch {
    /* ignore */
  }
}

export async function listFunctionLogs(projectId, nameOrId, limit = 30) {
  const fn = await getProjectFunction(projectId, nameOrId);
  if (!fn) {
    const err = new Error('Função não encontrada.');
    err.status = 404;
    throw err;
  }
  const lim = Math.min(50, Math.max(1, Number(limit) || 30));
  let docs = [];
  try {
    const snap = await db
      .collection('projects')
      .doc(projectId)
      .collection('backendFunctions')
      .doc(fn.id)
      .collection('logs')
      .orderBy('createdAt', 'desc')
      .limit(lim)
      .get();
    docs = snap.docs;
  } catch {
    const snap = await db
      .collection('projects')
      .doc(projectId)
      .collection('backendFunctions')
      .doc(fn.id)
      .collection('logs')
      .limit(lim)
      .get();
    docs = snap.docs;
  }
  return docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}

/**
 * Execute sandboxed handler(ctx).
 */
export async function runProjectFunction({
  projectId,
  nameOrId,
  triggerKind = 'http',
  payload = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const fn = await getProjectFunction(projectId, nameOrId);
  if (!fn) {
    const err = new Error('Função não encontrada.');
    err.status = 404;
    throw err;
  }
  if (fn.enabled === false) {
    const err = new Error('Função desativada.');
    err.status = 403;
    throw err;
  }

  const logs = [];
  const env = await loadEnvMap(projectId);
  const started = Date.now();

  const entityApi = {
    async list(entity) {
      return projectDataOp(projectId, { action: 'list', entity, accessLevel: 'admin' });
    },
    async get(entity, id) {
      return projectDataOp(projectId, { action: 'get', entity, id, accessLevel: 'admin' });
    },
    async create(entity, data) {
      return projectDataOp(projectId, {
        action: 'create',
        entity,
        data,
        accessLevel: 'admin',
        skipHooks: true,
      });
    },
    async update(entity, id, data) {
      return projectDataOp(projectId, {
        action: 'update',
        entity,
        id,
        data,
        accessLevel: 'admin',
        skipHooks: true,
      });
    },
    async remove(entity, id) {
      return projectDataOp(projectId, {
        action: 'delete',
        entity,
        id,
        accessLevel: 'admin',
        skipHooks: true,
      });
    },
  };

  const ctx = {
    projectId,
    env,
    trigger: triggerKind,
    payload: payload && typeof payload === 'object' ? payload : {},
    entity: entityApi,
    log: (...args) => {
      logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    },
  };

  const code = String(fn.code || '');
  const wrapped = `(async () => {\n${code}\n;if (typeof handler !== 'function') { throw new Error('Define async function handler(ctx) { ... }'); }\nreturn await handler(ctx);\n})()`;

  const sandbox = {
    ctx,
    console: {
      log: (...a) => ctx.log(...a),
      info: (...a) => ctx.log(...a),
      warn: (...a) => ctx.log(...a),
      error: (...a) => ctx.log(...a),
    },
    fetch: globalThis.fetch?.bind(globalThis),
    JSON,
    Math,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Map,
    Set,
    Error,
    Promise,
    parseInt,
    parseFloat,
    isNaN,
    URL,
    URLSearchParams,
  };

  let result = null;
  let errorMessage = null;
  try {
    const context = vm.createContext(sandbox);
    const script = new vm.Script(wrapped, { filename: `fn_${fn.name}.js` });
    const runPromise = script.runInContext(context, { timeout: timeoutMs });
    result = await Promise.race([
      Promise.resolve(runPromise),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout após ${timeoutMs}ms`)), timeoutMs + 20);
      }),
    ]);
  } catch (err) {
    errorMessage = err?.message || String(err);
  }

  const durationMs = Date.now() - started;
  const status = errorMessage ? 'error' : 'ok';
  const ref = db.collection('projects').doc(projectId).collection('backendFunctions').doc(fn.id);
  const patch = {
    lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
    lastStatus: status,
    lastDurationMs: durationMs,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (fn.trigger === 'cron' && fn.cron?.intervalMinutes) {
    const mins = Number(fn.cron.intervalMinutes) || 60;
    patch.cron = {
      ...fn.cron,
      intervalMinutes: mins,
      nextRunAt: admin.firestore.Timestamp.fromMillis(Date.now() + mins * 60_000),
      lastRunAt: admin.firestore.Timestamp.now(),
    };
  }
  await ref.set(patch, { merge: true });
  await appendFnLog(projectId, fn.id, {
    status,
    durationMs,
    trigger: triggerKind,
    logs: logs.slice(-50),
    error: errorMessage,
    resultPreview:
      result == null
        ? null
        : typeof result === 'string'
          ? result.slice(0, 500)
          : JSON.stringify(result).slice(0, 500),
  });

  if (errorMessage) {
    const err = new Error(errorMessage);
    err.status = 500;
    err.code = 'FN_ERROR';
    err.logs = logs;
    err.durationMs = durationMs;
    throw err;
  }

  return { ok: true, result, logs, durationMs, name: fn.name, trigger: fn.trigger };
}

/**
 * Fire event-triggered functions after entity mutations.
 */
export async function dispatchEntityEvents(projectId, { entity, action, id, data }) {
  if (!projectId || !entity || !action) return;
  try {
    const snap = await db
      .collection('projects')
      .doc(projectId)
      .collection('backendFunctions')
      .where('trigger', '==', 'event')
      .get();
    const targets = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((fn) => {
        if (fn.enabled === false) return false;
        const ent = fn.event?.entity;
        const act = fn.event?.action || 'write';
        if (ent !== entity) return false;
        if (act === 'write') return true;
        return act === action;
      });

    await Promise.allSettled(
      targets.map((fn) =>
        runProjectFunction({
          projectId,
          nameOrId: fn.id,
          triggerKind: 'event',
          payload: { entity, action, id: id || null, data: data || null },
        })
      )
    );
  } catch (err) {
    console.warn('[projectFunctions/dispatch]', err?.message);
  }
}

/** Run due cron functions for a project (or all with limit). */
export async function runDueCronFunctions({ projectId = null, limit = 20 } = {}) {
  const now = admin.firestore.Timestamp.now();
  let query = db.collectionGroup('backendFunctions').where('trigger', '==', 'cron').limit(80);
  const snap = await query.get().catch(() => ({ docs: [] }));
  const due = snap.docs
    .map((d) => {
      const data = d.data() || {};
      const pid = d.ref.parent.parent?.id;
      return { projectId: pid, id: d.id, ...data };
    })
    .filter((fn) => {
      if (!fn.projectId || fn.enabled === false) return false;
      if (projectId && fn.projectId !== projectId) return false;
      const next = fn.cron?.nextRunAt;
      if (!next) return true;
      try {
        return next.toMillis() <= now.toMillis();
      } catch {
        return true;
      }
    })
    .slice(0, limit);

  const results = [];
  for (const fn of due) {
    try {
      const r = await runProjectFunction({
        projectId: fn.projectId,
        nameOrId: fn.id,
        triggerKind: 'cron',
        payload: {},
      });
      results.push({ projectId: fn.projectId, name: fn.name, ok: true, durationMs: r.durationMs });
    } catch (err) {
      results.push({
        projectId: fn.projectId,
        name: fn.name,
        ok: false,
        error: err.message,
      });
    }
  }
  return results;
}
