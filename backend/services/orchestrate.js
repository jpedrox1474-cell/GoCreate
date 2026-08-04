/**
 * JSON orchestration engine — structured intents applied by Node (not free-form infra from the model).
 *
 * Payload shape:
 * {
 *   action_type: "enable_feature" | "create_entity" | "update_config",
 *   target_module: "auth" | "database" | "ui_layout" | "api_integration",
 *   firestore_updates?: { collection_path, fields_to_update },
 *   ui_injection?: { component_id, action, props_to_pass },
 *   ai_response_to_user?: string,
 *   queue_wiring_prompt?: boolean
 * }
 */

import admin from '../config/firebaseAdmin.js';
import { db } from '../config/firebaseAdmin.js';
import {
  mergeProjectAuth,
  normalizeProjectAuth,
  publicProjectAuthPayload,
  buildAuthWiringPrompt,
  GOOGLE_OAUTH_CLIENT_ID_KEY,
  GOOGLE_OAUTH_CLIENT_SECRET_KEY,
} from './projectAuth.js';
import { upsertProjectEntities } from './entities.js';
import { encryptSecret, maskSecret } from './secretsCrypto.js';

const ACTION_TYPES = new Set(['enable_feature', 'create_entity', 'update_config']);
const TARGET_MODULES = new Set(['auth', 'database', 'ui_layout', 'api_integration']);

/** Whitelisted logical collection paths (not arbitrary Firestore paths). */
const ALLOWED_COLLECTION_PATHS = new Set([
  'project.auth',
  'project',
  'entities',
  'entities.schema',
]);

function slugifyEntity(id) {
  return (
    String(id || 'entity')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64) || 'entity'
  );
}

function normalizeColumns(columns) {
  if (!Array.isArray(columns) || !columns.length) {
    return [
      { name: 'name', type: 'string' },
      { name: 'createdAt', type: 'date' },
    ];
  }
  return columns
    .map((c) => {
      if (!c) return null;
      if (typeof c === 'string') return { name: c, type: 'string' };
      const name = String(c.name || c.key || '').trim();
      if (!name) return null;
      const type = ['string', 'text', 'number', 'boolean', 'date', 'email', 'url', 'json'].includes(
        c.type
      )
        ? c.type
        : 'string';
      return { name, type };
    })
    .filter(Boolean);
}

/**
 * Validate orchestrate payload. Throws Error with status 400 on failure.
 */
export function validateOrchestratePayload(body) {
  if (!body || typeof body !== 'object') {
    const err = new Error('Payload JSON inválido.');
    err.status = 400;
    err.code = 'ORCHESTRATE_INVALID';
    throw err;
  }

  const action_type = String(body.action_type || '').trim();
  const target_module = String(body.target_module || '').trim();

  if (!ACTION_TYPES.has(action_type)) {
    const err = new Error(
      `action_type inválido. Use: ${[...ACTION_TYPES].join(' | ')}`
    );
    err.status = 400;
    err.code = 'ORCHESTRATE_INVALID';
    throw err;
  }
  if (!TARGET_MODULES.has(target_module)) {
    const err = new Error(
      `target_module inválido. Use: ${[...TARGET_MODULES].join(' | ')}`
    );
    err.status = 400;
    err.code = 'ORCHESTRATE_INVALID';
    throw err;
  }

  if (body.firestore_updates) {
    const path = String(body.firestore_updates.collection_path || '').trim();
    if (path && !ALLOWED_COLLECTION_PATHS.has(path)) {
      const err = new Error(
        `collection_path não permitido: ${path}. Whitelist: ${[...ALLOWED_COLLECTION_PATHS].join(', ')}`
      );
      err.status = 400;
      err.code = 'ORCHESTRATE_PATH_DENIED';
      throw err;
    }
    if (
      body.firestore_updates.fields_to_update != null &&
      typeof body.firestore_updates.fields_to_update !== 'object'
    ) {
      const err = new Error('fields_to_update deve ser um objeto.');
      err.status = 400;
      err.code = 'ORCHESTRATE_INVALID';
      throw err;
    }
  }

  return {
    action_type,
    target_module,
    firestore_updates: body.firestore_updates || null,
    ui_injection: body.ui_injection || null,
    ai_response_to_user:
      typeof body.ai_response_to_user === 'string'
        ? body.ai_response_to_user.trim().slice(0, 500)
        : '',
    queue_wiring_prompt: Boolean(body.queue_wiring_prompt),
    // Convenience fields (also accepted at top-level for auth / entities)
    auth: body.auth || null,
    entity: body.entity || null,
    entities: Array.isArray(body.entities) ? body.entities : null,
    secrets: body.secrets && typeof body.secrets === 'object' ? body.secrets : null,
  };
}

async function putEnvSecret(projectId, key, value) {
  const safeKey = String(key || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '');
  if (!safeKey || value == null || value === '') return null;
  const encrypted = encryptSecret(String(value));
  await db
    .collection('projects')
    .doc(projectId)
    .collection('envSecrets')
    .doc(safeKey)
    .set(
      {
        key: safeKey,
        value: encrypted,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  return { key: safeKey, masked: maskSecret(String(value)) };
}

async function applyAuthUpdates(projectId, project, fields, secrets) {
  const fromFields =
    fields?.auth && typeof fields.auth === 'object'
      ? fields.auth
      : fields && (fields.googleEnabled != null || fields.googleMode != null)
        ? fields
        : null;

  let nextAuth = normalizeProjectAuth(project.auth);
  if (fromFields) {
    nextAuth = mergeProjectAuth(nextAuth, fromFields);
  }

  const patch = {
    auth: nextAuth,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection('projects').doc(projectId).set(patch, { merge: true });

  const secretResults = [];
  if (secrets) {
    if (secrets.googleClientId || secrets[GOOGLE_OAUTH_CLIENT_ID_KEY]) {
      secretResults.push(
        await putEnvSecret(
          projectId,
          GOOGLE_OAUTH_CLIENT_ID_KEY,
          secrets.googleClientId || secrets[GOOGLE_OAUTH_CLIENT_ID_KEY]
        )
      );
    }
    if (secrets.googleClientSecret || secrets[GOOGLE_OAUTH_CLIENT_SECRET_KEY]) {
      secretResults.push(
        await putEnvSecret(
          projectId,
          GOOGLE_OAUTH_CLIENT_SECRET_KEY,
          secrets.googleClientSecret || secrets[GOOGLE_OAUTH_CLIENT_SECRET_KEY]
        )
      );
    }
  }

  // Sync public snapshots (auth flags only — no secrets)
  const authPayload = publicProjectAuthPayload({ ...project, ...patch });
  for (const pubId of [projectId, `${projectId}_preview`]) {
    const ref = db.collection('publicProjects').doc(pubId);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.set(
        {
          auth: authPayload.auth,
          googleAuthEnabled: authPayload.googleAuthEnabled,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  return {
    auth: nextAuth,
    ...authPayload,
    secretsStored: secretResults.filter(Boolean),
  };
}

async function applyCreateEntity(projectId, payload) {
  const list = [];
  if (payload.entities?.length) {
    for (const raw of payload.entities) {
      if (!raw || typeof raw !== 'object') continue;
      const id = slugifyEntity(raw.id || raw.name || raw.table);
      list.push({
        id,
        name: String(raw.name || raw.id || id),
        columns: normalizeColumns(raw.columns),
        rows: Array.isArray(raw.rows) ? raw.rows.slice(0, 50) : [],
      });
    }
  } else if (payload.entity) {
    const raw = payload.entity;
    const id = slugifyEntity(raw.id || raw.name || raw.table || 'entity');
    list.push({
      id,
      name: String(raw.name || raw.id || id),
      columns: normalizeColumns(raw.columns),
      rows: Array.isArray(raw.rows) ? raw.rows.slice(0, 50) : [],
    });
  } else if (payload.firestore_updates?.fields_to_update) {
    const f = payload.firestore_updates.fields_to_update;
    const id = slugifyEntity(f.id || f.name || f.entity || 'entity');
    list.push({
      id,
      name: String(f.name || f.id || id),
      columns: normalizeColumns(f.columns),
      rows: Array.isArray(f.rows) ? f.rows.slice(0, 50) : [],
    });
  }

  if (!list.length) {
    const err = new Error('create_entity requer entity/entities com columns.');
    err.status = 400;
    err.code = 'ORCHESTRATE_INVALID';
    throw err;
  }

  const count = await upsertProjectEntities(projectId, list);
  return { entitiesUpserted: count, entities: list.map((e) => ({ id: e.id, name: e.name })) };
}

/**
 * Apply a validated orchestrate payload.
 * @returns {{ ok, applied, wiringPrompt?, ai_response_to_user, ... }}
 */
export async function applyOrchestrate(projectId, project, rawBody) {
  const payload = validateOrchestratePayload(rawBody);
  const applied = [];
  let wiringPrompt = null;
  let authResult = null;
  let entityResult = null;

  // Auth enable / config
  if (
    payload.target_module === 'auth' ||
    (payload.action_type === 'enable_feature' && payload.target_module === 'auth') ||
    payload.auth ||
    (payload.firestore_updates?.collection_path === 'project.auth')
  ) {
    const fields =
      payload.auth ||
      payload.firestore_updates?.fields_to_update ||
      (payload.action_type === 'enable_feature'
        ? { googleEnabled: true, googleMode: 'default' }
        : null);

    if (fields || payload.secrets) {
      authResult = await applyAuthUpdates(projectId, project, fields || {}, payload.secrets);
      applied.push('auth');

      const shouldWire =
        payload.queue_wiring_prompt ||
        (authResult.auth?.googleEnabled &&
          (payload.action_type === 'enable_feature' || payload.ui_injection?.action === 'mount'));

      if (shouldWire && authResult.auth?.googleEnabled) {
        wiringPrompt = buildAuthWiringPrompt({ googleMode: authResult.auth.googleMode });
      }
    }
  }

  // Entities
  if (
    payload.action_type === 'create_entity' ||
    payload.target_module === 'database' ||
    payload.entity ||
    payload.entities ||
    payload.firestore_updates?.collection_path === 'entities' ||
    payload.firestore_updates?.collection_path === 'entities.schema'
  ) {
    if (
      payload.action_type === 'create_entity' ||
      payload.entity ||
      payload.entities ||
      payload.firestore_updates?.collection_path === 'entities' ||
      payload.firestore_updates?.collection_path === 'entities.schema'
    ) {
      entityResult = await applyCreateEntity(projectId, payload);
      applied.push('entities');
    }
  }

  // update_config on project.auth already handled; generic project fields blocked except auth
  if (
    payload.action_type === 'update_config' &&
    payload.target_module === 'auth' &&
    !applied.includes('auth')
  ) {
    const fields = payload.firestore_updates?.fields_to_update || payload.auth || {};
    authResult = await applyAuthUpdates(projectId, project, fields, payload.secrets);
    applied.push('auth');
  }

  if (!applied.length) {
    const err = new Error(
      'Nenhuma alteração aplicada. Verifique action_type / target_module / fields.'
    );
    err.status = 400;
    err.code = 'ORCHESTRATE_NOOP';
    throw err;
  }

  const defaultMsg =
    applied.includes('auth') && authResult?.auth?.googleEnabled
      ? 'Google Login ativado nas configurações do projeto.'
      : applied.includes('entities')
        ? `Entidade(s) criada(s): ${(entityResult?.entities || []).map((e) => e.name).join(', ')}.`
        : 'Configuração atualizada.';

  return {
    ok: true,
    applied,
    auth: authResult?.auth || null,
    googleAuthEnabled: authResult?.googleAuthEnabled ?? null,
    entities: entityResult?.entities || null,
    secretsStored: authResult?.secretsStored || [],
    ui_injection: payload.ui_injection,
    wiringPrompt,
    ai_response_to_user: payload.ai_response_to_user || defaultMsg,
  };
}

/**
 * Detect user chat intents that should go through orchestrate (not free-form AI infra).
 * Returns a payload or null.
 */
export function detectOrchestrateIntent(userText) {
  const text = String(userText || '').trim();
  if (!text) return null;
  const lower = text.toLowerCase();

  // Enable Google login
  if (
    /\b(ativar|enable|ligar|liga|quero)\b/.test(lower) &&
    /\b(google\s*(login|auth|oauth)|login\s*(com\s*)?google|autentica[cç][aã]o\s*google)\b/.test(
      lower
    )
  ) {
    return {
      action_type: 'enable_feature',
      target_module: 'auth',
      firestore_updates: {
        collection_path: 'project.auth',
        fields_to_update: { googleEnabled: true, googleMode: 'default' },
      },
      ui_injection: {
        component_id: 'SignInWithGoogleButton',
        action: 'mount',
        props_to_pass: {},
      },
      queue_wiring_prompt: true,
      ai_response_to_user:
        'Google Login ativado. Vou ligar o botão nas páginas de Login/Register.',
    };
  }

  // Create entity / table — "criar tabela de clientes", "cria entidade produtos"
  const entityMatch = lower.match(
    /\b(?:criar|cria|crie|adicionar|adiciona)\s+(?:uma?\s+)?(?:tabela|entidade|collection|cole[cç][aã]o)\s+(?:de\s+|para\s+|chamad[ao]\s+)?["']?([a-záàâãéêíóôõúç0-9_\s-]{2,40})["']?/i
  );
  if (entityMatch) {
    const name = String(entityMatch[1] || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40);
    if (name && !/^(dados|banco|base)$/i.test(name)) {
      const id = slugifyEntity(name);
      return {
        action_type: 'create_entity',
        target_module: 'database',
        entity: {
          id,
          name: name.charAt(0).toUpperCase() + name.slice(1),
          columns: [
            { name: 'name', type: 'string' },
            { name: 'email', type: 'email' },
            { name: 'createdAt', type: 'date' },
          ],
        },
        firestore_updates: {
          collection_path: 'entities.schema',
          fields_to_update: { id, name },
        },
        ai_response_to_user: `Entidade "${name}" criada no schema do projeto.`,
      };
    }
  }

  return null;
}
