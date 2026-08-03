// Owner emails + premium helpers — shared by credits / paywall middleware.
// Role/plan elevation happens only via Admin SDK (never trust the client).

export const OWNER_EMAILS = new Set([
  'jpedroxs1474@gmail.com',
  'jpedrox1474@gmail.com',
  'sknfaceit@outlook.com',
]);

export const OWNER_ROLE = 'owner';
export const OWNER_PLAN = 'enterprise_master';
export const FREE_DAILY_CREDITS = 50;
export const PREMIUM_PLANS = new Set(['pro', 'enterprise_master']);
/** Créditos para ativar Backend Functions num projeto (Free). Owner/Pro: grátis. */
export const BACKEND_ENABLE_CREDIT_COST = 5;

/**
 * Normalize email for owner matching (lowercase, strip +aliases for gmail).
 * Also maps GitHub noreply that embeds the local part.
 */
export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  let e = email.trim().toLowerCase();
  // GitHub: 123456+jpedrox1474@users.noreply.github.com or jpedrox1474@users.noreply.github.com
  const gh = e.match(/^(?:\d+\+)?([a-z0-9._-]+)@users\.noreply\.github\.com$/);
  if (gh) {
    const local = gh[1].replace(/-cell$/, '');
    if (local === 'jpedrox1474' || local === 'jpedroxs1474') {
      return `${local}@gmail.com`;
    }
  }
  // Gmail dots / plus: keep local before +
  const [local, domain] = e.split('@');
  if (!domain) return e;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const base = local.split('+')[0].replace(/\./g, '');
    // Preserve intentional typo variants (with/without 's')
    if (base === 'jpedroxs1474' || base === 'jpedrox1474') {
      return `${base.includes('xs') ? 'jpedroxs1474' : 'jpedrox1474'}@gmail.com`;
    }
  }
  return e;
}

export function isOwnerEmail(email) {
  const n = normalizeEmail(email);
  if (OWNER_EMAILS.has(n)) return true;
  // Exact raw match as primary rule (before normalize edge-cases)
  const raw = (email || '').trim().toLowerCase();
  return OWNER_EMAILS.has(raw);
}

export function isOwnerUser(data = {}) {
  if (!data || typeof data !== 'object') return false;
  if (data.role === OWNER_ROLE) return true;
  if (data.plan === OWNER_PLAN) return true;
  return isOwnerEmail(data.email);
}

export function canUsePremium(userOrDoc = {}) {
  if (!userOrDoc || typeof userOrDoc !== 'object') return false;
  if (isOwnerUser(userOrDoc)) return true;
  const plan = userOrDoc.plan || 'free';
  return PREMIUM_PLANS.has(plan);
}

/** Calendar date YYYY-MM-DD in America/Sao_Paulo (UTC-3 / with DST rules). */
export function todayKeyUTC3(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export const PREMIUM_REQUIRED_MESSAGE =
  'Recurso Premium. GitHub e canais sociais (WhatsApp, Instagram, Facebook, YouTube, TikTok) estão nos planos pagos. Upload/leitura de mídia, publicar e Backend Functions estão no Free (créditos / badge GoCreate).';

export const BACKEND_REQUIRED_MESSAGE =
  'Funções de Backend não ativadas. Ative em Configurações do projeto para guardar dados na base de dados.';

export default {
  OWNER_EMAILS,
  OWNER_ROLE,
  OWNER_PLAN,
  FREE_DAILY_CREDITS,
  BACKEND_ENABLE_CREDIT_COST,
  isOwnerEmail,
  isOwnerUser,
  canUsePremium,
  todayKeyUTC3,
  PREMIUM_REQUIRED_MESSAGE,
  BACKEND_REQUIRED_MESSAGE,
};
