/**
 * Catálogo competitivo de integrações GoCreate.
 * Espelha o que Lovable / Bolt / v0 / Base44 / Nova costumam oferecer,
 * com foco BR (Mercado Pago, Pix, ViaCEP, WhatsApp).
 *
 * connectType:
 *   - platform  → já ligado via GoCreate (Firebase Auth, Cloudinary upload)
 *   - oauth     → fluxo OAuth existente (GitHub)
 *   - api_key   → modal com Access Token / API Key (guardado server-side)
 *   - coming_soon → cartão + CTA desabilitado
 */

export const INTEGRATION_CATEGORIES = [
  { id: 'payments', label: 'Pagamentos' },
  { id: 'auth', label: 'Autenticação' },
  { id: 'database', label: 'Base de dados' },
  { id: 'email', label: 'E-mail' },
  { id: 'messaging', label: 'Mensagens' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'storage', label: 'Storage' },
  { id: 'ecommerce', label: 'E-commerce' },
  { id: 'maps', label: 'Mapas' },
  { id: 'brazil', label: 'Brasil' },
];

/** @typedef {'payments'|'auth'|'database'|'email'|'messaging'|'analytics'|'storage'|'ecommerce'|'maps'|'brazil'} CategoryId */
/** @typedef {'platform'|'oauth'|'api_key'|'coming_soon'} ConnectType */

/**
 * @type {Array<{
 *   id: string,
 *   name: string,
 *   category: CategoryId,
 *   description: string,
 *   icon: string,
 *   connectType: ConnectType,
 *   fields?: Array<{ key: string, label: string, placeholder?: string, secret?: boolean, required?: boolean }>,
 *   docsUrl?: string,
 *   competitors?: string[],
 * }>}
 */
export const INTEGRATIONS_CATALOG = [
  // —— Pagamentos ——
  {
    id: 'mercadopago',
    name: 'Mercado Pago',
    category: 'payments',
    description: 'Pix, cartão e Checkout Pro para apps gerados. Trigger real via GoCreatePayments.',
    icon: 'Wallet',
    connectType: 'api_key',
    fields: [
      {
        key: 'accessToken',
        label: 'Access Token',
        placeholder: 'APP_USR-… ou TEST-…',
        secret: true,
        required: true,
      },
      {
        key: 'publicKey',
        label: 'Public Key (opcional)',
        placeholder: 'APP_USR-…',
        secret: false,
        required: false,
      },
    ],
    docsUrl: 'https://www.mercadopago.com.br/developers',
    competitors: ['Lovable', 'Bolt', 'Nova', 'Base44'],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'payments',
    description: 'Checkout Session e PaymentIntents para cartão internacional.',
    icon: 'CreditCard',
    connectType: 'api_key',
    fields: [
      {
        key: 'secretKey',
        label: 'Secret Key',
        placeholder: 'sk_live_… ou sk_test_…',
        secret: true,
        required: true,
      },
      {
        key: 'publishableKey',
        label: 'Publishable Key (opcional)',
        placeholder: 'pk_live_…',
        secret: false,
        required: false,
      },
    ],
    docsUrl: 'https://stripe.com/docs',
    competitors: ['Lovable', 'Bolt', 'v0', 'Nova'],
  },
  {
    id: 'paypal',
    name: 'PayPal',
    category: 'payments',
    description: 'Checkout PayPal e assinaturas.',
    icon: 'CircleDollarSign',
    connectType: 'coming_soon',
    competitors: ['Bolt', 'v0'],
  },
  {
    id: 'pagseguro',
    name: 'PagBank / PagSeguro',
    category: 'payments',
    description: 'Checkout e Pix via PagBank (Brasil).',
    icon: 'Landmark',
    connectType: 'coming_soon',
    competitors: ['Nova', 'Base44'],
  },

  // —— Auth ——
  {
    id: 'firebase_auth',
    name: 'Firebase Auth',
    category: 'auth',
    description: 'Login e-mail, Google e GitHub — núcleo do GoCreate.',
    icon: 'Shield',
    connectType: 'platform',
    competitors: ['Lovable', 'Bolt', 'Firebase'],
  },
  {
    id: 'clerk',
    name: 'Clerk',
    category: 'auth',
    description: 'Auth drop-in com componentes React.',
    icon: 'KeyRound',
    connectType: 'coming_soon',
    competitors: ['v0', 'Bolt'],
  },
  {
    id: 'auth0',
    name: 'Auth0',
    category: 'auth',
    description: 'Identity platform enterprise.',
    icon: 'Lock',
    connectType: 'coming_soon',
    competitors: ['v0'],
  },
  {
    id: 'google_oauth',
    name: 'Google OAuth',
    category: 'auth',
    description: 'Login com Google (via Firebase Auth no GoCreate).',
    icon: 'Chrome',
    connectType: 'platform',
    competitors: ['Lovable', 'Bolt', 'Nova'],
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'auth',
    description: 'OAuth para exportar projetos (criar repo + push).',
    icon: 'Github',
    connectType: 'oauth',
    docsUrl: 'https://docs.github.com/en/apps/oauth-apps',
    competitors: ['Lovable', 'Bolt', 'v0'],
  },

  // —— Database ——
  {
    id: 'firebase_firestore',
    name: 'Cloud Firestore',
    category: 'database',
    description: 'Base NoSQL do GoCreate — projetos, users e publicações.',
    icon: 'Database',
    connectType: 'platform',
    competitors: ['Lovable', 'Firebase'],
  },
  {
    id: 'supabase',
    name: 'Supabase',
    category: 'database',
    description: 'Postgres + Auth + Realtime.',
    icon: 'Layers',
    connectType: 'api_key',
    fields: [
      { key: 'url', label: 'Project URL', placeholder: 'https://xxxx.supabase.co', required: true },
      {
        key: 'anonKey',
        label: 'Anon / public key',
        placeholder: 'eyJ…',
        secret: true,
        required: true,
      },
      {
        key: 'serviceRoleKey',
        label: 'Service role (opcional)',
        placeholder: 'eyJ…',
        secret: true,
        required: false,
      },
    ],
    docsUrl: 'https://supabase.com/docs',
    competitors: ['Lovable', 'Bolt', 'Base44'],
  },
  {
    id: 'neon',
    name: 'Neon',
    category: 'database',
    description: 'Postgres serverless. Credenciais guardadas; queries via backend em breve.',
    icon: 'Server',
    connectType: 'api_key',
    fields: [
      {
        key: 'connectionString',
        label: 'Connection string',
        placeholder: 'postgresql://…',
        secret: true,
        required: true,
      },
    ],
    competitors: ['v0', 'Bolt'],
  },
  {
    id: 'planetscale',
    name: 'PlanetScale',
    category: 'database',
    description: 'MySQL serverless.',
    icon: 'HardDrive',
    connectType: 'coming_soon',
    competitors: ['v0'],
  },

  // —— Email ——
  {
    id: 'resend',
    name: 'Resend',
    category: 'email',
    description: 'E-mail transacional para developers.',
    icon: 'Mail',
    connectType: 'api_key',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 're_…', secret: true, required: true },
      { key: 'fromEmail', label: 'From (opcional)', placeholder: 'ola@seudominio.com', required: false },
    ],
    docsUrl: 'https://resend.com/docs',
    competitors: ['Lovable', 'Bolt', 'Nova'],
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    category: 'email',
    description: 'E-mail em escala (Twilio).',
    icon: 'Send',
    connectType: 'coming_soon',
    competitors: ['Bolt'],
  },
  {
    id: 'mailchimp',
    name: 'Mailchimp',
    category: 'email',
    description: 'Marketing e newsletters.',
    icon: 'Newspaper',
    connectType: 'coming_soon',
    competitors: ['Base44'],
  },

  // —— Messaging ——
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    category: 'messaging',
    description: 'Links wa.me e Cloud API (Meta).',
    icon: 'MessageCircle',
    connectType: 'api_key',
    fields: [
      {
        key: 'phoneNumberId',
        label: 'Phone Number ID',
        placeholder: '1234567890',
        required: false,
      },
      {
        key: 'accessToken',
        label: 'Access Token (Cloud API)',
        placeholder: 'EAAG…',
        secret: true,
        required: false,
      },
      {
        key: 'defaultPhone',
        label: 'Telefone padrão (wa.me)',
        placeholder: '5511999999999',
        required: true,
      },
    ],
    docsUrl: 'https://developers.facebook.com/docs/whatsapp',
    competitors: ['Nova', 'Base44', 'Lovable'],
  },
  {
    id: 'twilio',
    name: 'Twilio',
    category: 'messaging',
    description: 'SMS, voz e WhatsApp via Twilio.',
    icon: 'Phone',
    connectType: 'coming_soon',
    competitors: ['Bolt', 'v0'],
  },
  {
    id: 'telegram',
    name: 'Telegram Bot',
    category: 'messaging',
    description: 'Bots e notificações Telegram.',
    icon: 'SendHorizontal',
    connectType: 'coming_soon',
    competitors: ['Nova'],
  },

  // —— Analytics ——
  {
    id: 'ga4',
    name: 'Google Analytics 4',
    category: 'analytics',
    description: 'Measurement ID para tracking de páginas.',
    icon: 'BarChart3',
    connectType: 'api_key',
    fields: [
      { key: 'measurementId', label: 'Measurement ID', placeholder: 'G-XXXXXXXX', required: true },
    ],
    competitors: ['Lovable', 'Bolt', 'v0'],
  },
  {
    id: 'mixpanel',
    name: 'Mixpanel',
    category: 'analytics',
    description: 'Product analytics e funis.',
    icon: 'Activity',
    connectType: 'coming_soon',
    competitors: ['Bolt'],
  },
  {
    id: 'posthog',
    name: 'PostHog',
    category: 'analytics',
    description: 'Product analytics open-source.',
    icon: 'LineChart',
    connectType: 'api_key',
    fields: [
      { key: 'apiKey', label: 'Project API Key', placeholder: 'phc_…', secret: true, required: true },
      { key: 'host', label: 'Host (opcional)', placeholder: 'https://app.posthog.com', required: false },
    ],
    competitors: ['Lovable', 'v0'],
  },

  // —— Storage ——
  {
    id: 'cloudinary',
    name: 'Cloudinary',
    category: 'storage',
    description: 'Upload de imagens/vídeos no chat — já ativo na plataforma.',
    icon: 'Image',
    connectType: 'platform',
    competitors: ['Lovable', 'Bolt'],
  },
  {
    id: 's3',
    name: 'Amazon S3',
    category: 'storage',
    description: 'Object storage AWS.',
    icon: 'Cloud',
    connectType: 'coming_soon',
    competitors: ['Bolt', 'v0'],
  },
  {
    id: 'firebase_storage',
    name: 'Firebase Storage',
    category: 'storage',
    description: 'Ficheiros no ecossistema Firebase.',
    icon: 'FolderOpen',
    connectType: 'coming_soon',
    competitors: ['Firebase', 'Lovable'],
  },

  // —— E-commerce ——
  {
    id: 'shopify',
    name: 'Shopify',
    category: 'ecommerce',
    description: 'Lojas e Admin API Shopify.',
    icon: 'ShoppingBag',
    connectType: 'coming_soon',
    competitors: ['v0', 'Bolt'],
  },

  // —— Maps ——
  {
    id: 'google_maps',
    name: 'Google Maps',
    category: 'maps',
    description: 'Maps JavaScript API e Places.',
    icon: 'Map',
    connectType: 'api_key',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'AIza…', secret: true, required: true },
    ],
    competitors: ['Lovable', 'Bolt', 'v0'],
  },

  // —— Brasil ——
  {
    id: 'viacep',
    name: 'ViaCEP',
    category: 'brazil',
    description: 'Autocompletar endereço por CEP — API pública, sempre disponível.',
    icon: 'MapPin',
    connectType: 'platform',
    docsUrl: 'https://viacep.com.br',
    competitors: ['Nova', 'Base44'],
  },
  {
    id: 'pix',
    name: 'Pix (via Mercado Pago)',
    category: 'brazil',
    description: 'QR Code e copia-e-cola reais quando MP estiver ligado.',
    icon: 'QrCode',
    connectType: 'platform',
    competitors: ['Nova', 'Base44'],
  },
  {
    id: 'nfe',
    name: 'NF-e',
    category: 'brazil',
    description: 'Emissão de nota fiscal eletrónica (stub).',
    icon: 'FileText',
    connectType: 'coming_soon',
    competitors: ['Nova'],
  },
];

export function getIntegrationById(id) {
  return INTEGRATIONS_CATALOG.find((i) => i.id === id) || null;
}

export function getIntegrationsByCategory(categoryId) {
  return INTEGRATIONS_CATALOG.filter((i) => i.category === categoryId);
}

export default INTEGRATIONS_CATALOG;
