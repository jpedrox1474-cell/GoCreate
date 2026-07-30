// Paywall server-side — Free não passa; Pro / owner / enterprise_master passam.

import { ensureUserAdmin } from './credits.js';
import { canUsePremium, PREMIUM_REQUIRED_MESSAGE } from '../lib/owner.js';

/**
 * Exige plano pago ou owner. Anexar após requireAuth.
 */
export async function requirePremium(req, res, next) {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    const profile = await ensureUserAdmin(req.user.uid, req.user.email);
    req.userPlan = profile.plan;
    req.userRole = profile.role;
    req.userUnlimited = profile.unlimited;

    if (!canUsePremium({ plan: profile.plan, role: profile.role, email: req.user.email })) {
      return res.status(403).json({
        error: PREMIUM_REQUIRED_MESSAGE,
        message: PREMIUM_REQUIRED_MESSAGE,
        code: 'PREMIUM_REQUIRED',
      });
    }

    return next();
  } catch (err) {
    console.error('[requirePremium]', err);
    return res.status(500).json({ error: 'Falha ao verificar plano.' });
  }
}

export default requirePremium;
