// Firestore helpers + simulation engine for GoCreate Automations.

import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export const LAST_PROJECT_KEY = 'gocreate:lastProjectId';

export const AUTOMATION_TYPES = {
  bug_hunter: 'bug_hunter',
  security_scan: 'security_scan',
  doc_generator: 'doc_generator',
  test_coverage: 'test_coverage',
};

export const AUTOMATION_TEMPLATES = [
  {
    type: 'bug_hunter',
    title: 'Find critical bugs',
    description:
      'Analyze recent commits for high-severity correctness bugs and submit safe fixes.',
  },
  {
    type: 'security_scan',
    title: 'Scan codebase for vulnerabilities',
    description:
      'Review the full repository on a schedule and alert on validated high-impact security issues.',
  },
  {
    type: 'doc_generator',
    title: 'Generate docs',
    description:
      'Create and update developer documentation for recently changed or under-documented code.',
  },
  {
    type: 'test_coverage',
    title: 'Add test coverage',
    description:
      'Review recent changes and add tests for high-risk logic that lacks adequate coverage.',
  },
];

const TOAST_BY_TYPE = {
  bug_hunter: '🤖 Agente GoCreate: Procurando bugs críticos no código...',
  security_scan: '🤖 Agente GoCreate: Verificando vulnerabilidades no código...',
  doc_generator: '🤖 Agente GoCreate: Gerando documentação do código...',
  test_coverage: '🤖 Agente GoCreate: Analisando cobertura de testes...',
};

const DONE_BY_TYPE = {
  bug_hunter: 'Agente: análise de bugs concluída.',
  security_scan: 'Agente: scan de segurança concluído.',
  doc_generator: 'Agente: documentação gerada.',
  test_coverage: 'Agente: cobertura de testes analisada.',
};

/** Simulated agent work duration before recording the run. */
const SIMULATION_MS = 7_500;

const DEBOUNCE_MS = 4000;
const debounceTimers = new Map();
const lastRunAt = new Map();

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function rememberLastProjectId(projectId) {
  if (!projectId || typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAST_PROJECT_KEY, projectId);
  } catch {
    /* ignore */
  }
}

export function getRememberedProjectId() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(LAST_PROJECT_KEY) || null;
  } catch {
    return null;
  }
}

export function toastMessageForType(type) {
  return TOAST_BY_TYPE[type] || '🤖 Agente GoCreate: A analisar o código...';
}

export function doneMessageForType(type) {
  return DONE_BY_TYPE[type] || 'Agente GoCreate: execução concluída.';
}

function mapAutomationDoc(d, projectId) {
  const data = d.data() || {};
  return {
    id: d.id,
    type: data.type,
    status: data.status || 'inactive',
    lastRun: data.lastRun || null,
    projectId: data.projectId || projectId,
    title: data.title || '',
    description: data.description || '',
    createdAt: data.createdAt || null,
  };
}

function mapRunDoc(d) {
  const data = d.data() || {};
  return {
    id: d.id,
    status: data.status || 'success',
    type: data.type,
    createdAt: data.createdAt || null,
    projectId: data.projectId || null,
  };
}

export async function listAutomations(projectId) {
  if (!projectId) return [];
  const ref = collection(db, 'projects', projectId, 'automations');
  const snap = await getDocs(ref);
  return snap.docs
    .map((d) => mapAutomationDoc(d, projectId))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export async function addAutomation(projectId, { type, title, description, status = 'active' } = {}) {
  if (!projectId) throw new Error('Projeto inválido.');
  if (!type) throw new Error('Tipo de automação inválido.');

  const ref = collection(db, 'projects', projectId, 'automations');
  const docRef = await addDoc(ref, {
    type,
    status: status === 'inactive' ? 'inactive' : 'active',
    lastRun: null,
    projectId,
    title: title || type,
    description: description || '',
    createdAt: serverTimestamp(),
  });

  return {
    id: docRef.id,
    type,
    status: status === 'inactive' ? 'inactive' : 'active',
    lastRun: null,
    projectId,
    title: title || type,
    description: description || '',
    createdAt: null,
  };
}

export async function toggleAutomation(projectId, automationId, nextStatus) {
  if (!projectId || !automationId) throw new Error('Automação inválida.');
  const status = nextStatus === 'inactive' ? 'inactive' : 'active';
  await updateDoc(doc(db, 'projects', projectId, 'automations', automationId), { status });
  return status;
}

export async function listRuns(projectId, { max = 40 } = {}) {
  if (!projectId) return [];
  const ref = collection(db, 'projects', projectId, 'automationRuns');
  const q = query(ref, orderBy('createdAt', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map(mapRunDoc);
}

export async function recordRun(projectId, { type, status = 'success' } = {}) {
  if (!projectId) throw new Error('Projeto inválido.');
  if (!type) throw new Error('Tipo inválido.');

  const runsRef = collection(db, 'projects', projectId, 'automationRuns');
  const runRef = await addDoc(runsRef, {
    type,
    status: status === 'failed' ? 'failed' : 'success',
    projectId,
    createdAt: serverTimestamp(),
  });

  // Bump lastRun on matching active automation docs of this type
  const autos = await listAutomations(projectId);
  await Promise.all(
    autos
      .filter((a) => a.type === type)
      .map((a) =>
        updateDoc(doc(db, 'projects', projectId, 'automations', a.id), {
          lastRun: serverTimestamp(),
        }).catch(() => {})
      )
  );

  return runRef.id;
}

/**
 * Simulate a background agent run for one automation type.
 * Keeps "running" for SIMULATION_MS, then records the run only at the end.
 */
export async function triggerAutomation(projectId, type, { durationMs = SIMULATION_MS } = {}) {
  if (!projectId || !type) return null;
  await sleep(durationMs);
  await recordRun(projectId, { type, status: 'success' });
  return toastMessageForType(type);
}

/**
 * After code gen / save: if the project has active automations, debounce and
 * simulate discreet background runs (persistent banner + toast + metrics).
 *
 * @param {string} projectId
 * @param {{
 *   onStart?: (info: { type: string, message: string }) => void,
 *   onToast?: (payload: { message: string, type: string, duration?: number }) => void,
 *   onComplete?: (info: { type: string, message: string }) => void,
 * }} [opts]
 */
export function scheduleAutomationCheck(projectId, { onStart, onToast, onComplete } = {}) {
  if (!projectId) return;

  const existing = debounceTimers.get(projectId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    debounceTimers.delete(projectId);
    const now = Date.now();
    const prev = lastRunAt.get(projectId) || 0;
    if (now - prev < DEBOUNCE_MS) return;
    lastRunAt.set(projectId, now);

    try {
      const autos = await listAutomations(projectId);
      const active = autos.filter((a) => a.status === 'active');
      if (!active.length) return;

      // Prefer security_scan toast copy if present; else first active
      const preferred =
        active.find((a) => a.type === 'security_scan') || active[0];

      if (typeof onStart === 'function') {
        onStart({
          type: preferred.type,
          message: 'Agente em execução…',
        });
      }

      if (typeof onToast === 'function') {
        onToast({
          message: toastMessageForType(preferred.type),
          type: 'info',
          duration: SIMULATION_MS + 500,
        });
      }

      await Promise.all(active.map((a) => triggerAutomation(projectId, a.type)));

      if (typeof onComplete === 'function') {
        onComplete({
          type: preferred.type,
          message: doneMessageForType(preferred.type),
        });
      }

      if (typeof onToast === 'function') {
        onToast({
          message: doneMessageForType(preferred.type),
          type: 'success',
          duration: 3200,
        });
      }
    } catch (err) {
      console.warn('[automations] schedule failed:', err);
      if (typeof onComplete === 'function') {
        onComplete({ type: null, message: null, error: true });
      }
      if (typeof onToast === 'function') {
        onToast({
          message: err?.message || 'Falha na execução do agente.',
          type: 'error',
          duration: 4500,
        });
      }
    }
  }, 1200);

  debounceTimers.set(projectId, timer);
}

export function metricsFromRuns(runs, windowMs = 7 * 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - windowMs;
  let successful7d = 0;
  let failed7d = 0;
  for (const run of runs || []) {
    const ms = toMillis(run.createdAt);
    if (!ms || ms < cutoff) continue;
    if (run.status === 'failed') failed7d += 1;
    else successful7d += 1;
  }
  return { successful7d, failed7d };
}

export function formatRunTime(ts) {
  const ms = toMillis(ts);
  if (!ms) return 'Agora';
  return new Date(ms).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** ServerTimestamp-compatible cutoff for client filters */
export function sevenDaysAgoTimestamp() {
  return Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
}
