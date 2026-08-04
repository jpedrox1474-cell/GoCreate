// Project collaborators (editor / viewer) by email.

import admin from '../config/firebaseAdmin.js';
import { db } from '../config/firebaseAdmin.js';

const ROLES = new Set(['editor', 'viewer']);

function normEmail(e) {
  return String(e || '')
    .trim()
    .toLowerCase();
}

export async function listCollaborators(projectId) {
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists) {
    const err = new Error('Projeto não encontrado.');
    err.status = 404;
    throw err;
  }
  const data = snap.data() || {};
  const list = Array.isArray(data.collaborators) ? data.collaborators : [];
  return list.map((c) => ({
    email: normEmail(c.email),
    role: c.role === 'viewer' ? 'viewer' : 'editor',
    addedAt: c.addedAt || null,
  }));
}

export async function setCollaborators(projectId, collaborators) {
  const cleaned = [];
  const seen = new Set();
  for (const c of collaborators || []) {
    const email = normEmail(c.email);
    if (!email.includes('@') || seen.has(email)) continue;
    seen.add(email);
    const role = ROLES.has(c.role) ? c.role : 'editor';
    cleaned.push({
      email,
      role,
      addedAt: c.addedAt || new Date().toISOString(),
    });
    if (cleaned.length >= 30) break;
  }
  await db.collection('projects').doc(projectId).set(
    {
      collaborators: cleaned,
      collaboratorEmails: cleaned.map((c) => c.email),
      collaboratorEditorEmails: cleaned
        .filter((c) => c.role === 'editor')
        .map((c) => c.email),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return cleaned;
}

export async function addCollaborator(projectId, { email, role = 'editor' }) {
  const list = await listCollaborators(projectId);
  const e = normEmail(email);
  if (!e.includes('@')) {
    const err = new Error('E-mail inválido.');
    err.status = 400;
    throw err;
  }
  const next = list.filter((c) => c.email !== e);
  next.push({
    email: e,
    role: role === 'viewer' ? 'viewer' : 'editor',
    addedAt: new Date().toISOString(),
  });
  return setCollaborators(projectId, next);
}

export async function removeCollaborator(projectId, email) {
  const list = await listCollaborators(projectId);
  const e = normEmail(email);
  return setCollaborators(
    projectId,
    list.filter((c) => c.email !== e)
  );
}

/**
 * Access level for a user on a project.
 * @returns {'owner'|'editor'|'viewer'|null}
 */
export function resolveProjectRole(project, userEmail, uid) {
  if (!project) return null;
  if (uid && project.ownerId === uid) return 'owner';
  const email = normEmail(userEmail);
  if (!email) return null;
  if (normEmail(project.ownerEmail) === email) return 'owner';
  const collab = (project.collaborators || []).find((c) => normEmail(c.email) === email);
  if (!collab) return null;
  return collab.role === 'viewer' ? 'viewer' : 'editor';
}

export function canEditProject(role) {
  return role === 'owner' || role === 'editor';
}

export function canViewProject(role) {
  return role === 'owner' || role === 'editor' || role === 'viewer';
}
