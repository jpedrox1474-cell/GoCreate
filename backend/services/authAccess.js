/**
 * Published-app Google login allowlist.
 * Default: only the project owner. Optional: owner + invited emails.
 */

export const AUTH_ACCESS_DENIED_MESSAGE = 'Sem permissão para aceder a este projeto';

export function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

export function normalizeAuthAccess(raw) {
  const mode = raw?.mode === 'invited' ? 'invited' : 'owner_only';
  const invitedEmails = Array.isArray(raw?.invitedEmails)
    ? [
        ...new Set(
          raw.invitedEmails
            .map(normalizeEmail)
            .filter((e) => e && e.includes('@'))
        ),
      ].slice(0, 50)
    : [];
  return { mode, invitedEmails };
}

/**
 * @param {{ uid?: string|null, email?: string|null }} user
 * @param {{ ownerId?: string|null, ownerEmail?: string|null, authAccess?: object }} project
 */
export function isEmailAllowedForProjectAuth(user, project) {
  const uid = String(user?.uid || '').trim();
  const email = normalizeEmail(user?.email);
  const ownerId = String(project?.ownerId || '').trim();
  const ownerEmail = normalizeEmail(project?.ownerEmail);
  const access = normalizeAuthAccess(project?.authAccess);

  if (uid && ownerId && uid === ownerId) return true;
  if (email && ownerEmail && email === ownerEmail) return true;

  if (access.mode === 'invited') {
    if (email && access.invitedEmails.includes(email)) return true;
  }

  return false;
}

export function publicAuthAccessPayload(project) {
  const access = normalizeAuthAccess(project?.authAccess);
  return {
    mode: access.mode,
    invitedEmails: access.invitedEmails,
    ownerId: project?.ownerId || null,
    ownerEmail: normalizeEmail(project?.ownerEmail) || null,
  };
}
