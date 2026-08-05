/**
 * Fallback multi-provider (OpenAI-compatible) para JSON/texto.
 * Ordem: Groq → OpenRouter → GitHub Models.
 *
 * Env (deixar vazias até o utilizador preencher):
 *   GROQ_API_KEY
 *   OPENROUTER_API_KEY
 *   GITHUB_MODELS_TOKEN  (preferido) ou GITHUB_TOKEN (PAT com models:read)
 *
 * BaseURLs oficiais:
 *   Groq:        https://api.groq.com/openai/v1
 *   OpenRouter:  https://openrouter.ai/api/v1
 *   GitHub:      https://models.github.ai/inference
 *     (legado Azure: https://models.inference.ai.azure.com — SDK OpenAI usa models.github.ai)
 *     Nota (2026-07): GitHub Models foi anunciado como retired; o client permanece
 *     para quem ainda tiver acesso / até o endpoint falhar de forma clara.
 */

import OpenAI from 'openai';

// Defaults — overrides via options ou env (OPENROUTER_MODEL, GROQ_MODEL, …)
const DEFAULT_MODELS = {
  // Groq free: llama-3.3-70b-versatile (docs Groq)
  groq: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  // OpenRouter: gpt-4o-mini é estável com chave paga; alternativas:
  //   openrouter/free | openrouter/auto | openai/gpt-4o
  openrouter: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
  // GitHub Models catalog: openai/gpt-4o-mini (ou openai/gpt-4o)
  github: process.env.GITHUB_MODELS_MODEL || 'openai/gpt-4o-mini',
};

const PROVIDERS = [
  {
    id: 'groq',
    label: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    getKey: () => String(process.env.GROQ_API_KEY || '').trim(),
    getModel: (opts) => opts?.models?.groq || DEFAULT_MODELS.groq,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    getKey: () => String(process.env.OPENROUTER_API_KEY || '').trim(),
    getModel: (opts) => opts?.models?.openrouter || DEFAULT_MODELS.openrouter,
    // OpenRouter ranking headers (docs: HTTP-Referer + X-Title)
    defaultHeaders: () => ({
      'HTTP-Referer':
        process.env.OPENROUTER_HTTP_REFERER || 'https://gocreate-app.web.app',
      'X-Title': process.env.OPENROUTER_APP_TITLE || 'GoCreate',
    }),
  },
  {
    id: 'github',
    label: 'GitHub Models',
    // OpenAI-compatible base (SDK acrescenta /chat/completions)
    baseURL: 'https://models.github.ai/inference',
    getKey: () =>
      String(
        process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || ''
      ).trim(),
    getModel: (opts) => opts?.models?.github || DEFAULT_MODELS.github,
  },
];

function makeClient(provider, apiKey) {
  const opts = {
    apiKey,
    baseURL: provider.baseURL,
  };
  if (typeof provider.defaultHeaders === 'function') {
    opts.defaultHeaders = provider.defaultHeaders();
  }
  return new OpenAI(opts);
}

/** True se pelo menos uma chave de fallback estiver definida. */
export function hasAiFallbackKeys() {
  return PROVIDERS.some((p) => Boolean(p.getKey()));
}

export function listConfiguredFallbackProviders() {
  return PROVIDERS.filter((p) => Boolean(p.getKey())).map((p) => p.id);
}

/**
 * Completação com fallback em cadeia.
 * @param {string} userPrompt
 * @param {{
 *   systemPrompt?: string,
 *   json?: boolean,
 *   temperature?: number,
 *   maxTokens?: number,
 *   models?: { groq?: string, openrouter?: string, github?: string },
 * }} [options]
 * @returns {Promise<{ ok: true, text: string, provider: string, model: string, raw: object }>}
 */
export async function completeWithFallback(userPrompt, options = {}) {
  const prompt = String(userPrompt || '').trim();
  if (!prompt) {
    const err = new Error('Prompt vazio para AI fallback.');
    err.status = 400;
    throw err;
  }

  const json = options.json === true;
  const systemPrompt =
    options.systemPrompt ||
    (json
      ? 'You are a helpful assistant. Always respond with a valid JSON object.'
      : 'You are a helpful assistant.');

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ];

  const errors = [];
  let anyKey = false;

  for (const provider of PROVIDERS) {
    const apiKey = provider.getKey();
    if (!apiKey) {
      errors.push(`${provider.label}: chave em falta`);
      continue;
    }
    anyKey = true;
    const model = provider.getModel(options);
    try {
      const client = makeClient(provider, apiKey);
      const body = {
        model,
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 8192,
      };
      if (json) {
        body.response_format = { type: 'json_object' };
      }

      const completion = await client.chat.completions.create(body);
      const text = String(completion?.choices?.[0]?.message?.content || '').trim();
      if (!text) {
        errors.push(`${provider.label}/${model}: resposta vazia`);
        continue;
      }
      if (json) {
        try {
          JSON.parse(text);
        } catch {
          errors.push(`${provider.label}/${model}: JSON inválido`);
          continue;
        }
      }
      console.info(`[aiFallback] ok provider=${provider.id} model=${model}`);
      return {
        ok: true,
        text,
        provider: provider.id,
        model: `${provider.id}:${model}`,
        raw: completion,
      };
    } catch (e) {
      const msg = e?.message || String(e);
      console.warn(`[aiFallback] ${provider.id} falhou: ${msg}`);
      errors.push(`${provider.label}/${model}: ${msg}`);
    }
  }

  const err = new Error(
    anyKey
      ? `Todos os providers de AI fallback falharam. ${errors.join(' | ')}`
      : 'Nenhuma chave de AI fallback configurada. Defina GROQ_API_KEY, OPENROUTER_API_KEY e/ou GITHUB_MODELS_TOKEN (ou GITHUB_TOKEN) em backend/.env e functions/.env.'
  );
  err.status = anyKey ? 502 : 503;
  err.details = errors;
  throw err;
}

/**
 * Força response_format json_object e valida JSON na resposta.
 */
export async function completeJsonWithFallback(userPrompt, options = {}) {
  return completeWithFallback(userPrompt, { ...options, json: true });
}

/**
 * Texto livre (chat / artefato) — mesma cadeia Groq → OpenRouter → GitHub.
 */
export async function completeTextWithFallback(userPrompt, options = {}) {
  return completeWithFallback(userPrompt, { ...options, json: false });
}

export default {
  hasAiFallbackKeys,
  listConfiguredFallbackProviders,
  completeWithFallback,
  completeJsonWithFallback,
  completeTextWithFallback,
  DEFAULT_MODELS,
};
