// Planos, allowances e helpers de premium/owner — fonte única para UI.

export const PLAN_ALLOWANCE = {
  free: 50,
  pro: 500,
  enterprise_master: Infinity,
};

export const OWNER_EMAILS = new Set([
  'jpedroxs1474@gmail.com',
  'jpedrox1474@gmail.com',
  'sknfaceit@outlook.com',
]);

export const OWNER_ROLE = 'owner';
export const OWNER_PLAN = 'enterprise_master';

export const PREMIUM_REQUIRED_MESSAGE =
  'Recurso Premium. GitHub e canais sociais (WhatsApp, Instagram, Facebook, YouTube, TikTok) estão nos planos pagos. Upload de mídia e leitura pela IA estão incluídos no Free.';

/** Custo para ativar Backend Functions (Base44 freemium: Free = 0). */
export const BACKEND_ENABLE_CREDIT_COST = 0;

export const BACKEND_REQUIRED_MESSAGE =
  'Funções de Backend não ativadas. Ative em Configurações do projeto para guardar dados na base de dados.';

export const PLANS = [
  {
    id: 'free',
    name: 'Free',
    priceLabel: 'R$ 0',
    period: '/mês',
    credits: 50,
    type: 'subscription',
    amount: 0,
    highlight: false,
    features: [
      '50 créditos/dia',
      'Anexar imagens/vídeos (IA lê o conteúdo)',
      'Publicar com badge GoCreate',
      'Backend Functions (Auth + base de dados)',
      'Preview Sandpack + Pix demo',
    ],
    cta: 'Plano atual',
  },
  {
    id: 'pro',
    name: 'Pro',
    priceLabel: 'R$ 49',
    period: '/mês',
    credits: 500,
    type: 'subscription',
    amount: 49,
    highlight: true,
    features: [
      '500 créditos/mês',
      'Sem badge “Feito com GoCreate”',
      'GitHub + canais sociais',
      'Backend Functions + GitHub/redes',
      'Prioridade na fila',
    ],
    cta: 'Assinar Pro via Pix',
  },
  {
    id: 'turbo',
    name: 'Turbo',
    priceLabel: 'R$ 20',
    period: ' via Pix',
    credits: 100,
    type: 'topup',
    amount: 20,
    highlight: false,
    features: ['+100 créditos', 'Pagamento único via Pix', 'Sem renovação'],
    cta: 'Comprar via Pix',
  },
];

export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  let e = email.trim().toLowerCase();
  const gh = e.match(/^(?:\d+\+)?([a-z0-9._-]+)@users\.noreply\.github\.com$/);
  if (gh) {
    const local = gh[1].replace(/-cell$/, '');
    if (local === 'jpedrox1474' || local === 'jpedroxs1474') {
      return `${local}@gmail.com`;
    }
  }
  const [local, domain] = e.split('@');
  if (!domain) return e;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const base = local.split('+')[0].replace(/\./g, '');
    if (base === 'jpedroxs1474' || base === 'jpedrox1474') {
      return `${base.includes('xs') ? 'jpedroxs1474' : 'jpedrox1474'}@gmail.com`;
    }
  }
  return e;
}

export function isOwnerEmail(email) {
  const n = normalizeEmail(email);
  if (OWNER_EMAILS.has(n)) return true;
  const raw = (email || '').trim().toLowerCase();
  return OWNER_EMAILS.has(raw);
}

/**
 * @param {{ plan?: string, role?: string, email?: string } | null} user
 */
export function isOwnerUser(user) {
  if (!user) return false;
  if (user.role === OWNER_ROLE || user.plan === OWNER_PLAN) return true;
  return isOwnerEmail(user.email);
}

/**
 * Contas privilegiadas (owner allowlist) podem editar código na aba Código
 * estilo Base44 — digitar / copiar / colar e gravar no projeto.
 */
export function canEditProjectCode(user) {
  return isOwnerUser(user);
}

/**
 * Pro, enterprise_master e owner passam; Free não.
 * @param {{ plan?: string, role?: string, email?: string } | null} user
 */
export function canUsePremium(user) {
  if (!user) return false;
  if (isOwnerUser(user)) return true;
  const plan = user.plan || 'free';
  return plan === 'pro' || plan === 'enterprise_master';
}

export function getPlanAllowance(plan) {
  return PLAN_ALLOWANCE[plan] ?? PLAN_ALLOWANCE.free;
}

export function formatCreditsLabel({ credits, unlimited, loading }) {
  if (loading) return '…';
  if (unlimited) return 'Ilimitado';
  return String(credits ?? 0);
}
