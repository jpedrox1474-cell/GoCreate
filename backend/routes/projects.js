// Project delete (Admin SDK cascade) — owner only.
// Client cascade can miss nested entities/rows or hit permission edge cases.

import { Router } from 'express';
import { db } from '../config/firebaseAdmin.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

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
    const err = new Error('Sem permissão para eliminar este projeto.');
    err.status = 403;
    throw err;
  }
  return snap;
}

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

export default router;
