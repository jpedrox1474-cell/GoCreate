// Admin platform metrics (lightweight aggregates).

import { db } from '../config/firebaseAdmin.js';

export async function getPlatformMetrics() {
  const [usersSnap, projectsSnap, pubSnap, txSnap, auditSnap] = await Promise.all([
    db.collection('users').limit(500).get(),
    db.collection('projects').limit(500).get(),
    db.collection('publicProjects').limit(300).get(),
    db
      .collection('transactions')
      .where('status', '==', 'completed')
      .limit(200)
      .get()
      .catch(() => ({ docs: [], size: 0, empty: true })),
    db
      .collection('auditLogs')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()
      .catch(() => ({ docs: [], empty: true })),
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

  let mrrEstimate = 0;
  // Rough: Pro ~ R$49 (match Pricing if different — display as estimate)
  mrrEstimate = byPlan.pro * 49;

  let revenueCompleted = 0;
  for (const d of txSnap.docs || []) {
    const t = d.data() || {};
    if (typeof t.amount === 'number') revenueCompleted += t.amount;
  }

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
    mrrEstimateBrl: mrrEstimate,
    revenueCompletedBrl: revenueCompleted,
    auditReady: !auditSnap.empty,
    generatedAt: new Date().toISOString(),
  };
}
