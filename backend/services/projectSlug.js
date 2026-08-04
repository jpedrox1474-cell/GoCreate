/**
 * Public URL slugs for published projects.
 * Stable path: /p/{slug} — defaults to projectId; user may customize if unique.
 */

const RESERVED = new Set([
  'api',
  'p',
  'editor',
  'login',
  'register',
  'dashboard',
  'settings',
  'integrations',
  'automations',
  'entities',
  'database',
  'profile',
  'preview',
  'admin',
  'gocreate',
  'www',
  'app',
  'new',
  'me',
]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @param {unknown} raw
 * @returns {{ ok: true, slug: string } | { ok: false, error: string }}
 */
export function normalizeSlug(raw) {
  const slug = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!slug) return { ok: false, error: 'Slug vazio.' };
  if (slug.length < 3) return { ok: false, error: 'Slug deve ter pelo menos 3 caracteres.' };
  if (slug.length > 48) return { ok: false, error: 'Slug pode ter no máximo 48 caracteres.' };
  if (!SLUG_RE.test(slug)) {
    return { ok: false, error: 'Use apenas letras minúsculas, números e hífens.' };
  }
  if (RESERVED.has(slug)) {
    return { ok: false, error: 'Este slug é reservado. Escolhe outro.' };
  }
  return { ok: true, slug };
}

/**
 * Prefer custom slug; fallback to stable projectId.
 * @param {{ slug?: string } | null | undefined} project
 * @param {string} projectId
 */
export function resolveProjectPublicKey(project, projectId) {
  const custom = String(project?.slug || '').trim().toLowerCase();
  if (custom && SLUG_RE.test(custom) && !RESERVED.has(custom)) return custom;
  return projectId;
}

/**
 * @param {string} publicKey — slug or projectId
 * @param {'production'|'preview'} env
 */
export function buildPublishUrl(publicKey, env = 'production') {
  const origin = (process.env.PUBLIC_APP_URL || 'https://gocreate-app.web.app').replace(/\/$/, '');
  const key = String(publicKey || '').replace(/^\/+|\/+$/g, '');
  return env === 'preview' ? `${origin}/p/${key}/preview` : `${origin}/p/${key}`;
}

export { RESERVED, SLUG_RE };

export default {
  normalizeSlug,
  resolveProjectPublicKey,
  buildPublishUrl,
  RESERVED,
  SLUG_RE,
};
