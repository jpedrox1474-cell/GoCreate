// Perfil do utilizador — sync server-side (owner elevation + daily credit reset) + sessions.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ensureUserAdmin } from '../middleware/credits.js';
import { canUsePremium } from '../lib/owner.js';
import {
  touchSession,
  listSessions,
  revokeSession,
  revokeOtherSessions,
} from '../services/sessions.js';
import { db } from '../config/firebaseAdmin.js';

const router = Router();

/**
 * GET/POST /api/me/ensure
 * Bootstrap Admin: eleva owner por email, reset diário free + touch session.
 */
async function ensureHandler(req, res) {
  try {
    const profile = await ensureUserAdmin(req.user.uid, req.user.email);

    const sessionKey = req.get('x-gocreate-session') || req.body?.sessionKey;
    let session = null;
    if (sessionKey) {
      session = await touchSession(req.user.uid, {
        sessionKey,
        userAgent: req.get('user-agent'),
        ip: req.get('x-forwarded-for') || req.ip,
      });
    }

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
      session,
    });
  } catch (err) {
    console.error('[me/ensure]', err);
    res.status(500).json({ error: err.message || 'Falha ao sincronizar perfil.' });
  }
}

router.get('/ensure', requireAuth, ensureHandler);
router.post('/ensure', requireAuth, ensureHandler);

/**
 * POST /api/me/password-reset — { email }
 * Público. Com RESEND_API_KEY: gera link Firebase Admin e envia via Resend.
 * Sem chave: responde { ok, useClientFirebase: true } para o cliente usar Firebase Auth.
 */
router.post('/password-reset', async (req, res) => {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    if (!email.includes('@')) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }

    const { isResendConfigured, sendPasswordRecoveryEmail } = await import(
      '../services/resendMail.js'
    );
    if (!isResendConfigured()) {
      console.warn(
        '[me/password-reset] RESEND_API_KEY em falta — cliente deve usar Firebase Auth. ' +
          'Cole a chave em backend/.env e functions/.env (https://resend.com/api-keys).'
      );
      return res.json({ ok: true, useClientFirebase: true });
    }

    const admin = (await import('../config/firebaseAdmin.js')).default;
    const appUrl = String(process.env.PUBLIC_APP_URL || 'https://gocreate-app.web.app').replace(
      /\/$/,
      ''
    );
    let resetLink;
    try {
      resetLink = await admin.auth().generatePasswordResetLink(email, {
        url: `${appUrl}/login`,
      });
    } catch (err) {
      // Evitar enumeração de contas — resposta genérica
      console.warn('[me/password-reset] generate link', err?.code || err?.message || err);
      return res.json({ ok: true });
    }

    const sent = await sendPasswordRecoveryEmail({ to: email, resetLink });
    if (!sent.ok && !sent.skipped) {
      console.error('[me/password-reset] resend failed', sent.error);
      return res.status(502).json({ error: 'Falha ao enviar e-mail de recuperação.' });
    }
    return res.json({ ok: true, via: 'resend' });
  } catch (err) {
    console.error('[me/password-reset]', err);
    res.status(500).json({ error: err.message || 'Falha na recuperação.' });
  }
});

/** GET /api/me/sessions */
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const sessions = await listSessions(req.user.uid);
    const currentKey = req.get('x-gocreate-session');
    let currentId = null;
    if (currentKey) {
      const crypto = await import('crypto');
      currentId = crypto.createHash('sha256').update(String(currentKey)).digest('hex').slice(0, 32);
    }
    res.json({
      ok: true,
      sessions: sessions.map((s) => ({ ...s, current: s.id === currentId })),
    });
  } catch (err) {
    console.error('[me/sessions]', err);
    res.status(500).json({ error: err.message || 'Falha ao listar sessões.' });
  }
});

/** DELETE /api/me/sessions/:id */
router.delete('/sessions/:id', requireAuth, async (req, res) => {
  try {
    await revokeSession(req.user.uid, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[me/sessions/delete]', err);
    res.status(500).json({ error: err.message || 'Falha ao revogar sessão.' });
  }
});

/** POST /api/me/sessions/revoke-others */
router.post('/sessions/revoke-others', requireAuth, async (req, res) => {
  try {
    const keep = req.get('x-gocreate-session') || req.body?.sessionKey;
    const result = await revokeOtherSessions(req.user.uid, keep);
    res.json(result);
  } catch (err) {
    console.error('[me/sessions/revoke-others]', err);
    res.status(500).json({ error: err.message || 'Falha ao revogar sessões.' });
  }
});

/** GET /api/me/shared-projects — projects where user is collaborator */
router.get('/shared-projects', requireAuth, async (req, res) => {
  try {
    const email = String(req.user.email || '')
      .trim()
      .toLowerCase();
    if (!email) return res.json({ ok: true, projects: [] });
    const snap = await db
      .collection('projects')
      .where('collaboratorEmails', 'array-contains', email)
      .limit(50)
      .get();
    const projects = snap.docs.map((d) => {
      const data = d.data() || {};
      const collab = (data.collaborators || []).find(
        (c) => String(c.email || '').toLowerCase() === email
      );
      return {
        id: d.id,
        name: data.name || 'Projeto',
        description: data.description || '',
        ownerId: data.ownerId || null,
        role: collab?.role === 'viewer' ? 'viewer' : 'editor',
        status: data.status || 'draft',
        thumbnailUrl: data.thumbnailUrl || null,
        updatedAt: data.updatedAt || null,
      };
    });
    res.json({ ok: true, projects });
  } catch (err) {
    console.error('[me/shared-projects]', err);
    res.status(err.status || 500).json({ error: err.message || 'Falha ao listar partilhados.' });
  }
});

export default router;
