// Middleware e helpers de créditos — debit via Admin SDK apenas.
// Fluxo: creditCheck (antes da IA) → geração → debitCredit (após sucesso).
// Owner / enterprise_master: créditos ilimitados (sem debit, sem 403).
// Free: reset diário para 50 (UTC-3), sem acumular.

import admin from '../config/firebaseAdmin.js';
import { db } from '../config/firebaseAdmin.js';
import {
  OWNER_ROLE,
  OWNER_PLAN,
  FREE_DAILY_CREDITS,
  isOwnerEmail,
  isOwnerUser,
  todayKeyUTC3,
} from '../lib/owner.js';

const INITIAL_CREDITS = FREE_DAILY_CREDITS;
const INITIAL_PLAN = 'free';

/**
 * Garante users/{uid}: bootstrap, elevação owner por email, reset diário free.
 * Só Admin SDK — cliente não pode auto-promover.
 */
export async function ensureUserAdmin(uid, email) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const today = todayKeyUTC3();
  const ownerByEmail = isOwnerEmail(email);

  if (!snap.exists) {
    const doc = {
      uid,
      email: email || null,
      role: ownerByEmail ? OWNER_ROLE : 'user',
      plan: ownerByEmail ? OWNER_PLAN : INITIAL_PLAN,
      credits: ownerByEmail ? 999999 : INITIAL_CREDITS,
      creditsUsedThisMonth: 0,
      lastCreditReset: today,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(doc);
    return {
      credits: doc.credits,
      plan: doc.plan,
      role: doc.role,
      unlimited: ownerByEmail,
    };
  }

  const data = snap.data() || {};
  const patch = {};
  let credits = typeof data.credits === 'number' ? data.credits : INITIAL_CREDITS;
  let plan = data.plan || INITIAL_PLAN;
  let role = data.role || 'user';

  if (email && data.email !== email) {
    patch.email = email;
  }

  // Elevação owner (somente servidor, por email canónico)
  if (ownerByEmail) {
    if (role !== OWNER_ROLE) {
      patch.role = OWNER_ROLE;
      role = OWNER_ROLE;
    }
    if (plan !== OWNER_PLAN) {
      patch.plan = OWNER_PLAN;
      plan = OWNER_PLAN;
    }
  }

  const unlimited = isOwnerUser({ ...data, role, plan, email: email || data.email });

  // Migração: docs antigos sem credits
  if (typeof data.credits !== 'number') {
    credits = unlimited ? 999999 : INITIAL_CREDITS;
    patch.credits = credits;
    if (!data.plan && !ownerByEmail) patch.plan = INITIAL_PLAN;
    if (typeof data.creditsUsedThisMonth !== 'number') {
      patch.creditsUsedThisMonth = 0;
    }
  }

  // Reset diário Free → exatamente 50 (não acumula; se gastou, volta a 50)
  if (!unlimited && plan === 'free') {
    const last = data.lastCreditReset || null;
    if (last !== today) {
      credits = INITIAL_CREDITS;
      patch.credits = INITIAL_CREDITS;
      patch.lastCreditReset = today;
    }
  } else if (unlimited && data.lastCreditReset !== today) {
    // Marca o dia sem mexer em créditos do owner
    patch.lastCreditReset = today;
  }

  // Pro: não faz reset para baixo; só carimba lastCreditReset se ausente
  if (!unlimited && plan === 'pro' && !data.lastCreditReset) {
    patch.lastCreditReset = today;
  }

  if (Object.keys(patch).length) {
    patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await ref.set(patch, { merge: true });
  }

  return { credits, plan, role, unlimited };
}

/**
 * Bloqueia a rota se credits <= 0 (exceto owner / enterprise_master).
 * Resposta 403: { message: "Créditos insuficientes" }
 */
export async function creditCheck(req, res, next) {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    const profile = await ensureUserAdmin(req.user.uid, req.user.email);
    req.userCredits = profile.credits;
    req.userPlan = profile.plan;
    req.userRole = profile.role;
    req.userUnlimited = profile.unlimited;

    if (!profile.unlimited && profile.credits <= 0) {
      return res.status(403).json({ message: 'Créditos insuficientes' });
    }

    return next();
  } catch (err) {
    console.error('[creditCheck]', err);
    return res.status(500).json({ error: 'Falha ao verificar créditos.' });
  }
}

/**
 * Debita N créditos após geração bem-sucedida (transação atómica).
 * Owner / enterprise_master: no-op.
 */
export async function debitCredit(uid, amount = 1) {
  const ref = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() || {};
    if (isOwnerUser(data)) return;

    const current = Number(data.credits ?? 0);
    const used = Number(data.creditsUsedThisMonth ?? 0);
    const next = Math.max(0, current - amount);
    tx.set(
      ref,
      {
        credits: next,
        creditsUsedThisMonth: used + amount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

export default creditCheck;
