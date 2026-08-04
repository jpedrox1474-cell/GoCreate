/**
 * JSON orchestration engine — structured intents applied by Node (not free-form infra from the model).
 *
 * Payload shape:
 * {
 *   action_type: "enable_feature" | "create_entity" | "deploy_schema" | "update_config",
 *   target_module?: "auth" | "database" | "ui_layout" | "api_integration",
 *   module_name?: string,
 *   firestore_schema?: { collection_name, is_tenant_isolated, fields[] },
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

const ACTION_TYPES = new Set([
  'enable_feature',
  'create_entity',
  'deploy_schema',
  'update_config',
]);
const TARGET_MODULES = new Set(['auth', 'database', 'ui_layout', 'api_integration']);

/** Data Architect field types (+ legacy entity aliases). */
const DEPLOY_FIELD_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'timestamp',
  'array',
  'map',
  'text',
  'date',
  'email',
  'url',
  'json',
]);

/** Map Data Architect types → internal column types. */
const TYPE_ALIASES = {
  timestamp: 'timestamp',
  date: 'timestamp',
  array: 'array',
  map: 'map',
  json: 'map',
  text: 'string',
};

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

function mapFieldType(rawType) {
  const t = String(rawType || 'string').toLowerCase().trim();
  if (TYPE_ALIASES[t]) return TYPE_ALIASES[t];
  if (DEPLOY_FIELD_TYPES.has(t)) return t;
  return 'string';
}

/**
 * Normalize columns for create_entity (legacy).
 */
function normalizeColumns(columns) {
  if (!Array.isArray(columns) || !columns.length) {
    return [
      { name: 'name', type: 'string', required: false },
      { name: 'createdAt', type: 'timestamp', required: false },
    ];
  }
  return columns
    .map((c, i) => {
      if (!c) return null;
      if (typeof c === 'string') {
        return { name: c, type: 'string', required: false, order: i };
      }
      const name = String(c.name || c.key || '')
        .trim()
        .replace(/[^A-Za-z0-9_]/g, '');
      if (!name) return null;
      return {
        name,
        type: mapFieldType(c.type),
        required: Boolean(c.required),
        label: typeof c.label === 'string' ? c.label.trim().slice(0, 80) : undefined,
        order: typeof c.order === 'number' ? c.order : i,
      };
    })
    .filter(Boolean)
    .map((c, i) => ({ ...c, order: i }));
}

/**
 * Normalize Data Architect firestore_schema.fields → entity columns + form metadata.
 */
function normalizeDeployFields(fields) {
  if (!Array.isArray(fields) || !fields.length) {
    const err = new Error('firestore_schema.fields deve ser um array com pelo menos 1 campo.');
    err.status = 400;
    err.code = 'ORCHESTRATE_INVALID';
    throw err;
  }

  const columns = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (!f || typeof f !== 'object') continue;
    const name = String(f.name || f.key || '')
      .trim()
      .replace(/[^A-Za-z0-9_]/g, '');
    if (!name) continue;
    columns.push({
      name,
      type: mapFieldType(f.type),
      required: f.required === true || f.required === 'true',
      label:
        typeof f.label === 'string' && f.label.trim()
          ? f.label.trim().slice(0, 80)
          : name.charAt(0).toUpperCase() + name.slice(1),
      order: i,
    });
  }

  if (!columns.length) {
    const err = new Error('firestore_schema.fields sem nomes de campo válidos.');
    err.status = 400;
    err.code = 'ORCHESTRATE_INVALID';
    throw err;
  }

  return columns.map((c, i) => ({ ...c, order: i }));
}

/**
 * Build form field metadata for Entities UI from columns.
 */
function buildFormFields(columns) {
  return (columns || []).map((c, i) => ({
    name: c.name,
    type: c.type,
    required: Boolean(c.required),
    label: c.label || c.name,
    order: typeof c.order === 'number' ? c.order : i,
  }));
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
  let target_module = String(body.target_module || '').trim();

  if (!ACTION_TYPES.has(action_type)) {
    const err = new Error(
      `action_type inválido. Use: ${[...ACTION_TYPES].join(' | ')}`
    );
    err.status = 400;
    err.code = 'ORCHESTRATE_INVALID';
    throw err;
  }

  // Data Architect: target_module optional → database
  if (
    (action_type === 'deploy_schema' || action_type === 'create_entity') &&
    !target_module
  ) {
    target_module = 'database';
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

  // deploy_schema: validate firestore_schema shape early
  let firestore_schema = null;
  if (body.firestore_schema && typeof body.firestore_schema === 'object') {
    firestore_schema = { ...body.firestore_schema };
    // Force multi-tenant isolation (coerce false → true)
    firestore_schema.is_tenant_isolated = true;
    if (!firestore_schema.collection_name && body.module_name) {
      firestore_schema.collection_name = String(body.module_name);
    }
    if (!Array.isArray(firestore_schema.fields)) {
      const err = new Error('firestore_schema.fields é obrigatório (array).');
      err.status = 400;
      err.code = 'ORCHESTRATE_INVALID';
      throw err;
    }
  } else if (action_type === 'deploy_schema') {
    const err = new Error(
      'deploy_schema requer firestore_schema { collection_name, fields[] }.'
    );
    err.status = 400;
    err.code = 'ORCHESTRATE_INVALID';
    throw err;
  }

  return {
    action_type,
    target_module,
    module_name:
      typeof body.module_name === 'string' ? body.module_name.trim().slice(0, 80) : '',
    firestore_schema,
    firestore_updates: body.firestore_updates || null,
    ui_injection: body.ui_injection || null,
    ai_response_to_user:
      typeof body.ai_response_to_user === 'string'
        ? body.ai_response_to_user.trim().slice(0, 500)
        : '',
    queue_wiring_prompt: Boolean(body.queue_wiring_prompt),
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
      const columns = normalizeColumns(raw.columns);
      list.push({
        id,
        name: String(raw.name || raw.id || id),
        columns,
        formFields: buildFormFields(columns),
        is_tenant_isolated: true,
        rows: Array.isArray(raw.rows) ? raw.rows.slice(0, 50) : [],
      });
    }
  } else if (payload.entity) {
    const raw = payload.entity;
    const id = slugifyEntity(raw.id || raw.name || raw.table || 'entity');
    const columns = normalizeColumns(raw.columns);
    list.push({
      id,
      name: String(raw.name || raw.id || id),
      columns,
      formFields: buildFormFields(columns),
      is_tenant_isolated: true,
      rows: Array.isArray(raw.rows) ? raw.rows.slice(0, 50) : [],
    });
  } else if (payload.firestore_updates?.fields_to_update) {
    const f = payload.firestore_updates.fields_to_update;
    const id = slugifyEntity(f.id || f.name || f.entity || 'entity');
    const columns = normalizeColumns(f.columns);
    list.push({
      id,
      name: String(f.name || f.id || id),
      columns,
      formFields: buildFormFields(columns),
      is_tenant_isolated: true,
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
 * Data Architect: deploy_schema → project entities (tenant-isolated under projects/{id}/entities).
 */
async function applyDeploySchema(projectId, payload) {
  const schema = payload.firestore_schema;
  if (!schema) {
    const err = new Error('deploy_schema requer firestore_schema.');
    err.status = 400;
    err.code = 'ORCHESTRATE_INVALID';
    throw err;
  }

  const collectionRaw = String(
    schema.collection_name || payload.module_name || ''
  ).trim();
  if (!collectionRaw) {
    const err = new Error('firestore_schema.collection_name (ou module_name) é obrigatório.');
    err.status = 400;
    err.code = 'ORCHESTRATE_INVALID';
    throw err;
  }

  const id = slugifyEntity(collectionRaw);
  const displayName =
    payload.module_name ||
    String(schema.collection_name || id)
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase());

  const columns = normalizeDeployFields(schema.fields);
  const formFields = buildFormFields(columns);

  const entity = {
    id,
    name: displayName,
    columns,
    formFields,
    is_tenant_isolated: true,
    source: 'deploy_schema',
    rows: [],
  };

  const count = await upsertProjectEntities(projectId, [entity]);
  return {
    entitiesUpserted: count,
    entities: [{ id: entity.id, name: entity.name }],
    schema: {
      collection_name: id,
      is_tenant_isolated: true,
      path: `projects/${projectId}/entities/${id}/rows`,
      fields: columns.map((c) => ({
        name: c.name,
        type: c.type,
        required: c.required,
      })),
      formFields,
    },
  };
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
    payload.firestore_updates?.collection_path === 'project.auth'
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

  // Data Architect deploy_schema (primary path for new modules)
  if (payload.action_type === 'deploy_schema') {
    entityResult = await applyDeploySchema(projectId, payload);
    applied.push('entities');
    applied.push('deploy_schema');
  } else if (
    // create_entity alias + legacy paths
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
      // If create_entity arrives with firestore_schema, prefer deploy path
      if (payload.firestore_schema) {
        entityResult = await applyDeploySchema(projectId, payload);
        applied.push('entities');
        applied.push('deploy_schema');
      } else {
        entityResult = await applyCreateEntity(projectId, payload);
        applied.push('entities');
      }
    }
  }

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
      : applied.includes('deploy_schema')
        ? `Módulo "${(entityResult?.entities || [])[0]?.name || 'dados'}" criado no schema do projeto.`
        : applied.includes('entities')
          ? `Entidade(s) criada(s): ${(entityResult?.entities || []).map((e) => e.name).join(', ')}.`
          : 'Configuração atualizada.';

  return {
    ok: true,
    applied,
    auth: authResult?.auth || null,
    googleAuthEnabled: authResult?.googleAuthEnabled ?? null,
    entities: entityResult?.entities || null,
    schema: entityResult?.schema || null,
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

  // Data Architect: criar tabela / módulo / coleção / entidade de X
  const entityMatch = lower.match(
    /\b(?:criar|cria|crie|adicionar|adiciona|gerar|gera)\s+(?:uma?\s+|um\s+)?(?:tabela|entidade|m[oó]dulo|collection|cole[cç][aã]o|schema)\s+(?:de\s+|para\s+|chamad[ao]\s+)?["']?([a-záàâãéêíóôõúç0-9_\s-]{2,40})["']?/i
  );
  if (entityMatch) {
    const name = String(entityMatch[1] || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40);
    if (name && !/^(dados|banco|base|dados?)$/i.test(name)) {
      const id = slugifyEntity(name);
      const display = name.charAt(0).toUpperCase() + name.slice(1);
      return {
        action_type: 'deploy_schema',
        target_module: 'database',
        module_name: display,
        firestore_schema: {
          collection_name: id,
          is_tenant_isolated: true,
          fields: [
            { name: 'name', type: 'string', required: true },
            { name: 'email', type: 'string', required: false },
            { name: 'createdAt', type: 'timestamp', required: false },
          ],
        },
        firestore_updates: {
          collection_path: 'entities.schema',
          fields_to_update: { id, name: display },
        },
        ai_response_to_user: `Módulo "${display}" criado no banco do projeto (isolado por tenant).`,
      };
    }
  }

  return null;
}
