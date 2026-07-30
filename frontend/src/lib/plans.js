// Planos e allowances mensais — fonte única para UI de billing.

export const PLAN_ALLOWANCE = {
  free: 50,
  pro: 500,
};

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
    features: ['50 créditos/mês', 'Projetos básicos', 'Modelos standard'],
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

export function getPlanAllowance(plan) {
  return PLAN_ALLOWANCE[plan] ?? PLAN_ALLOWANCE.free;
}
