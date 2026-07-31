/**
 * Detecta intenções de integração a partir do prompt do utilizador.
 * Não bloqueia geração — só sugere chips no Editor.
 */

const RULES = [
  {
    id: 'mercadopago',
    test: /\b(mercado\s*pago|mercadopago|\bpix\b|checkout\s*pro|pagamento|pagamentos|cobran[cç]a|receber\s+via\s+pix)\b/i,
  },
  {
    id: 'stripe',
    test: /\b(stripe|cart[aã]o\s+internacional|visa|mastercard|payment\s*intent|checkout\s*session)\b/i,
  },
  {
    id: 'paypal',
    test: /\b(paypal|pay\s*pal)\b/i,
  },
  {
    id: 'whatsapp',
    test:
      /\b(whatsapp|whats\s*app|whattsapp|\bwpp\b|\bzap\b|zapzap|atendimento\s+no\s+zap|disparo(\s+em\s+massa)?|blast|funil\s+(de\s+)?whats|bot\s+(de\s+)?whats|evolution\s*api|api\s+oficial\s+do\s+whats|confirma[cç][aã]o\s+por\s+(whats|zap|mensagem)|notifica[cç][aã]o\s+no\s+(whats|zap|celular)|campanha\s+de\s+mensagem|envio\s+em\s+massa)\b/i,
  },
  {
    id: 'google',
    test:
      /\b((login|entrar|sign[\s-]?in|auth(entication)?|autentica[cç][aã]o|cadastro|registo|registro)\s+(com\s+|via\s+|using\s+|with\s+)?google|google\s+(login|sign[\s-]?in|auth|oauth|authentication)|firebase\s+auth|oauth\s+google|entrar\s+com\s+o\s+google|login\s+google)\b/i,
  },
  {
    id: 'instagram',
    test: /\b(instagram|\big\b|feed\s+do\s+instagram|stories)\b/i,
  },
  {
    id: 'facebook',
    test: /\b(facebook|\bfb\b|p[aá]gina\s+do\s+facebook)\b/i,
  },
  {
    id: 'youtube',
    test: /\b(youtube|youtu\.be)\b/i,
  },
  {
    id: 'tiktok',
    test: /\b(tiktok|tik\s*tok)\b/i,
  },
];

/** Mapeia ids de sugestão → providerId no status/catalog. */
export const SUGGESTION_TO_PROVIDER = {
  mercadopago: 'mercadopago',
  stripe: 'stripe',
  paypal: 'paypal',
  whatsapp: 'whatsapp_evolution',
  google: 'google_oauth',
  google_oauth: 'google_oauth',
  firebase_auth: 'firebase_auth',
  instagram: 'instagram',
  facebook: 'facebook',
  youtube: 'youtube',
  tiktok: 'tiktok',
};

/** Platform-powered auth: still surface chip so user knows Google is ready for generated apps. */
const PLATFORM_AUTH_SUGGESTIONS = new Set(['google', 'google_oauth', 'firebase_auth']);

/**
 * @param {string} text
 * @returns {string[]} ids canónicos (mercadopago, stripe, …)
 */
export function detectSuggestedIntegrations(text) {
  const raw = String(text || '');
  if (!raw.trim()) return [];
  const found = [];
  for (const rule of RULES) {
    if (rule.test.test(raw)) found.push(rule.id);
  }
  // Pagamento genérico sem provider → Mercado Pago (BR default)
  if (
    !found.includes('mercadopago') &&
    !found.includes('stripe') &&
    !found.includes('paypal') &&
    /\b(checkout|pagamento|pagar|loja\s+online|e-?commerce|carrinho)\b/i.test(raw)
  ) {
    found.push('mercadopago');
  }
  // Feed social genérico
  if (
    !found.includes('instagram') &&
    !found.includes('facebook') &&
    !found.includes('youtube') &&
    !found.includes('tiktok') &&
    /\b(feed\s+social|redes?\s+sociais|social\s+media)\b/i.test(raw)
  ) {
    found.push('instagram', 'whatsapp');
  }
  // Auth genérico com Google implícito no ecossistema GoCreate
  if (
    !found.includes('google') &&
    /\b(login\s+social|social\s+login|entrar\s+com\s+rede\s+social|auth\s+social)\b/i.test(raw)
  ) {
    found.push('google');
  }
  return [...new Set(found)];
}

/**
 * Filtra sugestões já ligadas.
 * @param {string[]} suggested
 * @param {Record<string, { status?: string }>} providers
 */
export function filterUnconnectedSuggestions(suggested, providers = {}) {
  return (suggested || []).filter((id) => {
    if (PLATFORM_AUTH_SUGGESTIONS.has(id)) return true;
    const providerId = SUGGESTION_TO_PROVIDER[id] || id;
    return providers[providerId]?.status !== 'connected';
  });
}

export default detectSuggestedIntegrations;
