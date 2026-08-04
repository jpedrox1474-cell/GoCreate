// Frontend helpers for project collaborator ACL.

export function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

/**
 * @returns {'owner'|'editor'|'viewer'|null}
 */
export function resolveClientProjectRole(project, user) {
  if (!project || !user) return null;
  const uid = user.uid;
  const email = normalizeEmail(user.email);
  if (uid && project.ownerId === uid) return 'owner';
  if (email && normalizeEmail(project.ownerEmail) === email) return 'owner';
  const list = Array.isArray(project.collaborators) ? project.collaborators : [];
  const hit = list.find((c) => normalizeEmail(c.email) === email);
  if (!hit) {
    // Fallback: emails arrays without role detail
    const editors = Array.isArray(project.collaboratorEditorEmails)
      ? project.collaboratorEditorEmails.map(normalizeEmail)
      : [];
    const all = Array.isArray(project.collaboratorEmails)
      ? project.collaboratorEmails.map(normalizeEmail)
      : [];
    if (email && editors.includes(email)) return 'editor';
    if (email && all.includes(email)) return 'viewer';
    return null;
  }
  return hit.role === 'viewer' ? 'viewer' : 'editor';
}

export function canEditProject(role) {
  return role === 'owner' || role === 'editor';
}

export function canViewProject(role) {
  return role === 'owner' || role === 'editor' || role === 'viewer';
}

export function canManageProject(role) {
  return role === 'owner';
}
