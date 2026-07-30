// Helpers do Firestore relacionados a projetos e histórico de mensagens.

import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

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
  return {
    id: d.id,
    name: data.name || 'Projeto',
    description: data.description || 'Projeto criado com GoCreate',
    status: data.status || 'draft',
    framework: data.framework || 'React + Tailwind',
    color: data.color || 'from-blue-600 to-indigo-600',
    isDefault: Boolean(data.isDefault),
    ownerId: data.ownerId,
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

export async function createProject(uid, { name = 'Novo Projeto', description = '', isDefault = false } = {}) {
  const projectsRef = collection(db, 'projects');
  const newProjectRef = doc(projectsRef);
  await setDoc(newProjectRef, {
    ownerId: uid,
    name,
    description: description || 'Projeto criado com GoCreate',
    status: 'draft',
    framework: 'React + Tailwind',
    color: pickColor(),
    isDefault,
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

export async function deleteProject(projectId) {
  // Mensagens filhas ficam órfãs no MVP — limpeza completa pode vir depois.
  await deleteDoc(doc(db, 'projects', projectId));
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

/** Real shareable URL on the same Firebase Hosting origin (no fake *.gocreate.app). */
export function getPublishUrl(projectId, env = 'production') {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://gocreate.web.app';
  const path = env === 'preview' ? `/p/${projectId}/preview` : `/p/${projectId}`;
  return `${origin}${path}`;
}

/**
 * Persist generated files to a publicly readable snapshot and return the live URL.
 * Redeploy overwrites the same snapshot for that env.
 */
export async function publishProject(
  projectId,
  { files, name, env = 'production', ownerId } = {}
) {
  if (!projectId) throw new Error('Projeto inválido.');
  if (!ownerId) throw new Error('Utilizador inválido.');
  if (!files || typeof files !== 'object' || !Object.keys(files).length) {
    throw new Error('Não há ficheiros para publicar. Gera código no chat primeiro.');
  }

  const pubId = publicProjectDocId(projectId, env);
  const url = getPublishUrl(projectId, env);
  const payload = {
    projectId,
    ownerId,
    name: name || 'Projeto',
    env: env === 'preview' ? 'preview' : 'production',
    files,
    url,
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'publicProjects', pubId), payload, { merge: true });

  try {
    await updateDoc(doc(db, 'projects', projectId), {
      status: env === 'preview' ? 'preview' : 'live',
      publishedUrl: url,
      publishedEnv: payload.env,
      publishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[projects] atualizar status do projeto falhou:', err);
  }

  return { url, pubId, env: payload.env };
}

export async function getPublishedProject(projectId, env = 'production') {
  if (!projectId) return null;
  const pubId = publicProjectDocId(projectId, env);
  const snap = await getDoc(doc(db, 'publicProjects', pubId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}
