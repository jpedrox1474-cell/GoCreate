// Middleware e helpers de créditos — debit via Admin SDK apenas.
// Fluxo: creditCheck (antes da IA) → geração → debitCredit (após sucesso).

import admin from '../config/firebaseAdmin.js';
import { db } from '../config/firebaseAdmin.js';

const INITIAL_CREDITS = 50;
const INITIAL_PLAN = 'free';

/**
 * Garante que o doc users/{uid} existe (Admin). Usado se o cliente ainda não bootstrapou.
 */
async function ensureUserAdmin(uid, email) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      uid,
      email: email || null,
      plan: INITIAL_PLAN,
      credits: INITIAL_CREDITS,
      creditsUsedThisMonth: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { credits: INITIAL_CREDITS, plan: INITIAL_PLAN };
  }
  const data = snap.data() || {};
  if (typeof data.credits !== 'number') {
    await ref.set(
      {
        plan: data.plan || INITIAL_PLAN,
        credits: INITIAL_CREDITS,
        creditsUsedThisMonth: data.creditsUsedThisMonth ?? 0,
      },
      { merge: true }
    );
    return { credits: INITIAL_CREDITS, plan: data.plan || INITIAL_PLAN };
  }
  return { credits: data.credits, plan: data.plan || INITIAL_PLAN };
}

/**
 * Bloqueia a rota se credits <= 0.
 * Resposta 403: { message: "Créditos insuficientes" }
 */
export async function creditCheck(req, res, next) {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    const { credits, plan } = await ensureUserAdmin(req.user.uid, req.user.email);
    req.userCredits = credits;
    req.userPlan = plan;

    if (credits <= 0) {
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
 */
export async function debitCredit(uid, amount = 1) {
  const ref = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? Number(snap.data()?.credits ?? 0) : 0;
    const used = snap.exists ? Number(snap.data()?.creditsUsedThisMonth ?? 0) : 0;
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
