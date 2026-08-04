// Checkpoints de ficheiros após cada apply da IA — permite desfazer o último turno.

import {
  collection,
  doc,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

const CHECKPOINTS = 'checkpoints';

/**
 * Guarda snapshot dos ficheiros + tamanho do histórico antes do apply.
 */
export async function saveCheckpoint(projectId, { files, messageCount, prompt = '' } = {}) {
  if (!projectId || !files || typeof files !== 'object') return null;
  const ref = collection(db, 'projects', projectId, CHECKPOINTS);
  const docRef = await addDoc(ref, {
    files,
    messageCount: typeof messageCount === 'number' ? messageCount : 0,
    prompt: String(prompt || '').slice(0, 240),
    createdAt: serverTimestamp(),
  });
  // Mantém só os 10 mais recentes
  const snap = await getDocs(query(ref, orderBy('createdAt', 'desc')));
  if (snap.size > 10) {
    const batch = writeBatch(db);
    snap.docs.slice(10).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return docRef.id;
}

export async function getLatestCheckpoint(projectId) {
  if (!projectId) return null;
  const ref = collection(db, 'projects', projectId, CHECKPOINTS);
  const snap = await getDocs(query(ref, orderBy('createdAt', 'desc'), limit(1)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function deleteCheckpoint(projectId, checkpointId) {
  if (!projectId || !checkpointId) return;
  await deleteDoc(doc(db, 'projects', projectId, CHECKPOINTS, checkpointId));
}

/**
 * Apaga mensagens a partir do índice messageCount (mantém as primeiras N).
 */
export async function truncateMessagesToCount(projectId, messageCount) {
  if (!projectId) return 0;
  const keep = Math.max(0, Number(messageCount) || 0);
  const messagesRef = collection(db, 'projects', projectId, 'messages');
  const snap = await getDocs(query(messagesRef, orderBy('createdAt', 'asc')));
  const toDelete = snap.docs.slice(keep);
  if (!toDelete.length) return 0;

  for (let i = 0; i < toDelete.length; i += 400) {
    const batch = writeBatch(db);
    toDelete.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return toDelete.length;
}

/**
 * Restaura ficheiros + histórico para o último checkpoint e remove-o.
 */
export async function undoLastCheckpoint(projectId) {
  const cp = await getLatestCheckpoint(projectId);
  if (!cp) {
    const err = new Error('Não há alteração recente para desfazer.');
    err.code = 'NO_CHECKPOINT';
    throw err;
  }
  const deleted = await truncateMessagesToCount(projectId, cp.messageCount ?? 0);
  await deleteCheckpoint(projectId, cp.id);
  return {
    files: cp.files && typeof cp.files === 'object' ? cp.files : {},
    messageCount: cp.messageCount ?? 0,
    prompt: cp.prompt || '',
    deletedMessages: deleted,
    checkpointId: cp.id,
  };
}
