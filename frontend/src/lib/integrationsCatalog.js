/**
 * Catálogo de integrações GoCreate — só providers funcionais.
 * Stubs / “em breve” ficam ocultos até estarem prontos.
 *
 * connectType:
 *   - platform     → plataforma GoCreate (Cloudinary, ViaCEP)
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
 *   help: string,
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
      'Conectar a tua conta Mercado Pago (OAuth) para receber nos apps gerados.',
    help:
      'Liga quando o teu app precisa cobrar clientes (loja, SaaS, checkout). Clica Conectar → autoriza no Mercado Pago. Nos apps gerados usa window.GoCreatePayments; o pagador escolhe Pix, cartão ou boleto no checkout. Billing Pro/Turbo da plataforma GoCreate usa a conta da plataforma, não esta ligação.',
    icon: 'Wallet',
    connectType: 'oauth',
    docsUrl: 'https://www.mercadopago.com.br/developers/docs/security/oauth',
  },
  {
    id: 'pix',
    name: 'Pix (via Mercado Pago)',
    category: 'brazil',
    description:
      'QR e copia-e-cola via a tua conta Mercado Pago — activa ao conectar MP.',
    help:
      'Não é um interruptor separado: ao ligares Mercado Pago, o Pix fica disponível nos apps. Usa createPix / createCheckout. Não confundir com o checkout de planos GoCreate Pro (também Mercado Pago, mas da plataforma).',
    icon: 'QrCode',
    connectType: 'oauth',
  },
  {
    id: 'firebase_auth',
    name: 'Login (Firebase Auth)',
    category: 'auth',
    description:
      'Login e-mail e Google nos apps (GoCreateAuth). Liga após Backend Functions (grátis no Free).',
    help:
      'Quando ligar: apps com utilizadores, painéis ou dados por conta. Passos: Configurações do projeto → ativar Backend Functions (grátis) → este cartão passa a “Ligado”. Nos apps usa window.GoCreateAuth. Sem Backend Functions fica bloqueado.',
    icon: 'Shield',
    connectType: 'backend_gate',
  },
  {
    id: 'google_oauth',
    name: 'Login Google',
    category: 'auth',
    description: '1-click Google nos apps. Requer Backend Functions ativas.',
    help:
      'Activa o mesmo fluxo que Login Firebase: Backend Functions ON no projeto. Ideal quando queres “Entrar com Google” sem formulário de password.',
    icon: 'Chrome',
    connectType: 'backend_gate',
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'auth',
    description: 'OAuth para exportar projetos (criar repo + push). Plano Pro.',
    help:
      'Liga quando quiseres exportar o código do projeto para um repositório GitHub. Requer plano Pro. Clica Conectar → autoriza a app GoCreate → depois usa Exportar no editor.',
    icon: 'Github',
    connectType: 'oauth',
    docsUrl: 'https://docs.github.com/en/apps/oauth-apps',
  },
  {
    id: 'firebase_firestore',
    name: 'Cloud Firestore',
    category: 'database',
    description:
      'Base NoSQL nos apps. Disponível depois de Backend Functions (grátis no Free).',
    help:
      'Liga quando o app precisa guardar dados (listas, pedidos, perfis). Ativa Backend Functions no projeto — grátis no Free estilo Base44. Sem isso o cartão fica bloqueado. Nos apps usa as entities / SDK GoCreate.',
    icon: 'Database',
    connectType: 'backend_gate',
  },
  {
    id: 'firebase_storage',
    name: 'Firebase',
    category: 'storage',
    description:
      'Storage e runtime Firebase do projeto. Desbloqueado com Backend Functions.',
    help:
      'Representa o backend Firebase do teu projeto (Auth, Firestore, runtime). Deve estar ON depois de ativares Backend Functions. Não confundir com Cloudinary (uploads do chat GoCreate).',
    icon: 'FolderOpen',
    connectType: 'backend_gate',
  },
  {
    id: 'cloudinary',
    name: 'Cloudinary',
    category: 'storage',
    description: 'Upload de imagens/vídeos no chat e na landing — activo na plataforma.',
    help:
      'Já faz parte da GoCreate (não precisas de API key). Usa quando anexas foto, vídeo ou documento no chat / barra “Crie algo”. A IA analisa o ficheiro. Nos apps gerados que precisem de upload de media, o prompt tipicamente usa esta integração de plataforma.',
    icon: 'Image',
    connectType: 'platform',
  },
  {
    id: 'viacep',
    name: 'ViaCEP',
    category: 'brazil',
    description: 'Autocompletar endereço por CEP — API pública, sempre disponível.',
    help:
      'Sempre ligada. Útil em checkouts e formulários de morada no Brasil: o app consulta o CEP e preenche rua/bairro/cidade. Não precisa de chave.',
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
