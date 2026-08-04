/**
 * Catálogo de integrações GoCreate — só providers funcionais.
 * Stubs / “em breve” ficam ocultos até estarem prontos.
 *
 * connectType:
 *   - platform     → plataforma GoCreate (Cloudinary, ViaCEP, Pix)
 *   - backend_gate → Login / Firestore / Firebase — só “ligado” com Backend Functions
 *   - oauth        → OAuth (Mercado Pago, GitHub)
 */

export const INTEGRATION_CATEGORIES = [
  { id: 'payments', label: 'Pagamentos' },
  { id: 'auth', label: 'Autenticação' },
  { id: 'database', label: 'Base de dados' },
  { id: 'storage', label: 'Storage' },
  { id: 'brazil', label: 'Brasil' },
];

/** @typedef {'payments'|'auth'|'database'|'storage'|'brazil'} CategoryId */
/** @typedef {'platform'|'backend_gate'|'oauth'} ConnectType */

/**
 * @type {Array<{
 *   id: string,
 *   name: string,
 *   category: CategoryId,
 *   description: string,
 *   icon: string,
 *   connectType: ConnectType,
 *   docsUrl?: string,
 * }>}
 */
export const INTEGRATIONS_CATALOG = [
  {
    id: 'mercadopago',
    name: 'Mercado Pago',
    category: 'payments',
    description:
      'Conectar com Mercado Pago (OAuth) — recebe na tua conta. Billing GoCreate e GoCreatePayments usam a conta ligada.',
    icon: 'Wallet',
    connectType: 'oauth',
    docsUrl: 'https://www.mercadopago.com.br/developers/docs/security/oauth',
  },
  {
    id: 'pix',
    name: 'Pix (via Mercado Pago)',
    category: 'brazil',
    description:
      'QR Code e copia-e-cola reais via Mercado Pago — sem pedir chave ao utilizador.',
    icon: 'QrCode',
    connectType: 'platform',
  },
  {
    id: 'firebase_auth',
    name: 'Login (Firebase Auth)',
    category: 'auth',
    description:
      'Login e-mail e Google nos apps gerados (window.GoCreateAuth). Disponível após ativar Backend Functions no projeto (−créditos).',
    icon: 'Shield',
    connectType: 'backend_gate',
  },
  {
    id: 'google_oauth',
    name: 'Login Google',
    category: 'auth',
    description:
      '1-click Google nos apps gerados. Requer Backend Functions ativas no projeto.',
    icon: 'Chrome',
    connectType: 'backend_gate',
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'auth',
    description: 'OAuth para exportar projetos (criar repo + push). Plano Pro.',
    icon: 'Github',
    connectType: 'oauth',
    docsUrl: 'https://docs.github.com/en/apps/oauth-apps',
  },
  {
    id: 'firebase_firestore',
    name: 'Cloud Firestore',
    category: 'database',
    description:
      'Base NoSQL nos apps gerados. Só disponível depois de ativar Backend Functions (−créditos no Free).',
    icon: 'Database',
    connectType: 'backend_gate',
  },
  {
    id: 'firebase_storage',
    name: 'Firebase',
    category: 'storage',
    description:
      'Storage e runtime Firebase do projeto. Desbloqueado com Backend Functions.',
    icon: 'FolderOpen',
    connectType: 'backend_gate',
  },
  {
    id: 'cloudinary',
    name: 'Cloudinary',
    category: 'storage',
    description: 'Upload de imagens/vídeos no chat — ativo na plataforma.',
    icon: 'Image',
    connectType: 'platform',
  },
  {
    id: 'viacep',
    name: 'ViaCEP',
    category: 'brazil',
    description: 'Autocompletar endereço por CEP — API pública, sempre disponível.',
    icon: 'MapPin',
    connectType: 'platform',
    docsUrl: 'https://viacep.com.br',
  },
];

/** IDs que só ficam “ligados” com backendEnabled num projeto. */
export const BACKEND_GATED_INTEGRATION_IDS = new Set([
  'firebase_auth',
  'google_oauth',
  'firebase_firestore',
  'firebase_storage',
]);

export function getIntegrationById(id) {
  return INTEGRATIONS_CATALOG.find((i) => i.id === id) || null;
}

export function getIntegrationsByCategory(categoryId) {
  return INTEGRATIONS_CATALOG.filter((i) => i.category === categoryId);
}

export default INTEGRATIONS_CATALOG;
