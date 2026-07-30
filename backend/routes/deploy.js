// Deploy production — Admin SDK write + premium gate.
// Preview continua free via cliente (Sandpack / publicProjects *_preview).

import { Router } from 'express';
import admin from '../config/firebaseAdmin.js';
import { db } from '../config/firebaseAdmin.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePremium } from '../middleware/premium.js';

const router = Router();

function publishUrl(projectId, env) {
  const origin = (process.env.PUBLIC_APP_URL || 'https://gocreate.web.app').replace(/\/$/, '');
  return env === 'preview' ? `${origin}/p/${projectId}/preview` : `${origin}/p/${projectId}`;
}

async function publishHandler(req, res) {
  try {
    const { projectId, files, name } = req.body || {};
    const env = req.body?.env === 'preview' ? 'preview' : 'production';

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ error: 'projectId é obrigatório.' });
    }
    if (!files || typeof files !== 'object' || Array.isArray(files)) {
      return res.status(400).json({ error: 'files (objeto path→conteúdo) é obrigatório.' });
    }
    if (!Object.keys(files).length) {
      return res.status(400).json({ error: 'Nenhum ficheiro para publicar.' });
    }

    const projectRef = db.collection('projects').doc(projectId);
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) {
      return res.status(404).json({ error: 'Projeto não encontrado.' });
    }
    const project = projectSnap.data() || {};
    if (project.ownerId !== req.user.uid) {
      return res.status(403).json({ error: 'Sem permissão neste projeto.' });
    }

    const plan = req.userPlan || 'free';
    const isProLike = plan === 'pro' || plan === 'enterprise_master' || req.userRole === 'owner';
    const pubId = env === 'preview' ? `${projectId}_preview` : projectId;
    const url = publishUrl(projectId, env);

    const payload = {
      projectId,
      ownerId: req.user.uid,
      name: name || project.name || 'Projeto',
      env,
      files,
      url,
      plan: isProLike ? (plan === 'enterprise_master' ? 'enterprise_master' : 'pro') : 'free',
      showBadge: !isProLike,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('publicProjects').doc(pubId).set(payload, { merge: true });
    await projectRef.set(
      {
        status: env === 'preview' ? 'preview' : 'live',
        publishedUrl: url,
        publishedEnv: env,
        publishedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    res.json({ ok: true, url, pubId, env });
  } catch (err) {
    console.error('[deploy/publish]', err);
    res.status(500).json({ error: err.message || 'Falha ao publicar.' });
  }
}

/** POST /api/deploy/publish — production exige Pro/Owner; preview livre. */
router.post('/publish', requireAuth, (req, res, next) => {
  const env = req.body?.env === 'preview' ? 'preview' : 'production';
  if (env === 'production') {
    return requirePremium(req, res, () => publishHandler(req, res));
  }
  return publishHandler(req, res);
});

export default router;
