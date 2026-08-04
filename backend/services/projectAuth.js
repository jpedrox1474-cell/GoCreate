/**
 * Project-level Authentication settings (Base44-style hybrid panel).
 * Flags live on projects/{id}.auth — OAuth secrets stay in envSecrets only.
 */

export const AUTH_GOOGLE_MODES = new Set(['default', 'custom']);

export const GOOGLE_OAUTH_CLIENT_ID_KEY = 'GOOGLE_OAUTH_CLIENT_ID';
export const GOOGLE_OAUTH_CLIENT_SECRET_KEY = 'GOOGLE_OAUTH_CLIENT_SECRET';

/** Keys that must never be injected into browser runtime. */
const SECRET_KEY_DENY = /(_SECRET|_PRIVATE_KEY|PRIVATE_KEY|CLIENT_SECRET)$/i;

export function isClientSafeEnvSecretKey(key) {
  const k = String(key || '')
    .trim()
    .toUpperCase();
  if (!k) return false;
  if (SECRET_KEY_DENY.test(k)) return false;
  if (k === GOOGLE_OAUTH_CLIENT_SECRET_KEY) return false;
  return true;
}

export function normalizeProjectAuth(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const googleMode = AUTH_GOOGLE_MODES.has(src.googleMode) ? src.googleMode : 'default';
  return {
    googleEnabled: Boolean(src.googleEnabled),
    googleMode,
    emailPasswordEnabled: Boolean(src.emailPasswordEnabled),
  };
}

/**
 * Merge partial auth updates into existing auth object.
 */
export function mergeProjectAuth(existing, patch) {
  const base = normalizeProjectAuth(existing);
  if (!patch || typeof patch !== 'object') return base;
  const next = { ...base };
  if (patch.googleEnabled != null) next.googleEnabled = Boolean(patch.googleEnabled);
  if (patch.googleMode != null && AUTH_GOOGLE_MODES.has(patch.googleMode)) {
    next.googleMode = patch.googleMode;
  }
  if (patch.emailPasswordEnabled != null) {
    next.emailPasswordEnabled = Boolean(patch.emailPasswordEnabled);
  }
  return normalizeProjectAuth(next);
}

/**
 * Public/runtime payload — never includes secrets.
 * googleAuthConnected is true only when backend is unlocked AND google is enabled.
 */
export function publicProjectAuthPayload(project) {
  const auth = normalizeProjectAuth(project?.auth);
  const backendEnabled = Boolean(project?.backendEnabled);
  const googleAuthEnabled = backendEnabled && auth.googleEnabled;
  return {
    auth: {
      googleEnabled: auth.googleEnabled,
      googleMode: auth.googleMode,
      emailPasswordEnabled: auth.emailPasswordEnabled,
    },
    googleAuthEnabled,
    googleAuthMode: auth.googleMode,
  };
}

export function buildAuthWiringPrompt({ googleMode = 'default' } = {}) {
  const mode =
    googleMode === 'custom'
      ? 'Custom OAuth (Client ID do projeto em envSecrets; NUNCA uses Client Secret no código Sandpack)'
      : 'Default GoCreate OAuth (Firebase Google provider da plataforma)';
  return (
    `O utilizador ativou Google Login nas Configurações do projeto (${mode}). ` +
    `Conecta o provedor de autenticação nas rotas e adiciona o botão "Continuar com Google" ` +
    `na tela de Login/Register usando window.GoCreateAuth.signInWithGoogle() e as flags do projeto ` +
    `(window.__GOCREATE_AUTH__ / googleAuthEnabled). ` +
    `Mostra o botão Google só quando window.__GOCREATE_AUTH__?.googleAuthEnabled !== false. ` +
    `NÃO inventes Client Secret, nem firebaseConfig manual, nem APIs de auth alternativas.`
  );
}
