// Deploy — Admin SDK write. Free pode publicar produção (com badge GoCreate).
// Preview também via cliente (Sandpack / publicProjects *_preview).
// Public URL is STABLE per project: /p/{slug||projectId}; redeploy overwrites same snapshot.

import { Router } from 'express';
import admin from '../config/firebaseAdmin.js';
import { db } from '../config/firebaseAdmin.js';
import { requireAuth } from '../middleware/auth.js';
import { ensureUserAdmin } from '../middleware/credits.js';
import {
  normalizeSlug,
  resolveProjectPublicKey,
  buildPublishUrl,
} from '../services/projectSlug.js';

const router = Router();

async function assertProjectOwner(projectId, uid) {
  const projectRef = db.collection('projects').doc(projectId);
  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) {
    const err = new Error('Projeto não encontrado.');
    err.status = 404;
    throw err;
  }
  const project = projectSnap.data() || {};
  if (project.ownerId !== uid) {
    const err = new Error('Sem permissão neste projeto.');
    err.status = 403;
    throw err;
  }
  return { projectRef, project };
}

/**
 * Claim slug in projectSlugs; release previous if owned by same project.
 * @returns {Promise<string>} normalized slug
 */
async function claimSlug({ projectId, ownerId, slug, previousSlug }) {
  const normalized = normalizeSlug(slug);
  if (!normalized.ok) {
    const err = new Error(normalized.error);
    err.status = 400;
    err.code = 'INVALID_SLUG';
    throw err;
  }
  const next = normalized.slug;
  const slugRef = db.collection('projectSlugs').doc(next);
  const existing = await slugRef.get();
  if (existing.exists) {
    const data = existing.data() || {};
    if (data.projectId !== projectId) {
      const err = new Error('Este link já está em uso. Escolhe outro slug.');
      err.status = 409;
      err.code = 'SLUG_TAKEN';
      throw err;
    }
  }

  const batch = db.batch();
  batch.set(
    slugRef,
    {
      projectId,
      ownerId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const prev = String(previousSlug || '').trim().toLowerCase();
  if (prev && prev !== next && prev !== projectId) {
    const prevRef = db.collection('projectSlugs').doc(prev);
    const prevSnap = await prevRef.get();
    if (prevSnap.exists && prevSnap.data()?.projectId === projectId) {
      batch.delete(prevRef);
    }
  }

  await batch.commit();
  return next;
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

    const { projectRef, project } = await assertProjectOwner(projectId, req.user.uid);

    // Plan snapshot for badge (Free → showBadge)
    let plan = req.userPlan || 'free';
    let role = req.userRole || 'user';
    if (!req.userPlan) {
      try {
        const profile = await ensureUserAdmin(req.user.uid, req.user.email);
        plan = profile.plan;
        role = profile.role;
      } catch {
        /* keep free */
      }
    }
    const isProLike = plan === 'pro' || plan === 'enterprise_master' || role === 'owner';
    // Snapshot doc id stays projectId (stable overwrite on redeploy)
    const pubId = env === 'preview' ? `${projectId}_preview` : projectId;
    const publicKey = resolveProjectPublicKey(project, projectId);
    const url = buildPublishUrl(publicKey, env);

    // Ensure registry entry for custom slug (idempotent)
    if (project.slug && project.slug !== projectId) {
      try {
        await claimSlug({
          projectId,
          ownerId: req.user.uid,
          slug: project.slug,
          previousSlug: project.slug,
        });
      } catch (err) {
        if (err.code === 'SLUG_TAKEN') {
          return res.status(409).json({ error: err.message, code: err.code });
        }
      }
    }

    const payload = {
      projectId,
      ownerId: req.user.uid,
      name: name || project.name || 'Projeto',
      env,
      files,
      url,
      slug: publicKey,
      plan: isProLike ? (plan === 'enterprise_master' ? 'enterprise_master' : 'pro') : 'free',
      // Free / no paid plan → badge "Feito com GoCreate" (signup). Pro/Owner pode esconder.
      showBadge: !isProLike,
      backendEnabled: Boolean(project.backendEnabled),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('publicProjects').doc(pubId).set(payload, { merge: true });

    const thumbName = name || project.name || 'Projeto';
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

    res.json({
      ok: true,
      url,
      pubId,
      env,
      slug: publicKey,
      projectId,
    });
  } catch (err) {
    console.error('[deploy/publish]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao publicar.', code: err.code });
  }
}

/** GET /api/deploy/slug/check?slug=meu-salao&projectId=optional */
router.get('/slug/check', requireAuth, async (req, res) => {
  try {
    const normalized = normalizeSlug(req.query?.slug);
    if (!normalized.ok) {
      return res.json({ available: false, error: normalized.error, slug: null });
    }
    const { slug } = normalized;
    const projectId = typeof req.query?.projectId === 'string' ? req.query.projectId : null;
    const snap = await db.collection('projectSlugs').doc(slug).get();
    if (!snap.exists) {
      return res.json({ available: true, slug });
    }
    const ownerProjectId = snap.data()?.projectId;
    const available = Boolean(projectId && ownerProjectId === projectId);
    return res.json({
      available,
      slug,
      error: available ? null : 'Este link já está em uso.',
    });
  } catch (err) {
    console.error('[deploy/slug/check]', err);
    res.status(500).json({ error: err.message || 'Falha ao verificar slug.' });
  }
});

/** PUT /api/deploy/slug — { projectId, slug } — customize public path segment only */
router.put('/slug', requireAuth, async (req, res) => {
  try {
    const { projectId, slug } = req.body || {};
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ error: 'projectId é obrigatório.' });
    }
    const { projectRef, project } = await assertProjectOwner(projectId, req.user.uid);
    const next = await claimSlug({
      projectId,
      ownerId: req.user.uid,
      slug,
      previousSlug: project.slug,
    });

    const prodUrl = buildPublishUrl(next, 'production');
    const previewUrl = buildPublishUrl(next, 'preview');

    await projectRef.set(
      {
        slug: next,
        publishedUrl:
          project.publishedEnv === 'preview'
            ? previewUrl
            : project.publishedUrl
              ? prodUrl
              : project.publishedUrl || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Keep public snapshots' url/slug in sync when they exist
    const updates = [
      { id: projectId, env: 'production', url: prodUrl },
      { id: `${projectId}_preview`, env: 'preview', url: previewUrl },
    ];
    for (const u of updates) {
      const ref = db.collection('publicProjects').doc(u.id);
      const snap = await ref.get();
      if (snap.exists) {
        await ref.set({ slug: next, url: u.url, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
    }

    res.json({
      ok: true,
      slug: next,
      url: prodUrl,
      previewUrl,
      projectId,
    });
  } catch (err) {
    console.error('[deploy/slug]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Falha ao atualizar slug.',
      code: err.code,
    });
  }
});

/** GET /api/deploy/resolve/:key — public resolve slug|projectId → publication meta */
router.get('/resolve/:key', async (req, res) => {
  try {
    const key = String(req.params.key || '').trim();
    if (!key) return res.status(400).json({ error: 'key é obrigatório.' });
    const env = req.query?.env === 'preview' ? 'preview' : 'production';

    let projectId = key;
    const direct = await db.collection('publicProjects').doc(env === 'preview' ? `${key}_preview` : key).get();
    if (direct.exists) {
      const data = direct.data() || {};
      return res.json({
        ok: true,
        projectId: data.projectId || key,
        slug: data.slug || key,
        env: data.env || env,
        name: data.name || null,
        url: data.url || buildPublishUrl(data.slug || key, env),
      });
    }

    const slugDoc = await db.collection('projectSlugs').doc(key.toLowerCase()).get();
    if (slugDoc.exists) {
      projectId = slugDoc.data()?.projectId || key;
      const pubId = env === 'preview' ? `${projectId}_preview` : projectId;
      const pub = await db.collection('publicProjects').doc(pubId).get();
      if (pub.exists) {
        const data = pub.data() || {};
        return res.json({
          ok: true,
          projectId,
          slug: data.slug || key,
          env: data.env || env,
          name: data.name || null,
          url: data.url || buildPublishUrl(data.slug || key, env),
        });
      }
    }

    return res.status(404).json({ error: 'Publicação não encontrada.' });
  } catch (err) {
    console.error('[deploy/resolve]', err);
    res.status(500).json({ error: err.message || 'Falha ao resolver.' });
  }
});

/** POST /api/deploy/publish — Free e Pro; Free mantém showBadge. */
router.post('/publish', requireAuth, publishHandler);

export default router;
