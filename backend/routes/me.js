// Perfil do utilizador — sync server-side (owner elevation + daily credit reset).

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ensureUserAdmin } from '../middleware/credits.js';
import { canUsePremium } from '../lib/owner.js';

const router = Router();

/**
 * GET/POST /api/me/ensure
 * Bootstrap Admin: eleva owner por email, reset diário free.
 */
async function ensureHandler(req, res) {
  try {
    const profile = await ensureUserAdmin(req.user.uid, req.user.email);
    res.json({
      ok: true,
      uid: req.user.uid,
      email: req.user.email,
      plan: profile.plan,
      role: profile.role,
      credits: profile.unlimited ? null : profile.credits,
      unlimited: profile.unlimited,
      canUsePremium: canUsePremium({
        plan: profile.plan,
        role: profile.role,
        email: req.user.email,
      }),
    });
  } catch (err) {
    console.error('[me/ensure]', err);
    res.status(500).json({ error: err.message || 'Falha ao sincronizar perfil.' });
  }
}

router.get('/ensure', requireAuth, ensureHandler);
router.post('/ensure', requireAuth, ensureHandler);

export default router;
