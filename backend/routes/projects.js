// Project delete (Admin SDK cascade) — owner only.
// Backend Functions enable + public data API (Base44-style freemium).

import { Router } from 'express';
import admin from '../config/firebaseAdmin.js';
import { db } from '../config/firebaseAdmin.js';
import { requireAuth } from '../middleware/auth.js';
import { ensureUserAdmin, debitCredit } from '../middleware/credits.js';
import {
  canUsePremium,
  BACKEND_ENABLE_CREDIT_COST,
  BACKEND_REQUIRED_MESSAGE,
} from '../lib/owner.js';
import { projectDataOp } from '../services/entities.js';
import {
  AUTH_ACCESS_DENIED_MESSAGE,
  isEmailAllowedForProjectAuth,
  normalizeAuthAccess,
  normalizeEmail,
  publicAuthAccessPayload,
} from '../services/authAccess.js';

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
    res.json({
      ok: true,
      projectId,
      backendEnabled: Boolean(project.backendEnabled),
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
 * POST /api/projects/:projectId/data — runtime CRUD (preview + published apps).
 * Público (sem auth Firebase): end-users of published apps must be able to save.
 * Gate: projects.backendEnabled must be true. Writes via Admin SDK → entities/rows.
 * Body: { action, entity, id?, data? }
 */
router.post('/:projectId/data', async (req, res) => {
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

    const result = await projectDataOp(projectId, {
      action: req.body?.action,
      entity: req.body?.entity,
      id: req.body?.id,
      data: req.body?.data,
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
router.get('/:projectId/data', async (req, res) => {
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
    const result = await projectDataOp(projectId, { action: 'list', entity });
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
