/**
 * System prompt dinâmico: base GoCreate + credenciais/IDs das integrações
 * do utilizador autenticado (injectados automaticamente em cada /api/chat).
 *
 * Segurança:
 * - Só o uid autenticado alimenta este bloco (chat.js → loadUserIntegrationsForPrompt).
 * - Preferir proxies GoCreate autenticados; tokens Graph só para preview deste user.
 * - Nunca logar o prompt completo (contém secrets).
 */

import { GOCREATE_SYSTEM_PROMPT } from './systemPrompt.js';

/**
 * @param {Record<string, object>} userIntegrations
 * @returns {string}
 */
export function buildDynamicSystemPrompt(userIntegrations = {}) {
  return GOCREATE_SYSTEM_PROMPT + buildIntegrationsAddonFromObject(userIntegrations);
}

/**
 * Complemento de integrações a partir do objecto rico (com tokens/IDs).
 * @param {Record<string, object>} userIntegrations
 */
export function buildIntegrationsAddonFromObject(userIntegrations = {}) {
  const keys = Object.keys(userIntegrations || {}).filter(
    (k) => userIntegrations[k]?.connected
  );

  if (!keys.length) {
    return `

## Integrações do utilizador
Nenhuma integração social/pagamento BYO ligada ainda.
- Mercado Pago / Pix: SEMPRE \`window.GoCreatePayments.createPix\` (nunca hardcode tokens MP; nunca alert() para erros; NÃO force upgrade Pro no checkout do app — plataforma/sandbox OK).
- Persistência: use \`window.GoCreateData\` / \`POST /api/projects/:id/data\`; se BACKEND_REQUIRED, CTA para ativar Backend no GoCreate (não Pro paywall).
- Login Google / Firebase Auth: SEMPRE use \`window.GoCreateAuth.signInWithGoogle()\` (plataforma) — NÃO peça Client Secret.
- WhatsApp: use wa.me + CTA para ligar em Integrações → Canais — nunca whatsapp-web.js no preview.
- Instagram / Facebook / YouTube / TikTok: se o pedido precisar deles, gere UI + CTA “Ligue em Integrações”; NÃO invente tokens.`;
  }

  const lines = [];
  lines.push(`
## Integrações ATIVAS deste utilizador (OBRIGATÓRIO — injectar automaticamente)

O utilizador JÁ validou estas integrações no GoCreate. Em QUALQUER código gerado que use estes canais:
- NÃO peça ao utilizador para colar tokens, instance IDs ou API keys — use os valores abaixo.
- Prefira proxies autenticados GoCreate (\`/api/integrations/...\` + \`projectId\` / Bearer) quando existirem.
- IDs públicos (instance, pageId, channelId, openId) PODEM e DEVEM ir no código gerado.
- Access tokens Graph/OAuth: pode embutir no código do preview DESTE utilizador para demos (feeds, etc.), mas comente que em produção o ideal é proxy server-side. NUNCA invente outros tokens.
- NÃO uses whatsapp-web.js, Baileys ou Puppeteer no Sandpack.
`);

  const wa = userIntegrations.whatsapp;
  if (wa?.connected) {
    lines.push(`
### WhatsApp
- Ligado: sim (fonte: ${wa.source || 'evolution'})
- Instance ID / nome Evolution: \`${wa.instanceId || '(ver bridge)'}\`
- Proxy GoCreate: \`${wa.proxyPath || '/api/integrations/whatsapp'}\` (QR/connection — premium/owner)
- Na UI gerada: CTAs wa.me, dashboard de funil, e mencione instance \`${wa.instanceId || ''}\` quando relevante.
- Envio real: preferir bridge/proxy GoCreate (credenciais Evolution ficam no servidor). NÃO embuta EVOLUTION_API_KEY no client.
- Se o utilizador pedir explicitamente Evolution URL+key no código: avise que a key é de servidor e use o proxy; só então documente variáveis de ambiente no lado server, nunca no Sandpack.`);
  }

  const waCloud = userIntegrations.whatsappCloud;
  if (waCloud?.connected) {
    lines.push(`
### WhatsApp Cloud API (BYO)
- Telefone padrão: \`${waCloud.defaultPhone || ''}\`
- phoneNumberId: \`${waCloud.phoneNumberId || ''}\`
${
  waCloud.accessToken
    ? `- accessToken (só deste user, preferir proxy): \`${waCloud.accessToken}\``
    : '- Sem Cloud API token — use wa.me com o telefone padrão.'
}`);
  }

  const ig = userIntegrations.instagram;
  if (ig?.connected) {
    lines.push(`
### Instagram
- username: \`${ig.username || ''}\`
- accountId (IG Business): \`${ig.accountId || ''}\`
- pageId: \`${ig.pageId || ''}\`
${
  ig.accessToken
    ? `- accessToken (Page token Meta — embutir no preview deste user para Graph): \`${ig.accessToken}\`
- Exemplo feed: \`GET https://graph.facebook.com/v21.0/${ig.accountId || '{ig-user-id}'}/media?fields=id,caption,media_url,permalink,thumbnail_url,timestamp&access_token=...\`
- Prefira depois mover para um helper server-side; no preview Sandpack o token acima é aceite.`
    : '- Sem token em secrets — mostre UI + CTA para reconectar Meta em Integrações.'
}`);
  }

  const fb = userIntegrations.facebook;
  if (fb?.connected) {
    lines.push(`
### Facebook Page
- pageName: \`${fb.pageName || ''}\`
- pageId: \`${fb.pageId || ''}\`
${
  fb.accessToken
    ? `- accessToken: \`${fb.accessToken}\`
- Ex.: \`GET https://graph.facebook.com/v21.0/${fb.pageId || '{page-id}'}?fields=name,fan_count,picture&access_token=...\``
    : '- Sem token — CTA reconectar Meta.'
}`);
  }

  const yt = userIntegrations.youtube;
  if (yt?.connected) {
    lines.push(`
### YouTube
- channelId: \`${yt.channelId || ''}\`
- channelTitle: \`${yt.channelTitle || ''}\`
${
  yt.accessToken
    ? `- accessToken OAuth: \`${yt.accessToken}\`
- Use YouTube Data API v3 com este token (ex. playlistItems / search do canal). channelId público deve aparecer na UI.`
    : '- Sem access token — use channelId público + embeds youtube.com se possível, ou CTA reconectar.'
}`);
  }

  const tt = userIntegrations.tiktok;
  if (tt?.connected) {
    lines.push(`
### TikTok
- username: \`${tt.username || ''}\`
- openId: \`${tt.openId || ''}\`
${
  tt.accessToken
    ? `- accessToken: \`${tt.accessToken}\`
- Use na UI/demo com openId; respeite scopes do token TikTok.`
    : '- Sem token — mostre perfil/username + CTA reconectar.'
}`);
  }

  const mp = userIntegrations.mercadopago;
  if (mp?.connected) {
    lines.push(`
### Mercado Pago / Pix
- Ligado (${mp.platform ? 'plataforma GoCreate' : 'conta do utilizador'}).
- SEMPRE use \`window.GoCreatePayments.createPix\` / \`createCheckout\` ou fetch \`/api/integrations/mercadopago/public-create-payment\` com \`projectId\`.
- NÃO invente nem cole Access Token / Public Key MP (APP_USR / TEST) em App.jsx — o bridge já usa o token do servidor.
- NÃO use alert() em erros de Pix — toast/banner na UI do app.`);
  }

  const googleAuth = userIntegrations.googleAuth || userIntegrations.firebaseAuth;
  if (googleAuth?.connected) {
    lines.push(`
### Login Google / Firebase Auth (plataforma)
- Ligado via GoCreate (Firebase Google provider) — SEM Client Secret do utilizador.
- SEMPRE use \`window.GoCreateAuth.signInWithGoogle()\`, \`onAuthStateChanged\`, \`signOut\`, \`getCurrentUser\`.
- Em preview Sandpack (iframe), GoCreateAuth faz bridge para a janela pai — NÃO uses Firebase Auth npm / signInWithPopup no iframe.
- Erros: mostra mensagem amigável em PT (err.message do bridge).
- NÃO peça nem invente OAuth Client ID/Secret; NÃO embuta firebaseConfig manualmente.`);
  } else {
    lines.push(`
### Login Google / Firebase Auth
- Mesmo sem BYO: a plataforma injeta \`window.GoCreateAuth\` — use-o para qualquer “login com Google” (bridge iframe → parent).`);
  }

  if (userIntegrations.stripe?.connected) {
    lines.push(`
### Stripe
- Ligado (mode: ${userIntegrations.stripe.mode || 'n/d'}).
- Preferir endpoints GoCreate \`/api/integrations/stripe/...\` autenticados; não embuta secretKey no client.`);
  }

  lines.push(`
## Checklist ao gerar artefactos
1. Se o app fala de WhatsApp/IG/FB/YT/TikTok/Pix/Google login e a secção acima tem a integração → USE os IDs/tokens/bridges listados automaticamente.
2. Não diga “cole sua API key” / Client Secret para integrações já ligadas ou de plataforma.
3. Runtime Sandpack: React + Tailwind; pagamentos via GoCreatePayments; login Google via GoCreateAuth; WhatsApp sem libs Node.`);

  return lines.join('\n');
}

/**
 * Compat: addon a partir de lista de IDs (sem tokens) OU objecto rico.
 * Preferir buildDynamicSystemPrompt(userIntegrations).
 * @param {string[]|Record<string, object>} connectedIdsOrIntegrations
 */
export function buildIntegrationsPromptAddon(connectedIdsOrIntegrations = []) {
  if (
    connectedIdsOrIntegrations &&
    !Array.isArray(connectedIdsOrIntegrations) &&
    typeof connectedIdsOrIntegrations === 'object'
  ) {
    return buildIntegrationsAddonFromObject(connectedIdsOrIntegrations);
  }
  return buildIntegrationsPromptAddonFromIds(connectedIdsOrIntegrations || []);
}

/**
 * Compat: addon a partir de lista de IDs (sem tokens).
 * @param {string[]} connectedIds
 */
export function buildIntegrationsPromptAddonFromIds(connectedIds = []) {
  if (!connectedIds?.length) {
    return buildIntegrationsAddonFromObject({});
  }
  const obj = {};
  for (const id of connectedIds) {
    if (id === 'whatsapp_evolution' || id === 'whatsapp') {
      obj.whatsapp = { connected: true, source: id === 'whatsapp' ? 'cloud_api' : 'evolution' };
    } else if (id === 'mercadopago' || id === 'pix') {
      obj.mercadopago = { connected: true, platform: true, source: 'platform' };
    } else if (id === 'instagram') {
      obj.instagram = { connected: true };
    } else if (id === 'facebook') {
      obj.facebook = { connected: true };
    } else if (id === 'youtube') {
      obj.youtube = { connected: true };
    } else if (id === 'tiktok') {
      obj.tiktok = { connected: true };
    } else if (id === 'stripe') {
      obj.stripe = { connected: true };
    } else if (id === 'google' || id === 'google_oauth' || id === 'firebase_auth') {
      obj.googleAuth = { connected: true, source: 'platform' };
      obj.firebaseAuth = { connected: true, source: 'platform' };
    }
  }
  return buildIntegrationsAddonFromObject(obj);
}

export default buildDynamicSystemPrompt;
