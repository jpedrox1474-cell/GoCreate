// Project backend functions API — CRUD, run, logs, public HTTP invoke, cron tick.

import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { db } from '../config/firebaseAdmin.js';
import {
  listProjectFunctions,
  getProjectFunction,
  upsertProjectFunction,
  deleteProjectFunction,
  runProjectFunction,
  listFunctionLogs,
  runDueCronFunctions,
} from '../services/projectFunctions.js';

const router = Router();

async function assertOwner(projectId, uid) {
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists) {
    const err = new Error('Projeto não encontrado.');
    err.status = 404;
    throw err;
  }
  const data = snap.data() || {};
  if (data.ownerId !== uid) {
    const err = new Error('Sem permissão neste projeto.');
    err.status = 403;
    throw err;
  }
  return data;
}

async function assertBackend(projectId) {
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists) {
    const err = new Error('Projeto não encontrado.');
    err.status = 404;
    throw err;
  }
  const data = snap.data() || {};
  if (!data.backendEnabled) {
    const err = new Error(
      'Ativa Funções de Backend nas Settings do projeto para usar serverless functions.'
    );
    err.status = 403;
    err.code = 'BACKEND_REQUIRED';
    throw err;
  }
  return data;
}

/** POST /api/functions/cron/tick — run due crons (secret or owner) */
router.post('/cron/tick', optionalAuth, async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET || process.env.GOCREATE_CRON_SECRET;
    const provided = req.get('x-cron-secret') || req.body?.secret;
    const isSecret = Boolean(secret && provided && provided === secret);
    const isOwner = Boolean(req.user?.uid);
    if (!isSecret && !isOwner) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }
    const projectId = req.body?.projectId || req.query?.projectId || null;
    if (isOwner && !isSecret && projectId) {
      await assertOwner(projectId, req.user.uid);
    }
    const results = await runDueCronFunctions({
      projectId: projectId || null,
      limit: 25,
    });
    res.json({ ok: true, ran: results.length, results });
  } catch (err) {
    console.error('[functions/cron]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha no cron.' });
  }
});

/** POST /api/functions/invoke/:projectId/:name — public HTTP webhook */
router.post('/invoke/:projectId/:name', optionalAuth, async (req, res) => {
  try {
    const { projectId, name } = req.params;
    await assertBackend(projectId);
    const fn = await getProjectFunction(projectId, name);
    if (!fn) return res.status(404).json({ error: 'Função não encontrada.' });
    if (fn.trigger !== 'http') {
      return res.status(400).json({ error: 'Esta função não é HTTP. Usa trigger http.' });
    }
    const out = await runProjectFunction({
      projectId,
      nameOrId: name,
      triggerKind: 'http',
      payload: {
        body: req.body || {},
        query: req.query || {},
        headers: {
          'content-type': req.get('content-type') || null,
          'x-gocreate-key': req.get('x-gocreate-key') || null,
        },
      },
    });
    res.json(out);
  } catch (err) {
    console.error('[functions/invoke]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha no webhook.',
      code: err.code,
      logs: err.logs,
    });
  }
});

/** GET /api/functions/:projectId — list (owner) */
router.get('/:projectId', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    await assertOwner(projectId, req.user.uid);
    const functions = await listProjectFunctions(projectId);
    res.json({ ok: true, functions });
  } catch (err) {
    console.error('[functions/list]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao listar funções.' });
  }
});

/** GET /api/functions/:projectId/:name/logs */
router.get('/:projectId/:name/logs', requireAuth, async (req, res) => {
  try {
    const { projectId, name } = req.params;
    await assertOwner(projectId, req.user.uid);
    const logs = await listFunctionLogs(projectId, name, req.query.limit);
    res.json({ ok: true, logs });
  } catch (err) {
    console.error('[functions/logs]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao ler logs.' });
  }
});

/** POST /api/functions/:projectId/:name/run — owner test invoke */
router.post('/:projectId/:name/run', requireAuth, async (req, res) => {
  try {
    const { projectId, name } = req.params;
    await assertOwner(projectId, req.user.uid);
    await assertBackend(projectId);
    const out = await runProjectFunction({
      projectId,
      nameOrId: name,
      triggerKind: 'manual',
      payload: req.body?.payload || req.body || {},
    });
    res.json(out);
  } catch (err) {
    console.error('[functions/run]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha ao executar.',
      code: err.code,
      logs: err.logs,
      durationMs: err.durationMs,
    });
  }
});

/** GET /api/functions/:projectId/:name — get one with code (owner) */
router.get('/:projectId/:name', requireAuth, async (req, res) => {
  try {
    const { projectId, name } = req.params;
    await assertOwner(projectId, req.user.uid);
    const fn = await getProjectFunction(projectId, name);
    if (!fn) return res.status(404).json({ error: 'Função não encontrada.' });
    res.json({ ok: true, function: fn });
  } catch (err) {
    console.error('[functions/get]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao ler função.' });
  }
});

/** PUT /api/functions/:projectId/:name — upsert (owner) */
router.put('/:projectId/:name', requireAuth, async (req, res) => {
  try {
    const { projectId, name } = req.params;
    await assertOwner(projectId, req.user.uid);
    await assertBackend(projectId);
    const fn = await upsertProjectFunction(projectId, {
      ...req.body,
      name: name || req.body?.name,
    });
    res.json({ ok: true, function: fn });
  } catch (err) {
    console.error('[functions/put]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao guardar função.' });
  }
});

/** DELETE /api/functions/:projectId/:name */
router.delete('/:projectId/:name', requireAuth, async (req, res) => {
  try {
    const { projectId, name } = req.params;
    await assertOwner(projectId, req.user.uid);
    await deleteProjectFunction(projectId, name);
    res.json({ ok: true });
  } catch (err) {
    console.error('[functions/delete]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao apagar função.' });
  }
});

export default router;
