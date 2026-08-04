// Helpers do Firestore relacionados a projetos e histórico de mensagens.

import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  writeBatch,
  query,
  where,
  limit,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { getAuth } from 'firebase/auth';
import {
  buildProjectThumbnailDataUrl,
  deleteProjectViaApi,
  bulkDeleteProjectsViaApi,
} from './projectsApi';

const WELCOME_MESSAGE = 'Olá! Bem-vindo ao GoCreate. O que vamos construir hoje?';

const PROJECT_COLORS = [
  'from-blue-600 to-indigo-600',
  'from-emerald-600 to-teal-600',
  'from-violet-600 to-purple-600',
  'from-amber-600 to-orange-600',
  'from-rose-600 to-pink-600',
  'from-cyan-600 to-blue-600',
];

function pickColor() {
  return PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
}

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

export function formatRelativeTime(ts) {
  const ms = toMillis(ts);
  if (!ms) return 'Agora';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Agora';
  if (mins < 60) return `Há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Ontem';
  if (days < 14) return `Há ${days} dias`;
  return new Date(ms).toLocaleDateString('pt-BR');
}

export function mapProjectDoc(d) {
  const data = d.data();
  const name = data.name || 'Projeto';
  const color = data.color || 'from-blue-600 to-indigo-600';
  // Always use the branded initials/gradient thumb for cards (ignore Unsplash / old screenshots).
  const thumbnail = buildProjectThumbnailDataUrl(name, color);
  const authAccess =
    data.authAccess?.mode === 'invited'
      ? {
          mode: 'invited',
          invitedEmails: Array.isArray(data.authAccess.invitedEmails)
            ? data.authAccess.invitedEmails
                .map((e) => String(e || '').trim().toLowerCase())
                .filter((e) => e.includes('@'))
            : [],
        }
      : { mode: 'owner_only', invitedEmails: [] };
  return {
    id: d.id,
    name,
    description: data.description || 'Projeto criado com GoCreate',
    status: data.status || 'draft',
    framework: data.framework || 'React + Tailwind',
    color,
    thumbnail,
    thumbnailUrl: data.thumbnailUrl || data.thumbnail || null,
    customDomain: data.customDomain || '',
    customDomainVerified: Boolean(data.customDomainVerified),
    publishedUrl: data.publishedUrl || null,
    publishedEnv: data.publishedEnv || null,
    slug: data.slug || null,
    isDefault: Boolean(data.isDefault),
    backendEnabled: Boolean(data.backendEnabled),
    ownerId: data.ownerId,
    ownerEmail: data.ownerEmail || null,
    collaborators: Array.isArray(data.collaborators)
      ? data.collaborators.map((c) => ({
          email: String(c.email || '')
            .trim()
            .toLowerCase(),
          role: c.role === 'viewer' ? 'viewer' : 'editor',
        }))
      : [],
    collaboratorEmails: Array.isArray(data.collaboratorEmails)
      ? data.collaboratorEmails.map((e) => String(e || '').trim().toLowerCase())
      : [],
    collaboratorEditorEmails: Array.isArray(data.collaboratorEditorEmails)
      ? data.collaboratorEditorEmails.map((e) => String(e || '').trim().toLowerCase())
      : [],
    authAccess,
    auth: {
      googleEnabled: Boolean(data.auth?.googleEnabled),
      googleMode: data.auth?.googleMode === 'custom' ? 'custom' : 'default',
      emailPasswordEnabled: Boolean(data.auth?.emailPasswordEnabled),
    },
    createdAt: data.createdAt,
    updatedAt: data.updatedAt || data.createdAt,
    updatedAtLabel: formatRelativeTime(data.updatedAt || data.createdAt),
  };
}

export async function getOrCreateDefaultProject(uid) {
  const projectsRef = collection(db, 'projects');
  const q = query(
    projectsRef,
    where('ownerId', '==', uid),
    where('isDefault', '==', true),
    limit(1)
  );

  const snap = await getDocs(q);
  if (!snap.empty) {
    return snap.docs[0].id;
  }

  return createProject(uid, { name: 'meu-novo-projeto', isDefault: true });
}

export async function createProject(uid, { name = 'Novo Projeto', description = '', isDefault = false, ownerEmail = null } = {}) {
  const projectsRef = collection(db, 'projects');
  const newProjectRef = doc(projectsRef);
  const email =
    String(ownerEmail || getAuth().currentUser?.email || '')
      .trim()
      .toLowerCase() || null;
  await setDoc(newProjectRef, {
    ownerId: uid,
    ownerEmail: email,
    authAccess: { mode: 'owner_only', invitedEmails: [] },
    auth: { googleEnabled: false, googleMode: 'default', emailPasswordEnabled: false },
    name,
    description: description || 'Projeto criado com GoCreate',
    status: 'draft',
    framework: 'React + Tailwind',
    color: pickColor(),
    isDefault,
    backendEnabled: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await saveMessage(newProjectRef.id, {
    role: 'ai',
    text: WELCOME_MESSAGE,
    uid: null,
  });

  return newProjectRef.id;
}

export async function listUserProjects(uid) {
  const projectsRef = collection(db, 'projects');
  const q = query(projectsRef, where('ownerId', '==', uid));
  const snap = await getDocs(q);
  return snap.docs
    .map(mapProjectDoc)
    .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
}

export async function getProject(projectId) {
  const ref = doc(db, 'projects', projectId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return mapProjectDoc(snap);
}

export async function renameProject(projectId, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Nome inválido.');
  await updateDoc(doc(db, 'projects', projectId), {
    name: trimmed,
    updatedAt: serverTimestamp(),
  });
}

export async function archiveProject(projectId, archived = true) {
  if (!projectId) throw new Error('Projeto inválido.');
  await updateDoc(doc(db, 'projects', projectId), {
    status: archived ? 'archived' : 'draft',
    updatedAt: serverTimestamp(),
  });
}

export async function updateProjectSettings(
  projectId,
  { name, description, customDomain, authAccess, ownerEmail } = {}
) {
  if (!projectId) throw new Error('Projeto inválido.');
  const patch = { updatedAt: serverTimestamp() };
  if (name != null) {
    const trimmed = String(name).trim();
    if (!trimmed) throw new Error('Nome inválido.');
    patch.name = trimmed;
  }
  if (description != null) {
    patch.description = String(description).trim();
  }
  if (customDomain != null) {
    patch.customDomain = String(customDomain).trim().toLowerCase();
  }
  if (ownerEmail != null) {
    patch.ownerEmail = String(ownerEmail).trim().toLowerCase() || null;
  }
  if (authAccess != null) {
    const mode = authAccess.mode === 'invited' ? 'invited' : 'owner_only';
    const invitedEmails = Array.isArray(authAccess.invitedEmails)
      ? [
          ...new Set(
            authAccess.invitedEmails
              .map((e) => String(e || '').trim().toLowerCase())
              .filter((e) => e.includes('@'))
          ),
        ].slice(0, 50)
      : [];
    patch.authAccess = { mode, invitedEmails };
  }
  await updateDoc(doc(db, 'projects', projectId), patch);

  // Keep published snapshots in sync so invite list applies without redeploy
  if (authAccess != null || ownerEmail != null) {
    const syncPatch = { updatedAt: serverTimestamp() };
    if (patch.authAccess) syncPatch.authAccess = patch.authAccess;
    if ('ownerEmail' in patch) syncPatch.ownerEmail = patch.ownerEmail;
    for (const pubId of [projectId, `${projectId}_preview`]) {
      try {
        const pubRef = doc(db, 'publicProjects', pubId);
        const pubSnap = await getDoc(pubRef);
        if (pubSnap.exists()) {
          await updateDoc(pubRef, syncPatch);
        }
      } catch (err) {
        console.warn('[projects] sync authAccess to public:', err);
      }
    }
  }
}

async function clientCascadeDelete(projectId) {
  const projectSnap = await getDoc(doc(db, 'projects', projectId));
  const slug = String(projectSnap.data()?.slug || '').trim().toLowerCase();

  const messagesSnap = await getDocs(collection(db, 'projects', projectId, 'messages'));
  const automationsSnap = await getDocs(collection(db, 'projects', projectId, 'automations'));
  const runsSnap = await getDocs(collection(db, 'projects', projectId, 'automationRuns'));
  const entitiesSnap = await getDocs(collection(db, 'projects', projectId, 'entities'));

  const toDelete = [
    ...messagesSnap.docs.map((d) => d.ref),
    ...automationsSnap.docs.map((d) => d.ref),
    ...runsSnap.docs.map((d) => d.ref),
  ];

  for (const ent of entitiesSnap.docs) {
    const rowsSnap = await getDocs(collection(db, 'projects', projectId, 'entities', ent.id, 'rows'));
    toDelete.push(...rowsSnap.docs.map((d) => d.ref));
    toDelete.push(ent.ref);
  }

  toDelete.push(
    doc(db, 'publicProjects', projectId),
    doc(db, 'publicProjects', `${projectId}_preview`),
    doc(db, 'projects', projectId)
  );

  if (slug && slug !== projectId) {
    toDelete.push(doc(db, 'projectSlugs', slug));
  }

  const CHUNK = 400;
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const ref of toDelete.slice(i, i + CHUNK)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}

async function getIdTokenOptional() {
  try {
    const user = getAuth().currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * Cascade delete: API Admin first, client fallback (messages, automations,
 * entities+rows, publicProjects, project doc).
 */
export async function deleteProject(projectId) {
  if (!projectId) throw new Error('Projeto inválido.');

  const token = await getIdTokenOptional();
  if (token) {
    try {
      await deleteProjectViaApi(projectId, token);
      return;
    } catch (err) {
      console.warn('[projects] API delete falhou, a tentar cliente:', err?.message || err);
    }
  }

  await clientCascadeDelete(projectId);
}

/** Bulk delete via API when possible; otherwise sequential client cascade. */
export async function deleteProjects(projectIds) {
  const ids = [...new Set((projectIds || []).filter(Boolean))];
  if (!ids.length) return { deleted: [], failed: [] };

  const token = await getIdTokenOptional();
  if (token) {
    try {
      const result = await bulkDeleteProjectsViaApi(ids, token);
      const failedIds = new Set((result.failed || []).map((f) => f.projectId));
      // Retry any API failures with client cascade
      for (const id of failedIds) {
        try {
          await clientCascadeDelete(id);
          result.deleted = [...(result.deleted || []), id];
          result.failed = (result.failed || []).filter((f) => f.projectId !== id);
        } catch {
          /* keep in failed */
        }
      }
      return result;
    } catch (err) {
      console.warn('[projects] bulk API delete falhou:', err?.message || err);
    }
  }

  const deleted = [];
  const failed = [];
  for (const id of ids) {
    try {
      await clientCascadeDelete(id);
      deleted.push(id);
    } catch (err) {
      failed.push({ projectId: id, error: err?.message || 'Falha' });
    }
  }
  return { ok: failed.length === 0, deleted, failed };
}

/** Cria um novo projeto com o mesmo nome/descrição (sem histórico). */
export async function duplicateProject(uid, project) {
  if (!uid) throw new Error('Utilizador inválido.');
  const source =
    typeof project === 'string' ? await getProject(project) : project;
  if (!source?.id && typeof project === 'string') {
    throw new Error('Projeto não encontrado.');
  }
  const baseName = (source?.name || 'Projeto').replace(/\s*\(cópia\)\s*$/i, '').trim();
  return createProject(uid, {
    name: `${baseName} (cópia)`,
    description: source?.description || 'Cópia criada no GoCreate',
  });
}

export async function touchProject(projectId) {
  try {
    await updateDoc(doc(db, 'projects', projectId), { updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn('[projects] touch falhou:', err);
  }
}

export function listenToMessages(projectId, callback) {
  const messagesRef = collection(db, 'projects', projectId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const messages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(messages);
    },
    (err) => {
      console.error('[projects] Erro ao escutar histórico de mensagens:', err);
    }
  );
}

export async function saveMessage(projectId, { role, text, uid = null, attachmentUrl = null }) {
  const messagesRef = collection(db, 'projects', projectId, 'messages');
  await addDoc(messagesRef, {
    role,
    text,
    uid,
    attachmentUrl,
    createdAt: serverTimestamp(),
  });
}

/** Doc id in `publicProjects` — production uses projectId; preview uses a suffix. */
export function publicProjectDocId(projectId, env = 'production') {
  return env === 'preview' ? `${projectId}_preview` : projectId;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Prefer custom slug; fallback to stable Firestore projectId. */
export function getProjectPublicKey(projectOrSlug, projectId) {
  if (typeof projectOrSlug === 'string' && projectOrSlug.trim()) {
    const s = projectOrSlug.trim().toLowerCase();
    if (SLUG_RE.test(s)) return s;
  }
  const custom = String(projectOrSlug?.slug || '').trim().toLowerCase();
  if (custom && SLUG_RE.test(custom)) return custom;
  return projectId || '';
}

/** Real shareable URL on the same Firebase Hosting origin (stable per slug/projectId). */
export function getPublishUrl(projectId, env = 'production', slug = null) {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://gocreate-app.web.app';
  const key = getProjectPublicKey(slug, projectId) || projectId;
  const path = env === 'preview' ? `/p/${key}/preview` : `/p/${key}`;
  return `${origin}${path}`;
}

/**
 * Persist generated files to a publicly readable snapshot and return the live URL.
 * Redeploy overwrites the same snapshot for that env (same projectId / slug).
 */
export async function publishProject(
  projectId,
  { files, name, env = 'production', ownerId, plan = 'free', role, slug = null } = {}
) {
  if (!projectId) throw new Error('Projeto inválido.');
  if (!ownerId) throw new Error('Utilizador inválido.');
  if (!files || typeof files !== 'object' || !Object.keys(files).length) {
    throw new Error('Não há ficheiros para publicar. Gera código no chat primeiro.');
  }

  // Production must go through /api/deploy/publish (Admin). Client path = preview only.
  if (env === 'production') {
    throw new Error('Deploy de produção requer API autenticada. Usa o botão Deploy no editor.');
  }

  let resolvedSlug = slug;
  let backendEnabled = false;
  let ownerEmail = null;
  let authAccess = { mode: 'owner_only', invitedEmails: [] };
  try {
    const snap = await getDoc(doc(db, 'projects', projectId));
    const pdata = snap.data() || {};
    if (!resolvedSlug) resolvedSlug = pdata.slug || null;
    backendEnabled = Boolean(pdata.backendEnabled);
    ownerEmail = pdata.ownerEmail || null;
    if (pdata.authAccess?.mode === 'invited') {
      authAccess = {
        mode: 'invited',
        invitedEmails: Array.isArray(pdata.authAccess.invitedEmails)
          ? pdata.authAccess.invitedEmails
          : [],
      };
    }
  } catch {
    if (!resolvedSlug) resolvedSlug = null;
  }

  const pubId = publicProjectDocId(projectId, env);
  const publicKey = getProjectPublicKey(resolvedSlug, projectId);
  const url = getPublishUrl(projectId, env, publicKey);
  const isProLike =
    plan === 'pro' || plan === 'enterprise_master' || role === 'owner';
  const ownerPlan = isProLike ? (plan === 'enterprise_master' ? 'enterprise_master' : 'pro') : 'free';

  const payload = {
    projectId,
    ownerId,
    ownerEmail,
    authAccess,
    name: name || 'Projeto',
    env: 'preview',
    files,
    url,
    slug: publicKey,
    plan: ownerPlan === 'enterprise_master' ? 'pro' : ownerPlan,
    showBadge: ownerPlan === 'free',
    backendEnabled,
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'publicProjects', pubId), payload, { merge: true });

  const thumb = buildProjectThumbnailDataUrl(name || 'Projeto');
  try {
    await updateDoc(doc(db, 'projects', projectId), {
      status: 'preview',
      publishedUrl: url,
      publishedEnv: 'preview',
      publishedAt: serverTimestamp(),
      thumbnailUrl: thumb,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[projects] atualizar status do projeto falhou:', err);
  }

  return { url, pubId, env: 'preview', slug: publicKey, projectId };
}

/**
 * Resolve a public path key (slug or projectId) to a published snapshot.
 */
export async function getPublishedProject(key, env = 'production') {
  if (!key) return null;

  const tryDoc = async (docId) => {
    const snap = await getDoc(doc(db, 'publicProjects', docId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  };

  // 1) Direct publicProjects id (projectId or projectId_preview)
  const directId = publicProjectDocId(key, env);
  const direct = await tryDoc(directId);
  if (direct) return direct;

  // 2) Custom slug registry → real projectId
  try {
    const slugSnap = await getDoc(doc(db, 'projectSlugs', String(key).toLowerCase()));
    if (slugSnap.exists()) {
      const projectId = slugSnap.data()?.projectId;
      if (projectId) {
        const bySlug = await tryDoc(publicProjectDocId(projectId, env));
        if (bySlug) return bySlug;
      }
    }
  } catch (err) {
    console.warn('[projects] slug resolve:', err);
  }

  return null;
}
