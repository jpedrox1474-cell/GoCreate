// Admin platform metrics (lightweight aggregates).

import { db } from '../config/firebaseAdmin.js';
import { BILLING_PRODUCTS } from './mercadopago.js';

export async function getPlatformMetrics() {
  const [usersSnap, projectsSnap, pubSnap, txSnap] = await Promise.all([
    db.collection('users').limit(500).get(),
    db.collection('projects').limit(500).get(),
    db.collection('publicProjects').limit(300).get(),
    db
      .collection('transactions')
      .where('status', '==', 'completed')
      .limit(300)
      .get()
      .catch(() => ({ docs: [], size: 0, empty: true })),
  ]);

  const users = usersSnap.docs.map((d) => d.data() || {});
  const byPlan = { free: 0, pro: 0, enterprise_master: 0, other: 0 };
  let creditsTotal = 0;
  let creditsUsedMonth = 0;
  let active7d = 0;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const u of users) {
    const plan = String(u.plan || 'free');
    if (plan in byPlan) byPlan[plan] += 1;
    else byPlan.other += 1;
    if (typeof u.credits === 'number') creditsTotal += u.credits;
    if (typeof u.creditsUsedThisMonth === 'number') creditsUsedMonth += u.creditsUsedThisMonth;
    const last = u.lastLoginAt?.toMillis?.() || 0;
    if (last >= weekAgo) active7d += 1;
  }

  let liveProjects = 0;
  let draftProjects = 0;
  for (const d of projectsSnap.docs) {
    const s = d.data()?.status;
    if (s === 'live' || s === 'deployed') liveProjects += 1;
    else draftProjects += 1;
  }

  const proPrice = Number(BILLING_PRODUCTS?.pro?.amount) || 49;
  // Seat-based MRR from active Pro plans (sampled users)
  let mrrFromSeats = byPlan.pro * proPrice;

  let revenueCompleted = 0;
  let subscriptionRevenue30d = 0;
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const d of txSnap.docs || []) {
    const t = d.data() || {};
    const amount = typeof t.amount === 'number' ? t.amount : 0;
    revenueCompleted += amount;
    const created = t.createdAt?.toMillis?.() || t.updatedAt?.toMillis?.() || 0;
    if (
      created >= monthAgo &&
      (t.type === 'subscription' || t.plan === 'pro' || t.productId === 'pro')
    ) {
      subscriptionRevenue30d += amount;
    }
  }

  // Prefer trailing 30d subscription cash if available; else seat estimate
  const mrrEstimateBrl =
    subscriptionRevenue30d > 0 ? Math.round(subscriptionRevenue30d) : mrrFromSeats;

  return {
    usersTotal: usersSnap.size,
    usersSampled: usersSnap.size >= 500,
    activeUsers7d: active7d,
    byPlan,
    creditsOutstanding: creditsTotal,
    creditsUsedThisMonth: creditsUsedMonth,
    projectsTotal: projectsSnap.size,
    projectsLive: liveProjects,
    projectsDraft: draftProjects,
    publicSnapshots: pubSnap.size,
    mrrEstimateBrl,
    mrrSource: subscriptionRevenue30d > 0 ? 'subscriptions_30d' : 'pro_seats',
    proSeatPriceBrl: proPrice,
    revenueCompletedBrl: revenueCompleted,
    subscriptionRevenue30dBrl: subscriptionRevenue30d,
    generatedAt: new Date().toISOString(),
  };
}
