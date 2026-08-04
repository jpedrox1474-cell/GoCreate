// Admin panel API — owner allowlist only.

import { Router } from 'express';
import admin from '../config/firebaseAdmin.js';
import { db } from '../config/firebaseAdmin.js';
import { requireAuth } from '../middleware/auth.js';
import { ensureUserAdmin } from '../middleware/credits.js';
import { isOwnerEmail } from '../lib/owner.js';

const router = Router();

function assertOwnerEmail(req) {
  if (!isOwnerEmail(req.user?.email)) {
    const err = new Error('Apenas owners podem aceder ao Admin.');
    err.status = 403;
    throw err;
  }
}

router.use(requireAuth);

/**
 * GET /api/admin/users
 * Query: limit (1–100), cursor (doc id), q (email substring), plan (free|pro|…)
 */
router.get('/users', async (req, res) => {
  try {
    assertOwnerEmail(req);
    await ensureUserAdmin(req.user.uid, req.user.email);

    const lim = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const q = String(req.query.q || '')
      .trim()
      .toLowerCase();
    const planFilter = String(req.query.plan || '')
      .trim()
      .toLowerCase();
    const cursor = String(req.query.cursor || '').trim();

    // Fetch a wider page when filtering client-side (no email index).
    const fetchLimit = q || planFilter ? Math.min(500, lim * 8) : lim;

    let query = db.collection('users');
    let usedOrder = true;
    try {
      query = query.orderBy('lastLoginAt', 'desc');
      if (cursor) {
        const cursorSnap = await db.collection('users').doc(cursor).get();
        if (cursorSnap.exists) {
          query = query.startAfter(cursorSnap);
        }
      }
      query = query.limit(fetchLimit);
    } catch {
      usedOrder = false;
      query = db.collection('users').limit(fetchLimit);
    }

    const snap = await query.get();
    let docs = snap.docs;

    let users = docs.map((d) => {
      const data = d.data() || {};
      return {
        uid: d.id,
        email: data.email || null,
        plan: data.plan || 'free',
        role: data.role || 'user',
        credits: typeof data.credits === 'number' ? data.credits : 0,
        lastLoginAt: data.lastLoginAt || null,
        createdAt: data.createdAt || null,
      };
    });

    if (q) {
      users = users.filter((u) => String(u.email || '').toLowerCase().includes(q));
    }
    if (planFilter && planFilter !== 'all') {
      users = users.filter((u) => String(u.plan || 'free').toLowerCase() === planFilter);
    }

    const page = users.slice(0, lim);
    const lastDoc = docs[docs.length - 1];
    const nextCursor =
      !q && !planFilter && usedOrder && docs.length >= lim && lastDoc ? lastDoc.id : null;
    const hasMore = Boolean(nextCursor) || (q || planFilter ? users.length > lim : false);

    res.json({
      ok: true,
      users: page,
      nextCursor,
      hasMore,
      filtered: Boolean(q || planFilter),
    });
  } catch (err) {
    console.error('[admin/users]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao listar utilizadores.' });
  }
});

router.post('/users/:uid/credits', async (req, res) => {
  try {
    assertOwnerEmail(req);
    const { uid } = req.params;
    if (!uid) return res.status(400).json({ error: 'uid é obrigatório.' });

    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Utilizador não encontrado.' });

    const data = snap.data() || {};
    let credits = typeof data.credits === 'number' ? data.credits : 0;
    if (typeof req.body?.setTo === 'number') {
      credits = Math.max(0, Math.floor(req.body.setTo));
    } else {
      const delta = Number(req.body?.delta);
      if (!Number.isFinite(delta)) {
        return res.status(400).json({ error: 'delta ou setTo é obrigatório.' });
      }
      credits = Math.max(0, Math.floor(credits + delta));
    }

    await ref.set(
      {
        credits,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        adminCreditAdjustAt: admin.firestore.FieldValue.serverTimestamp(),
        adminCreditAdjustBy: req.user.uid,
      },
      { merge: true }
    );

    res.json({
      ok: true,
      uid,
      credits,
      email: data.email || null,
      plan: data.plan || 'free',
    });
  } catch (err) {
    console.error('[admin/credits]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao ajustar créditos.' });
  }
});

export default router;
