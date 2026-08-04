// Project delete (Admin SDK cascade) — owner only.
// Backend Functions enable + public data API (Base44-style freemium).

import { Router } from 'express';
import admin from '../config/firebaseAdmin.js';
import { db } from '../config/firebaseAdmin.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { ensureUserAdmin, debitCredit } from '../middleware/credits.js';
import {
  canUsePremium,
  BACKEND_ENABLE_CREDIT_COST,
  BACKEND_REQUIRED_MESSAGE,
} from '../lib/owner.js';
import { projectDataOp, getEntityPermissions } from '../services/entities.js';
import {
  AUTH_ACCESS_DENIED_MESSAGE,
  isEmailAllowedForProjectAuth,
  normalizeAuthAccess,
  normalizeEmail,
  publicAuthAccessPayload,
} from '../services/authAccess.js';
import {
  createProjectApiKey,
  listProjectApiKeys,
  revokeProjectApiKey,
  resolveDataAccessLevel,
  normalizeAccessLevel,
} from '../services/projectApiKeys.js';

const router = Router();

async function syncAuthAccessToPublicSnapshots(projectId, { authAccess, ownerEmail }) {
  const updates = [projectId, `${projectId}_preview`];
  const payload = {
    authAccess: normalizeAuthAccess(authAccess),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (ownerEmail != null) {
    payload.ownerEmail = normalizeEmail(ownerEmail) || null;
  }
  for (const pubId of updates) {
    const ref = db.collection('publicProjects').doc(pubId);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.set(payload, { merge: true });
    }
  }
}

async function deleteQueryInChunks(query, chunkSize = 400) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await query.limit(chunkSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snap.size < chunkSize) break;
  }
}

async function cascadeDeleteProject(projectId) {
  const projectRef = db.collection('projects').doc(projectId);
  const projectSnap = await projectRef.get();
  const slug = String(projectSnap.data()?.slug || '').trim().toLowerCase();

  await deleteQueryInChunks(projectRef.collection('messages'));
  await deleteQueryInChunks(projectRef.collection('automations'));
  await deleteQueryInChunks(projectRef.collection('automationRuns'));
  await deleteQueryInChunks(projectRef.collection('checkpoints'));
  await deleteQueryInChunks(projectRef.collection('apiKeys'));
  await deleteQueryInChunks(projectRef.collection('deployHistory'));
  await deleteQueryInChunks(projectRef.collection('envSecrets'));

  const entitiesSnap = await projectRef.collection('entities').get();
  for (const ent of entitiesSnap.docs) {
    await deleteQueryInChunks(ent.ref.collection('rows'));
    await ent.ref.delete();
  }

  // Public snapshots (ignore missing docs)
  const pubIds = [projectId, `${projectId}_preview`];
  for (const pubId of pubIds) {
    try {
      await db.collection('publicProjects').doc(pubId).delete();
    } catch {
      /* missing ok */
    }
  }

  if (slug && slug !== projectId) {
    try {
      const slugRef = db.collection('projectSlugs').doc(slug);
      const slugSnap = await slugRef.get();
      if (slugSnap.exists && slugSnap.data()?.projectId === projectId) {
        await slugRef.delete();
      }
    } catch {
      /* missing ok */
    }
  }

  await projectRef.delete();
}

async function assertOwner(projectId, uid) {
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists) {
    const err = new Error('Projeto não encontrado.');
    err.status = 404;
    throw err;
  }
  if (snap.data()?.ownerId !== uid) {
    const err = new Error('Sem permissão neste projeto.');
    err.status = 403;
    throw err;
  }
  return snap;
}

async function loadProjectOrThrow(projectId) {
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists) {
    const err = new Error('Projeto não encontrado.');
    err.status = 404;
    throw err;
  }
  return { ref: snap.ref, data: snap.data() || {}, id: snap.id };
}

async function syncBackendFlagToPublicSnapshots(projectId, backendEnabled) {
  const updates = [projectId, `${projectId}_preview`];
  for (const pubId of updates) {
    const ref = db.collection('publicProjects').doc(pubId);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.set(
        {
          backendEnabled: Boolean(backendEnabled),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }
}

/** POST /api/projects/bulk-delete  { projectIds: string[] } */
router.post('/bulk-delete', requireAuth, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.projectIds)
      ? [...new Set(req.body.projectIds.filter((id) => typeof id === 'string' && id.trim()))]
      : [];
    if (!ids.length) {
      return res.status(400).json({ error: 'projectIds é obrigatório.' });
    }
    if (ids.length > 50) {
      return res.status(400).json({ error: 'Máximo 50 projetos por pedido.' });
    }

    const deleted = [];
    const failed = [];
    for (const projectId of ids) {
      try {
        await assertOwner(projectId, req.user.uid);
        await cascadeDeleteProject(projectId);
        deleted.push(projectId);
      } catch (err) {
        failed.push({ projectId, error: err.message || 'Falha' });
      }
    }

    res.json({ ok: failed.length === 0, deleted, failed });
  } catch (err) {
    console.error('[projects/bulk-delete]', err);
    res.status(500).json({ error: err.message || 'Falha ao eliminar projetos.' });
  }
});

/**
 * GET /api/projects/:projectId/auth-access — public allowlist for published Google login.
 */
router.get('/:projectId/auth-access', async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId é obrigatório.' });
    }
    const { data: project } = await loadProjectOrThrow(projectId);
    res.json({ ok: true, ...publicAuthAccessPayload(project) });
  } catch (err) {
    console.error('[projects/auth-access]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao ler permissões.' });
  }
});

/**
 * POST /api/projects/:projectId/auth-check — { email, uid } → { allowed }.
 * Used by GoCreateAuth after Google sign-in on published apps.
 */
router.post('/:projectId/auth-check', async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId é obrigatório.' });
    }
    const { data: project } = await loadProjectOrThrow(projectId);
    const allowed = isEmailAllowedForProjectAuth(
      { email: req.body?.email, uid: req.body?.uid },
      project
    );
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        allowed: false,
        error: AUTH_ACCESS_DENIED_MESSAGE,
        message: AUTH_ACCESS_DENIED_MESSAGE,
        code: 'AUTH_ACCESS_DENIED',
      });
    }
    res.json({ ok: true, allowed: true });
  } catch (err) {
    console.error('[projects/auth-check]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha ao verificar permissão.',
      code: err.code,
    });
  }
});

/**
 * PUT /api/projects/:projectId/auth-access — owner updates allowlist.
 * Body: { mode, invitedEmails[] }
 */
router.put('/:projectId/auth-access', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const snap = await assertOwner(projectId, req.user.uid);
    const data = snap.data() || {};
    const authAccess = normalizeAuthAccess({
      mode: req.body?.mode,
      invitedEmails: req.body?.invitedEmails,
    });
    const ownerEmail =
      normalizeEmail(req.body?.ownerEmail) ||
      normalizeEmail(data.ownerEmail) ||
      normalizeEmail(req.user.email) ||
      null;

    await snap.ref.set(
      {
        authAccess,
        ownerEmail,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await syncAuthAccessToPublicSnapshots(projectId, { authAccess, ownerEmail });

    res.json({
      ok: true,
      authAccess,
      ownerEmail,
    });
  } catch (err) {
    console.error('[projects/auth-access/put]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao guardar permissões.' });
  }
});

/**
 * GET /api/projects/:projectId/runtime — public hint for published / preview apps.
 * Returns live projects.backendEnabled (not the possibly-stale publicProjects snapshot).
 */
router.get('/:projectId/runtime', async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId é obrigatório.' });
    }
    const { data: project } = await loadProjectOrThrow(projectId);

    // Inject project env secrets into published SPA runtime (Base44-style).
    // Values are visible in the browser — use only for client-safe config.
    const env = {};
    try {
      const secretSnap = await db
        .collection('projects')
        .doc(projectId)
        .collection('envSecrets')
        .get();
      secretSnap.docs.forEach((d) => {
        const data = d.data() || {};
        const key = String(data.key || d.id || '')
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9_]/g, '');
        const value = data.value;
        if (key && value != null && value !== '') {
          env[key] = String(value);
        }
      });
    } catch (envErr) {
      console.warn('[projects/runtime] envSecrets:', envErr?.message);
    }

    res.json({
      ok: true,
      projectId,
      backendEnabled: Boolean(project.backendEnabled),
      env,
      customDomain: project.customDomain || '',
      customDomainVerified: Boolean(project.customDomainVerified),
      ...publicAuthAccessPayload(project),
    });
  } catch (err) {
    console.error('[projects/runtime]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao ler runtime.' });
  }
});

/**
 * GET /api/projects/:projectId/backend — status (owner).
 */
router.get('/:projectId/backend', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const snap = await assertOwner(projectId, req.user.uid);
    const data = snap.data() || {};
    const profile = await ensureUserAdmin(req.user.uid, req.user.email);
    const freeCost =
      canUsePremium({ plan: profile.plan, role: profile.role, email: req.user.email })
        ? 0
        : BACKEND_ENABLE_CREDIT_COST;
    res.json({
      ok: true,
      backendEnabled: Boolean(data.backendEnabled),
      creditCost: freeCost,
      credits: profile.credits,
      unlimited: profile.unlimited,
    });
  } catch (err) {
    console.error('[projects/backend/get]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao ler backend.' });
  }
});

/**
 * POST /api/projects/:projectId/backend/enable — Ativar funções de Backend.
 * Free: gasta BACKEND_ENABLE_CREDIT_COST (precisa de créditos).
 * Pro / Owner: grátis.
 */
router.post('/:projectId/backend/enable', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const snap = await assertOwner(projectId, req.user.uid);
    const data = snap.data() || {};

    if (data.backendEnabled) {
      // Re-sync snapshot even if already on (stale publicProjects before enable shipped).
      try {
        await syncBackendFlagToPublicSnapshots(projectId, true);
      } catch (syncErr) {
        console.warn('[projects/backend/enable] snapshot sync:', syncErr?.message);
      }
      return res.json({
        ok: true,
        backendEnabled: true,
        alreadyEnabled: true,
        creditsCharged: 0,
      });
    }

    const profile = await ensureUserAdmin(req.user.uid, req.user.email);
    const premium = canUsePremium({
      plan: profile.plan,
      role: profile.role,
      email: req.user.email,
    });
    let creditsCharged = 0;

    if (!premium) {
      if (profile.credits <= 0) {
        return res.status(403).json({
          error: 'Créditos insuficientes para ativar Backend Functions.',
          message: 'Créditos insuficientes para ativar Backend Functions.',
          code: 'INSUFFICIENT_CREDITS',
          creditCost: BACKEND_ENABLE_CREDIT_COST,
        });
      }
      if (profile.credits < BACKEND_ENABLE_CREDIT_COST) {
        return res.status(403).json({
          error: `Precisas de ${BACKEND_ENABLE_CREDIT_COST} créditos para ativar Backend Functions.`,
          message: `Precisas de ${BACKEND_ENABLE_CREDIT_COST} créditos para ativar Backend Functions.`,
          code: 'INSUFFICIENT_CREDITS',
          creditCost: BACKEND_ENABLE_CREDIT_COST,
        });
      }
      await debitCredit(req.user.uid, BACKEND_ENABLE_CREDIT_COST);
      creditsCharged = BACKEND_ENABLE_CREDIT_COST;
    }

    await snap.ref.set(
      {
        backendEnabled: true,
        backendEnabledAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await syncBackendFlagToPublicSnapshots(projectId, true);

    const after = await ensureUserAdmin(req.user.uid, req.user.email);
    res.json({
      ok: true,
      backendEnabled: true,
      creditsCharged,
      credits: after.credits,
    });
  } catch (err) {
    console.error('[projects/backend/enable]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha ao ativar Backend Functions.',
      code: err.code,
    });
  }
});

/**
 * Resolve caller access for Data API (public | API key | Firebase).
 */
async function resolveRequestAccess(req, projectId, project) {
  const apiKeyHeader =
    req.headers['x-gocreate-key'] ||
    req.headers['x-api-key'] ||
    (String(req.headers.authorization || '').startsWith('Bearer gck_')
      ? String(req.headers.authorization).slice(7)
      : '');
  return resolveDataAccessLevel(projectId, {
    apiKeyHeader,
    firebaseUser: req.user || null,
    projectOwnerId: project.ownerId,
  });
}

/**
 * GET/POST /api/projects/:projectId/api-keys — owner only.
 */
router.get('/:projectId/api-keys', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    await assertOwner(projectId, req.user.uid);
    const keys = await listProjectApiKeys(projectId);
    res.json({ ok: true, keys });
  } catch (err) {
    console.error('[projects/api-keys/list]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao listar API keys.' });
  }
});

router.post('/:projectId/api-keys', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    await assertOwner(projectId, req.user.uid);
    const created = await createProjectApiKey(projectId, { name: req.body?.name });
    res.json({ ok: true, ...created });
  } catch (err) {
    console.error('[projects/api-keys/create]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao criar API key.' });
  }
});

router.delete('/:projectId/api-keys/:keyId', requireAuth, async (req, res) => {
  try {
    const { projectId, keyId } = req.params;
    await assertOwner(projectId, req.user.uid);
    await revokeProjectApiKey(projectId, keyId);
    res.json({ ok: true, id: keyId });
  } catch (err) {
    console.error('[projects/api-keys/revoke]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao revogar API key.' });
  }
});

/**
 * PATCH /api/projects/:projectId/entities/:entityId/permissions
 */
router.patch('/:projectId/entities/:entityId/permissions', requireAuth, async (req, res) => {
  try {
    const { projectId, entityId } = req.params;
    await assertOwner(projectId, req.user.uid);
    const ref = db.collection('projects').doc(projectId).collection('entities').doc(entityId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Entidade não encontrada.' });
    }
    const permissions = {
      read: normalizeAccessLevel(req.body?.read ?? snap.data()?.permissions?.read, 'public'),
      write: normalizeAccessLevel(req.body?.write ?? snap.data()?.permissions?.write, 'public'),
    };
    await ref.set(
      { permissions, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    res.json({ ok: true, entityId, permissions });
  } catch (err) {
    console.error('[projects/entities/permissions]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao guardar permissões.' });
  }
});

/**
 * GET /api/projects/:projectId/openapi.json — docs for Data API.
 */
router.get('/:projectId/openapi.json', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { data: project } = await loadProjectOrThrow(projectId);
    const entitiesSnap = await db.collection('projects').doc(projectId).collection('entities').get();
    const entities = entitiesSnap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        name: data.name || d.id,
        columns: data.columns || [],
        permissions: getEntityPermissions(data),
      };
    });

    const basePath = `/api/projects/${projectId}/data`;
    const spec = {
      openapi: '3.0.3',
      info: {
        title: `GoCreate Data API — ${project.name || projectId}`,
        version: '1.0.0',
        description:
          'CRUD de entidades do projeto. Header `X-GoCreate-Key: gck_…` para nível authenticated; Bearer Firebase do dono = admin.',
      },
      servers: [{ url: 'https://gocreate.web.app' }],
      paths: {
        [basePath]: {
          post: {
            summary: 'CRUD (list|get|create|update|delete)',
            parameters: [
              {
                name: 'X-GoCreate-Key',
                in: 'header',
                required: false,
                schema: { type: 'string' },
                description: 'API key do projeto (gck_…)',
              },
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['action', 'entity'],
                    properties: {
                      action: {
                        type: 'string',
                        enum: ['list', 'get', 'create', 'update', 'delete'],
                      },
                      entity: { type: 'string', example: entities[0]?.id || 'products' },
                      id: { type: 'string' },
                      data: { type: 'object' },
                    },
                  },
                  examples: {
                    list: {
                      value: { action: 'list', entity: entities[0]?.id || 'products' },
                    },
                    create: {
                      value: {
                        action: 'create',
                        entity: entities[0]?.id || 'products',
                        data: { name: 'Exemplo' },
                      },
                    },
                  },
                },
              },
            },
            responses: {
              200: { description: 'OK' },
              403: { description: 'Backend off ou permissão negada' },
            },
          },
          get: {
            summary: 'Listar linhas (?entity=)',
            parameters: [
              { name: 'entity', in: 'query', required: true, schema: { type: 'string' } },
              {
                name: 'X-GoCreate-Key',
                in: 'header',
                required: false,
                schema: { type: 'string' },
              },
            ],
            responses: { 200: { description: 'OK' } },
          },
        },
      },
      'x-gocreate-entities': entities,
      'x-gocreate-backendEnabled': Boolean(project.backendEnabled),
    };
    res.json(spec);
  } catch (err) {
    console.error('[projects/openapi]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao gerar OpenAPI.' });
  }
});

/**
 * Env secrets (masked) — owner only.
 */
router.get('/:projectId/env-secrets', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    await assertOwner(projectId, req.user.uid);
    const snap = await db.collection('projects').doc(projectId).collection('envSecrets').get();
    const secrets = snap.docs.map((d) => {
      const data = d.data() || {};
      const val = String(data.value || '');
      return {
        id: d.id,
        key: data.key || d.id,
        masked: val ? `${'*'.repeat(Math.min(8, val.length))}${val.slice(-4)}` : '',
        updatedAt: data.updatedAt || null,
      };
    });
    res.json({ ok: true, secrets });
  } catch (err) {
    console.error('[projects/env-secrets/list]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao listar secrets.' });
  }
});

router.put('/:projectId/env-secrets/:key', requireAuth, async (req, res) => {
  try {
    const { projectId, key } = req.params;
    await assertOwner(projectId, req.user.uid);
    const safeKey = String(key || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '')
      .slice(0, 64);
    if (!safeKey) return res.status(400).json({ error: 'Chave inválida.' });
    const value = String(req.body?.value ?? '');
    if (!value) return res.status(400).json({ error: 'value é obrigatório.' });
    await db
      .collection('projects')
      .doc(projectId)
      .collection('envSecrets')
      .doc(safeKey)
      .set(
        {
          key: safeKey,
          value,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    res.json({
      ok: true,
      key: safeKey,
      masked: `${'*'.repeat(Math.min(8, value.length))}${value.slice(-4)}`,
    });
  } catch (err) {
    console.error('[projects/env-secrets/put]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao guardar secret.' });
  }
});

router.delete('/:projectId/env-secrets/:key', requireAuth, async (req, res) => {
  try {
    const { projectId, key } = req.params;
    await assertOwner(projectId, req.user.uid);
    await db.collection('projects').doc(projectId).collection('envSecrets').doc(key).delete();
    res.json({ ok: true, key });
  } catch (err) {
    console.error('[projects/env-secrets/delete]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao apagar secret.' });
  }
});

/**
 * POST /api/projects/:projectId/data — runtime CRUD (preview + published apps).
 * Auth: optional Firebase / X-GoCreate-Key; entity permissions enforce RLS-ish.
 * Body: { action, entity, id?, data? }
 */
router.post('/:projectId/data', optionalAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId é obrigatório.' });
    }
    const { data: project } = await loadProjectOrThrow(projectId);
    if (!project.backendEnabled) {
      return res.status(403).json({
        error: BACKEND_REQUIRED_MESSAGE,
        message: BACKEND_REQUIRED_MESSAGE,
        code: 'BACKEND_REQUIRED',
      });
    }

    const accessLevel = await resolveRequestAccess(req, projectId, project);
    const result = await projectDataOp(projectId, {
      action: req.body?.action,
      entity: req.body?.entity,
      id: req.body?.id,
      data: req.body?.data,
      accessLevel,
    });
    res.json(result);
  } catch (err) {
    console.error('[projects/data]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha na API de dados.',
      code: err.code,
    });
  }
});

/**
 * GET /api/projects/:projectId/data?entity=products — list rows (requires backendEnabled).
 */
router.get('/:projectId/data', optionalAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const entity = req.query?.entity;
    if (!entity) {
      return res.status(400).json({ error: 'Query entity é obrigatória.' });
    }
    const { data: project } = await loadProjectOrThrow(projectId);
    if (!project.backendEnabled) {
      return res.status(403).json({
        error: BACKEND_REQUIRED_MESSAGE,
        message: BACKEND_REQUIRED_MESSAGE,
        code: 'BACKEND_REQUIRED',
      });
    }
    const accessLevel = await resolveRequestAccess(req, projectId, project);
    const result = await projectDataOp(projectId, { action: 'list', entity, accessLevel });
    res.json(result);
  } catch (err) {
    console.error('[projects/data/get]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha na API de dados.',
      code: err.code,
    });
  }
});

/** DELETE /api/projects/:projectId */
router.delete('/:projectId', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId é obrigatório.' });
    }
    await assertOwner(projectId, req.user.uid);
    await cascadeDeleteProject(projectId);
    res.json({ ok: true, projectId });
  } catch (err) {
    console.error('[projects/delete]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao eliminar projeto.' });
  }
});

export default router;
