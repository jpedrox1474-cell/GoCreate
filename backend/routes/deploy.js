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

    const thumbName = name || project.name || 'Projeto';
    // Lightweight branded placeholder until a real screenshot pipeline exists
    const initials = String(thumbName)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('') || 'GC';
    const safe = String(thumbName).replace(/[<>&"']/g, '').slice(0, 28);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e3a5f"/><stop offset="100%" stop-color="#2563eb"/></linearGradient></defs><rect width="800" height="450" fill="#09090b"/><rect width="800" height="450" fill="url(#g)" opacity="0.85"/><rect x="48" y="48" width="704" height="354" rx="16" fill="rgba(9,9,11,0.45)" stroke="rgba(255,255,255,0.08)"/><text x="400" y="210" text-anchor="middle" font-family="system-ui,sans-serif" font-size="72" font-weight="700" fill="rgba(255,255,255,0.92)">${initials}</text><text x="400" y="270" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" fill="rgba(255,255,255,0.55)">${safe}</text></svg>`;
    const thumbnailUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    await projectRef.set(
      {
        status: env === 'preview' ? 'preview' : 'live',
        publishedUrl: url,
        publishedEnv: env,
        publishedAt: admin.firestore.FieldValue.serverTimestamp(),
        thumbnailUrl,
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
