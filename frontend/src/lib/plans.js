// Planos, allowances e helpers de premium/owner — fonte única para UI.

export const PLAN_ALLOWANCE = {
  free: 50,
  pro: 500,
  enterprise_master: Infinity,
};

export const OWNER_EMAILS = new Set([
  'jpedroxs1474@gmail.com',
  'jpedrox1474@gmail.com',
]);

export const OWNER_ROLE = 'owner';
export const OWNER_PLAN = 'enterprise_master';

export const PREMIUM_REQUIRED_MESSAGE =
  'Recurso Premium. GitHub, deploys de backend e canais sociais (WhatsApp Evolution, Instagram, Facebook) estão disponíveis nos planos pagos.';

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
    features: ['50 créditos/dia', 'Projetos básicos', 'Preview Sandpack', 'Modelos standard'],
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
      'GitHub + deploy produção',
      'Projetos maiores',
      'Modelos avançados',
      'Prioridade na fila',
    ],
    cta: 'Assinar Pro',
  },
  {
    id: 'turbo',
    name: 'Turbo',
    priceLabel: 'R$ 20',
    period: ' via PIX',
    credits: 100,
    type: 'topup',
    amount: 20,
    highlight: false,
    features: ['+100 créditos', 'Pagamento único via PIX', 'Sem renovação'],
    cta: 'Comprar via PIX',
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
