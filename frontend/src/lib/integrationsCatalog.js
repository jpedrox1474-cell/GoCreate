/**
 * Catálogo competitivo de integrações GoCreate.
 * Espelha o que Lovable / Bolt / v0 / Base44 / Nova costumam oferecer,
 * com foco BR (Mercado Pago, Pix, ViaCEP, WhatsApp).
 *
 * connectType:
 *   - platform  → já ligado via GoCreate (Firebase Auth, Cloudinary upload)
 *   - oauth     → fluxo OAuth (GitHub, Stripe Connect, PayPal, Mercado Pago, YouTube, TikTok)
 *   - api_key   → modal com Access Token / API Key (guardado server-side) — só BYO opcionais
 *   - coming_soon → cartão + CTA desabilitado (só canais sociais filtrados do grid)
 */

export const INTEGRATION_CATEGORIES = [
  { id: 'payments', label: 'Pagamentos' },
  { id: 'auth', label: 'Autenticação' },
  { id: 'database', label: 'Base de dados' },
  { id: 'email', label: 'E-mail' },
  { id: 'messaging', label: 'Mensagens' },
  { id: 'social', label: 'Atendimento & Social' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'storage', label: 'Storage' },
  { id: 'ecommerce', label: 'E-commerce' },
  { id: 'maps', label: 'Mapas' },
  { id: 'brazil', label: 'Brasil' },
];

/** @typedef {'payments'|'auth'|'database'|'email'|'messaging'|'social'|'analytics'|'storage'|'ecommerce'|'maps'|'brazil'} CategoryId */
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
    description:
      'Conectar com Mercado Pago (OAuth) — recebe na tua conta. Billing GoCreate e GoCreatePayments usam a conta ligada.',
    icon: 'Wallet',
    connectType: 'oauth',
    docsUrl: 'https://www.mercadopago.com.br/developers/docs/security/oauth',
    competitors: ['Lovable', 'Bolt', 'Nova', 'Base44'],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'payments',
    description:
      'Checkout e PaymentIntents — Conectar abre Stripe Connect OAuth (sem colar Secret Key).',
    icon: 'CreditCard',
    connectType: 'oauth',
    docsUrl: 'https://stripe.com/docs/connect/oauth',
    competitors: ['Lovable', 'Bolt', 'v0', 'Nova'],
  },
  {
    id: 'paypal',
    name: 'PayPal',
    category: 'payments',
    description: 'Checkout PayPal — Conectar abre login OAuth oficial (sem colar Client Secret). Requer PAYPAL_CLIENT_ID + SECRET no servidor.',
    icon: 'CircleDollarSign',
    connectType: 'oauth',
    docsUrl: 'https://developer.paypal.com/docs/log-in-with-paypal/',
    competitors: ['Bolt', 'v0'],
  },
  {
    id: 'pagseguro',
    name: 'PagBank / PagSeguro',
    category: 'payments',
    description: 'Checkout e Pix via PagBank (Brasil) — token BYO.',
    icon: 'Landmark',
    connectType: 'api_key',
    fields: [
      {
        key: 'token',
        label: 'Token de API',
        placeholder: 'token…',
        secret: true,
        required: true,
      },
      {
        key: 'email',
        label: 'E-mail da conta (opcional, legado)',
        placeholder: 'loja@empresa.com',
        required: false,
      },
    ],
    docsUrl: 'https://developer.pagbank.com.br/',
    competitors: ['Nova', 'Base44'],
  },

  // —— Auth ——
  {
    id: 'firebase_auth',
    name: 'Firebase Auth',
    category: 'auth',
    description:
      'Login e-mail e Google nos apps gerados via window.GoCreateAuth — núcleo Firebase da plataforma (sem colar secrets).',
    icon: 'Shield',
    connectType: 'platform',
    competitors: ['Lovable', 'Bolt', 'Firebase'],
  },
  {
    id: 'clerk',
    name: 'Clerk',
    category: 'auth',
    description: 'Auth drop-in com componentes React — Publishable + Secret Key.',
    icon: 'KeyRound',
    connectType: 'api_key',
    fields: [
      {
        key: 'publishableKey',
        label: 'Publishable Key',
        placeholder: 'pk_test_…',
        required: true,
      },
      {
        key: 'secretKey',
        label: 'Secret Key',
        placeholder: 'sk_test_…',
        secret: true,
        required: true,
      },
      {
        key: 'domain',
        label: 'Frontend API domain (opcional)',
        placeholder: 'clerk.seudominio.com',
        required: false,
      },
    ],
    docsUrl: 'https://dashboard.clerk.com/',
    competitors: ['v0', 'Bolt'],
  },
  {
    id: 'auth0',
    name: 'Auth0',
    category: 'auth',
    description: 'Identity platform — Domain + Client ID/Secret.',
    icon: 'Lock',
    connectType: 'api_key',
    fields: [
      {
        key: 'domain',
        label: 'Domain',
        placeholder: 'teu-tenant.auth0.com',
        required: true,
      },
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: '…',
        required: true,
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: '…',
        secret: true,
        required: true,
      },
    ],
    docsUrl: 'https://manage.auth0.com/',
    competitors: ['v0'],
  },
  {
    id: 'google_oauth',
    name: 'Login Google',
    category: 'auth',
    description:
      '1-click: abre o login Google oficial (Firebase). Nos apps gerados usa window.GoCreateAuth.signInWithGoogle() — sem Client Secret.',
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
    description: 'Postgres + Auth + Realtime — URL e keys BYO.',
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
    description: 'Postgres serverless — connection string BYO.',
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
    docsUrl: 'https://neon.tech/docs',
    competitors: ['v0', 'Bolt'],
  },
  {
    id: 'planetscale',
    name: 'PlanetScale',
    category: 'database',
    description: 'MySQL serverless — connection string BYO.',
    icon: 'HardDrive',
    connectType: 'api_key',
    fields: [
      {
        key: 'connectionString',
        label: 'Connection string',
        placeholder: 'mysql://…',
        secret: true,
        required: true,
      },
    ],
    docsUrl: 'https://planetscale.com/docs',
    competitors: ['v0'],
  },

  // —— Email ——
  {
    id: 'resend',
    name: 'Resend',
    category: 'email',
    description: 'E-mail transacional — API Key BYO.',
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
    description: 'E-mail em escala (Twilio) — API Key BYO.',
    icon: 'Send',
    connectType: 'api_key',
    fields: [
      {
        key: 'apiKey',
        label: 'API Key',
        placeholder: 'SG.…',
        secret: true,
        required: true,
      },
      {
        key: 'fromEmail',
        label: 'From (opcional)',
        placeholder: 'ola@seudominio.com',
        required: false,
      },
    ],
    docsUrl: 'https://app.sendgrid.com/settings/api_keys',
    competitors: ['Bolt'],
  },
  {
    id: 'mailchimp',
    name: 'Mailchimp',
    category: 'email',
    description: 'Marketing e newsletters — API Key + datacenter.',
    icon: 'Newspaper',
    connectType: 'api_key',
    fields: [
      {
        key: 'apiKey',
        label: 'API Key',
        placeholder: 'xxxx-us21',
        secret: true,
        required: true,
      },
      {
        key: 'serverPrefix',
        label: 'Server prefix (opcional)',
        placeholder: 'us21',
        required: false,
      },
    ],
    docsUrl: 'https://mailchimp.com/developer/',
    competitors: ['Base44'],
  },

  // —— Messaging / Social (ver também secção premium Canais) ——
  {
    id: 'whatsapp',
    name: 'WhatsApp (wa.me)',
    category: 'messaging',
    description:
      'Telefone padrão para links wa.me. Para QR WhatsApp, usa a secção Canais de Atendimento & Social.',
    icon: 'MessageCircle',
    connectType: 'api_key',
    fields: [
      {
        key: 'defaultPhone',
        label: 'Telefone padrão (wa.me)',
        placeholder: '5511999999999',
        required: true,
      },
      {
        key: 'phoneNumberId',
        label: 'Phone Number ID (Cloud API, opcional)',
        placeholder: '1234567890',
        required: false,
      },
      {
        key: 'accessToken',
        label: 'Access Token Cloud API (opcional)',
        placeholder: 'EAAG…',
        secret: true,
        required: false,
      },
    ],
    docsUrl: 'https://developers.facebook.com/docs/whatsapp',
    competitors: ['Nova', 'Base44', 'Lovable'],
  },
  {
    id: 'whatsapp_evolution',
    name: 'WhatsApp',
    category: 'social',
    description: 'QR Code WhatsApp — secção premium Canais.',
    icon: 'MessageCircle',
    connectType: 'coming_soon',
    competitors: [],
  },
  {
    id: 'instagram',
    name: 'Instagram',
    category: 'social',
    description: 'Conta profissional via Meta — secção premium Canais.',
    icon: 'Image',
    connectType: 'coming_soon',
    competitors: [],
  },
  {
    id: 'facebook',
    name: 'Facebook',
    category: 'social',
    description: 'Conta profissional via Meta — secção premium Canais.',
    icon: 'Share2',
    connectType: 'coming_soon',
    competitors: [],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    category: 'social',
    description: 'Canal YouTube via Google OAuth — secção premium Canais.',
    icon: 'Youtube',
    connectType: 'coming_soon',
    competitors: [],
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    category: 'social',
    description: 'Conta TikTok via OAuth — secção premium Canais.',
    icon: 'Video',
    connectType: 'coming_soon',
    competitors: [],
  },
  {
    id: 'twilio',
    name: 'Twilio',
    category: 'messaging',
    description: 'SMS, voz e WhatsApp — Account SID + Auth Token + From.',
    icon: 'Phone',
    connectType: 'api_key',
    fields: [
      {
        key: 'accountSid',
        label: 'Account SID',
        placeholder: 'ACxxx…',
        required: true,
      },
      {
        key: 'authToken',
        label: 'Auth Token',
        placeholder: '…',
        secret: true,
        required: true,
      },
      {
        key: 'fromNumber',
        label: 'From number (E.164)',
        placeholder: '+15551234567',
        required: true,
      },
    ],
    docsUrl: 'https://console.twilio.com/',
    competitors: ['Bolt', 'v0'],
  },
  {
    id: 'telegram',
    name: 'Telegram Bot',
    category: 'messaging',
    description: 'Bot token BYO — webhook stub no backend.',
    icon: 'SendHorizontal',
    connectType: 'api_key',
    fields: [
      {
        key: 'botToken',
        label: 'Bot Token',
        placeholder: '123456:ABC-DEF…',
        secret: true,
        required: true,
      },
      {
        key: 'webhookUrl',
        label: 'Webhook URL (opcional)',
        placeholder: 'https://teu-app.com/telegram/webhook',
        required: false,
      },
    ],
    docsUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
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
    docsUrl: 'https://analytics.google.com/',
    competitors: ['Lovable', 'Bolt', 'v0'],
  },
  {
    id: 'mixpanel',
    name: 'Mixpanel',
    category: 'analytics',
    description: 'Product analytics — Project Token BYO.',
    icon: 'Activity',
    connectType: 'api_key',
    fields: [
      {
        key: 'projectToken',
        label: 'Project Token',
        placeholder: '…',
        secret: true,
        required: true,
      },
      {
        key: 'apiSecret',
        label: 'API Secret (opcional)',
        placeholder: '…',
        secret: true,
        required: false,
      },
    ],
    docsUrl: 'https://mixpanel.com/project/',
    competitors: ['Bolt'],
  },
  {
    id: 'posthog',
    name: 'PostHog',
    category: 'analytics',
    description: 'Product analytics open-source — Project API Key BYO.',
    icon: 'LineChart',
    connectType: 'api_key',
    fields: [
      { key: 'apiKey', label: 'Project API Key', placeholder: 'phc_…', secret: true, required: true },
      { key: 'host', label: 'Host (opcional)', placeholder: 'https://app.posthog.com', required: false },
    ],
    docsUrl: 'https://posthog.com/docs',
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
    description: 'Object storage AWS — Access Key + Secret + bucket.',
    icon: 'Cloud',
    connectType: 'api_key',
    fields: [
      {
        key: 'accessKeyId',
        label: 'Access Key ID',
        placeholder: 'AKIA…',
        required: true,
      },
      {
        key: 'secretAccessKey',
        label: 'Secret Access Key',
        placeholder: '…',
        secret: true,
        required: true,
      },
      {
        key: 'bucket',
        label: 'Bucket',
        placeholder: 'meu-bucket',
        required: true,
      },
      {
        key: 'region',
        label: 'Region (opcional)',
        placeholder: 'us-east-1',
        required: false,
      },
    ],
    docsUrl: 'https://console.aws.amazon.com/s3/',
    competitors: ['Bolt', 'v0'],
  },
  {
    id: 'firebase_storage',
    name: 'Firebase Storage',
    category: 'storage',
    description: 'Ficheiros no ecossistema Firebase — já disponível na plataforma.',
    icon: 'FolderOpen',
    connectType: 'platform',
    competitors: ['Firebase', 'Lovable'],
  },

  // —— E-commerce ——
  {
    id: 'shopify',
    name: 'Shopify',
    category: 'ecommerce',
    description: 'Admin API — shop domain + access token BYO.',
    icon: 'ShoppingBag',
    connectType: 'api_key',
    fields: [
      {
        key: 'shop',
        label: 'Shop domain',
        placeholder: 'loja.myshopify.com',
        required: true,
      },
      {
        key: 'accessToken',
        label: 'Admin API access token',
        placeholder: 'shpat_…',
        secret: true,
        required: true,
      },
    ],
    docsUrl: 'https://shopify.dev/docs/api/admin',
    competitors: ['v0', 'Bolt'],
  },

  // —— Maps ——
  {
    id: 'google_maps',
    name: 'Google Maps',
    category: 'maps',
    description: 'Maps JavaScript API e Places — API Key BYO.',
    icon: 'Map',
    connectType: 'api_key',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'AIza…', secret: true, required: true },
    ],
    docsUrl: 'https://console.cloud.google.com/google/maps-apis',
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
    description: 'QR Code e copia-e-cola reais via Mercado Pago da plataforma — sem pedir chave ao utilizador.',
    icon: 'QrCode',
    connectType: 'platform',
    competitors: ['Nova', 'Base44'],
  },
  {
    id: 'nfe',
    name: 'NF-e',
    category: 'brazil',
    description: 'Credenciais fiscais BYO (Focus NFe / similar) — emissão stub.',
    icon: 'FileText',
    connectType: 'api_key',
    fields: [
      {
        key: 'provider',
        label: 'Provedor (focus|manual)',
        placeholder: 'focus',
        required: false,
      },
      {
        key: 'apiToken',
        label: 'API Token',
        placeholder: 'token…',
        secret: true,
        required: true,
      },
      {
        key: 'cnpj',
        label: 'CNPJ (opcional)',
        placeholder: '00.000.000/0001-00',
        required: false,
      },
      {
        key: 'environment',
        label: 'Ambiente (homologacao|producao)',
        placeholder: 'homologacao',
        required: false,
      },
    ],
    docsUrl: 'https://focusnfe.com.br/doc/',
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
