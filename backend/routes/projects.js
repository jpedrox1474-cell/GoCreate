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
  mergeProjectAuth,
  normalizeProjectAuth,
  publicProjectAuthPayload,
  buildAuthWiringPrompt,
  isClientSafeEnvSecretKey,
  GOOGLE_OAUTH_CLIENT_ID_KEY,
  GOOGLE_OAUTH_CLIENT_SECRET_KEY,
} from '../services/projectAuth.js';
import { applyOrchestrate } from '../services/orchestrate.js';
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

  const fnSnap = await projectRef.collection('backendFunctions').get();
  for (const fn of fnSnap.docs) {
    await deleteQueryInChunks(fn.ref.collection('logs'));
  }
  await deleteQueryInChunks(projectRef.collection('backendFunctions'));

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

async function assertOwnerOrEditor(projectId, uid, email) {
  const { resolveProjectRole, canEditProject } = await import('../services/collaborators.js');
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists) {
    const err = new Error('Projeto não encontrado.');
    err.status = 404;
    throw err;
  }
  const project = snap.data() || {};
  const role = resolveProjectRole(project, email, uid);
  if (!canEditProject(role)) {
    const err = new Error('Sem permissão de edição neste projeto.');
    err.status = 403;
    throw err;
  }
  return { snap, project, role };
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

const PROJECT_COLORS = [
  'from-blue-600 to-indigo-600',
  'from-emerald-600 to-teal-600',
  'from-violet-600 to-purple-600',
  'from-amber-600 to-orange-600',
  'from-rose-600 to-pink-600',
  'from-cyan-600 to-blue-600',
];

/**
 * POST /api/projects — create project via Admin SDK (bypasses client rules).
 * Body: { name?, description?, isDefault? }
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const name = String(req.body?.name || 'Novo Projeto').trim() || 'Novo Projeto';
    const description =
      String(req.body?.description || 'Projeto criado com GoCreate').trim() ||
      'Projeto criado com GoCreate';
    const isDefault = Boolean(req.body?.isDefault);
    const ownerEmail =
      normalizeEmail(req.body?.ownerEmail || req.user.email) || null;
    const color = PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
    const ref = db.collection('projects').doc();
    const now = admin.firestore.FieldValue.serverTimestamp();

    await ref.set({
      ownerId: uid,
      ownerEmail,
      authAccess: { mode: 'owner_only', invitedEmails: [] },
      auth: { googleEnabled: false, googleMode: 'default', emailPasswordEnabled: false },
      name,
      description,
      status: 'draft',
      framework: 'React + Tailwind',
      color,
      isDefault,
      backendEnabled: false,
      createdAt: now,
      updatedAt: now,
    });

    try {
      await ref.collection('messages').add({
        role: 'ai',
        text: 'Olá! Bem-vindo ao GoCreate. O que vamos construir hoje?',
        uid: null,
        attachmentUrl: null,
        createdAt: now,
      });
    } catch (msgErr) {
      console.warn('[projects] welcome message:', msgErr?.message || msgErr);
    }

    return res.status(201).json({ id: ref.id, name, ownerId: uid });
  } catch (err) {
    console.error('[projects] create:', err);
    return res.status(500).json({ error: err.message || 'Falha ao criar projeto.' });
  }
});

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
 * GET /api/projects/:projectId/auth — project auth feature flags (owner/editor).
 */
router.get('/:projectId/auth', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { project } = await assertOwnerOrEditor(projectId, req.user.uid, req.user.email);
    const auth = normalizeProjectAuth(project.auth);
    const payload = publicProjectAuthPayload(project);
    res.json({
      ok: true,
      auth,
      backendEnabled: Boolean(project.backendEnabled),
      ...payload,
      wiringPrompt: auth.googleEnabled
        ? buildAuthWiringPrompt({ googleMode: auth.googleMode })
        : null,
    });
  } catch (err) {
    console.error('[projects/auth/get]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao ler auth.' });
  }
});

/**
 * PUT /api/projects/:projectId/auth — update Google/Email auth flags (+ optional custom OAuth secrets).
 * Body: { googleEnabled?, googleMode?, emailPasswordEnabled?, googleClientId?, googleClientSecret? }
 * Secrets go to envSecrets (encrypted). Client Secret is never returned or injected into SPA runtime.
 */
router.put('/:projectId/auth', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { snap, project } = await assertOwnerOrEditor(projectId, req.user.uid, req.user.email);

    const nextAuth = mergeProjectAuth(project.auth, {
      googleEnabled: req.body?.googleEnabled,
      googleMode: req.body?.googleMode,
      emailPasswordEnabled: req.body?.emailPasswordEnabled,
    });

    // Custom mode requires Client ID (secret optional until custom OAuth runtime ships)
    if (nextAuth.googleEnabled && nextAuth.googleMode === 'custom') {
      const clientId = String(
        req.body?.googleClientId || req.body?.clientId || ''
      ).trim();
      // Allow saving mode without re-pasting if secret already stored — check existing
      if (!clientId && !req.body?.keepExistingCredentials) {
        const existingId = await snap.ref
          .collection('envSecrets')
          .doc(GOOGLE_OAUTH_CLIENT_ID_KEY)
          .get();
        if (!existingId.exists) {
          return res.status(400).json({
            error: 'Custom OAuth requer Google Client ID.',
            code: 'CUSTOM_OAUTH_CLIENT_ID_REQUIRED',
          });
        }
      }
    }

    await snap.ref.set(
      {
        auth: nextAuth,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const { encryptSecret, maskSecret } = await import('../services/secretsCrypto.js');
    const secretsStored = [];

    const clientId = String(req.body?.googleClientId || req.body?.clientId || '').trim();
    const clientSecret = String(
      req.body?.googleClientSecret || req.body?.clientSecret || ''
    ).trim();

    if (clientId) {
      await snap.ref.collection('envSecrets').doc(GOOGLE_OAUTH_CLIENT_ID_KEY).set(
        {
          key: GOOGLE_OAUTH_CLIENT_ID_KEY,
          value: encryptSecret(clientId),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      secretsStored.push({ key: GOOGLE_OAUTH_CLIENT_ID_KEY, masked: maskSecret(clientId) });
    }
    if (clientSecret) {
      await snap.ref.collection('envSecrets').doc(GOOGLE_OAUTH_CLIENT_SECRET_KEY).set(
        {
          key: GOOGLE_OAUTH_CLIENT_SECRET_KEY,
          value: encryptSecret(clientSecret),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      secretsStored.push({
        key: GOOGLE_OAUTH_CLIENT_SECRET_KEY,
        masked: maskSecret(clientSecret),
      });
    }

    const authPayload = publicProjectAuthPayload({ ...project, auth: nextAuth });
    for (const pubId of [projectId, `${projectId}_preview`]) {
      const ref = db.collection('publicProjects').doc(pubId);
      const pubSnap = await ref.get();
      if (pubSnap.exists) {
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

    res.json({
      ok: true,
      auth: nextAuth,
      backendEnabled: Boolean(project.backendEnabled),
      ...authPayload,
      secretsStored,
      wiringPrompt:
        nextAuth.googleEnabled && Boolean(project.backendEnabled)
          ? buildAuthWiringPrompt({ googleMode: nextAuth.googleMode })
          : null,
    });
  } catch (err) {
    console.error('[projects/auth/put]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao guardar auth.' });
  }
});

/**
 * POST /api/projects/:projectId/orchestrate — apply STRICT JSON action payloads.
 * Whitelisted paths only (project.auth, entities schema).
 * Data Architect: action_type deploy_schema | create_entity (alias).
 */
router.post('/:projectId/orchestrate', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { project } = await assertOwnerOrEditor(projectId, req.user.uid, req.user.email);
    const result = await applyOrchestrate(projectId, project, req.body || {});
    res.json(result);
  } catch (err) {
    console.error('[projects/orchestrate]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha na orquestração.',
      code: err.code || 'ORCHESTRATE_ERROR',
    });
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
    // Values are visible in the browser — NEVER inject *_SECRET / Client Secret.
    const env = {};
    try {
      const { secretValueFromDoc } = await import('../services/secretsCrypto.js');
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
        if (!isClientSafeEnvSecretKey(key)) return;
        try {
          const value = secretValueFromDoc(data);
          if (key && value !== '') env[key] = value;
        } catch {
          /* skip bad cipher */
        }
      });
    } catch (envErr) {
      console.warn('[projects/runtime] envSecrets:', envErr?.message);
    }

    const authPayload = publicProjectAuthPayload(project);

    res.json({
      ok: true,
      projectId,
      backendEnabled: Boolean(project.backendEnabled),
      env,
      customDomain: project.customDomain || '',
      customDomainVerified: Boolean(project.customDomainVerified),
      ...publicAuthAccessPayload(project),
      ...authPayload,
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

    const { writeAuditLog } = await import('../services/audit.js');
    await writeAuditLog({
      action: 'project.backend_enable',
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      projectId,
      meta: { creditsCharged },
    });

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
      servers: [{ url: 'https://gocreate-app.web.app' }],
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
 * Env secrets (masked) — owner or editor.
 */
router.get('/:projectId/env-secrets', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    await assertOwnerOrEditor(projectId, req.user.uid, req.user.email);
    const { secretValueFromDoc, maskSecret } = await import('../services/secretsCrypto.js');
    const snap = await db.collection('projects').doc(projectId).collection('envSecrets').get();
    const secrets = snap.docs.map((d) => {
      const data = d.data() || {};
      let val = '';
      try {
        val = secretValueFromDoc(data);
      } catch {
        val = '';
      }
      return {
        id: d.id,
        key: data.key || d.id,
        masked: maskSecret(val),
        encrypted: String(data.value || '').startsWith('enc:v1:'),
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
    const { encryptSecret, maskSecret } = await import('../services/secretsCrypto.js');
    const stored = encryptSecret(value);
    await db
      .collection('projects')
      .doc(projectId)
      .collection('envSecrets')
      .doc(safeKey)
      .set(
        {
          key: safeKey,
          value: stored,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    res.json({
      ok: true,
      key: safeKey,
      masked: maskSecret(value),
      encrypted: true,
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
    const act = String(req.body?.action || '').toLowerCase();
    if (act === 'create' || act === 'update' || act === 'delete') {
      const { dispatchEntityEvents } = await import('../services/projectFunctions.js');
      void dispatchEntityEvents(projectId, {
        entity: req.body?.entity,
        action: act,
        id: result?.id || req.body?.id,
        data: result?.data || req.body?.data,
      });
    }
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

/**
 * Server-side secrets proxy — never exposes raw secrets to the browser.
 * POST body: { url, method?, headers?, body?, inject?: string[] }
 * Placeholders {{ENV.KEY}} in url/headers/body are replaced with project secrets.
 * Only keys listed in inject (or all if omit + max 20) are used.
 */
router.post('/:projectId/secrets-proxy', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    await assertOwnerOrEditor(projectId, req.user.uid, req.user.email);

    const targetUrl = String(req.body?.url || '').trim();
    if (!/^https:\/\//i.test(targetUrl)) {
      return res.status(400).json({ error: 'url deve ser HTTPS.' });
    }
    // Block obvious SSRF to metadata / localhost
    try {
      const u = new URL(targetUrl);
      const host = u.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host.endsWith('.internal') ||
        host === 'metadata.google.internal' ||
        host.startsWith('169.254.')
      ) {
        return res.status(400).json({ error: 'Host não permitido.' });
      }
    } catch {
      return res.status(400).json({ error: 'URL inválida.' });
    }

    const snap = await db.collection('projects').doc(projectId).collection('envSecrets').get();
    const { secretValueFromDoc } = await import('../services/secretsCrypto.js');
    const env = {};
    snap.docs.forEach((d) => {
      const data = d.data() || {};
      const key = String(data.key || d.id || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '');
      try {
        const value = secretValueFromDoc(data);
        if (key) env[key] = value;
      } catch {
        /* skip */
      }
    });

    let injectKeys = Array.isArray(req.body?.inject)
      ? req.body.inject.map((k) => String(k).toUpperCase().replace(/[^A-Z0-9_]/g, ''))
      : Object.keys(env).slice(0, 20);
    injectKeys = injectKeys.filter((k) => k && env[k] != null).slice(0, 20);

    const replaceEnv = (input) => {
      if (input == null) return input;
      if (typeof input === 'object') {
        return JSON.parse(
          replaceEnv(JSON.stringify(input))
        );
      }
      let s = String(input);
      for (const key of injectKeys) {
        s = s.split(`{{ENV.${key}}}`).join(env[key]);
        s = s.split(`{{${key}}}`).join(env[key]);
      }
      return s;
    };

    const method = String(req.body?.method || 'GET').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return res.status(400).json({ error: 'method inválido.' });
    }

    const headers = {};
    const rawHeaders = req.body?.headers && typeof req.body.headers === 'object' ? req.body.headers : {};
    for (const [k, v] of Object.entries(rawHeaders)) {
      if (/^(host|content-length)$/i.test(k)) continue;
      headers[k] = replaceEnv(v);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let upstream;
    try {
      upstream = await fetch(replaceEnv(targetUrl), {
        method,
        headers,
        body: method === 'GET' || method === 'DELETE' ? undefined : replaceEnv(
          typeof req.body?.body === 'string' ? req.body.body : JSON.stringify(req.body?.body ?? {})
        ),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await upstream.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* plain */
    }

    const { writeAuditLog } = await import('../services/audit.js');
    await writeAuditLog({
      action: 'project.secrets_proxy',
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      projectId,
      meta: { urlHost: new URL(targetUrl).hostname, method, status: upstream.status },
    });

    res.status(200).json({
      ok: upstream.ok,
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type'),
      },
      body: json !== null ? json : text.slice(0, 100_000),
    });
  } catch (err) {
    console.error('[projects/secrets-proxy]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha no proxy.' });
  }
});

/**
 * Collaborators — owner only.
 */
router.get('/:projectId/collaborators', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    await assertOwner(projectId, req.user.uid);
    const { listCollaborators } = await import('../services/collaborators.js');
    const collaborators = await listCollaborators(projectId);
    res.json({ ok: true, collaborators });
  } catch (err) {
    console.error('[projects/collaborators/list]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao listar.' });
  }
});

router.post('/:projectId/collaborators', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    await assertOwner(projectId, req.user.uid);
    const { addCollaborator } = await import('../services/collaborators.js');
    const collaborators = await addCollaborator(projectId, {
      email: req.body?.email,
      role: req.body?.role,
    });
    const { writeAuditLog } = await import('../services/audit.js');
    await writeAuditLog({
      action: 'project.collaborator_add',
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      projectId,
      meta: { email: req.body?.email, role: req.body?.role },
    });
    res.json({ ok: true, collaborators });
  } catch (err) {
    console.error('[projects/collaborators/add]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao convidar.' });
  }
});

router.delete('/:projectId/collaborators/:email', requireAuth, async (req, res) => {
  try {
    const { projectId, email } = req.params;
    await assertOwner(projectId, req.user.uid);
    const { removeCollaborator } = await import('../services/collaborators.js');
    const collaborators = await removeCollaborator(projectId, decodeURIComponent(email));
    const { writeAuditLog } = await import('../services/audit.js');
    await writeAuditLog({
      action: 'project.collaborator_remove',
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      projectId,
      meta: { email: decodeURIComponent(email) },
    });
    res.json({ ok: true, collaborators });
  } catch (err) {
    console.error('[projects/collaborators/delete]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao remover.' });
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
    const { writeAuditLog } = await import('../services/audit.js');
    await writeAuditLog({
      action: 'project.delete',
      actorUid: req.user.uid,
      actorEmail: req.user.email,
      projectId,
    });
    res.json({ ok: true, projectId });
  } catch (err) {
    console.error('[projects/delete]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao eliminar projeto.' });
  }
});

export default router;
