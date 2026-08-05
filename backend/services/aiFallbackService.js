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
 *
 * Groq free/on_demand: TPM baixo (ex. llama-3.3-70b ≈ 12k). O “Requested”
 * inclui prompt + max_tokens — por isso truncamos system/user e limitamos
 * max_tokens. Modelos gpt-oss/8b-instant têm TPM ainda menor.
 */

import OpenAI from 'openai';

/** Limites conservadores por provider (chars ≈ tokens*4). */
const PROVIDER_BUDGET = {
  groq: {
    // llama-3.3-70b-versatile TPM ~12k; deixar folga para max_tokens.
    maxSystemChars: 20_000,
    maxUserChars: 6_000,
    maxTokens: 3_500,
  },
  openrouter: {
    maxSystemChars: 100_000,
    maxUserChars: 40_000,
    maxTokens: 8_192,
  },
  github: {
    maxSystemChars: 80_000,
    maxUserChars: 30_000,
    maxTokens: 8_192,
  },
};

// Defaults — overrides via options ou env (OPENROUTER_MODEL, GROQ_MODEL, …)
const DEFAULT_MODELS = {
  // Ainda activo até 16/08/2026; melhor TPM free (~12k) vs gpt-oss (~8k).
  // Override: GROQ_MODEL=openai/gpt-oss-120b (exige prompt mais curto).
  groq: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  openrouter: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
  github: process.env.GITHUB_MODELS_MODEL || 'openai/gpt-4o-mini',
};

/** Cadeia de modelos Groq se o principal falhar (nome inválido / decommission). */
const GROQ_MODEL_FALLBACKS = [
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'llama-3.1-8b-instant',
];

const PROVIDERS = [
  {
    id: 'groq',
    label: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    getKey: () => String(process.env.GROQ_API_KEY || '').trim(),
    getModel: (opts) => opts?.models?.groq || DEFAULT_MODELS.groq,
    getModelFallbacks: (primary) =>
      [primary, ...GROQ_MODEL_FALLBACKS].filter(
        (m, i, arr) => m && arr.indexOf(m) === i
      ),
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    getKey: () => String(process.env.OPENROUTER_API_KEY || '').trim(),
    getModel: (opts) => opts?.models?.openrouter || DEFAULT_MODELS.openrouter,
    defaultHeaders: () => ({
      'HTTP-Referer':
        process.env.OPENROUTER_HTTP_REFERER || 'https://gocreate-app.web.app',
      'X-Title': process.env.OPENROUTER_APP_TITLE || 'GoCreate',
    }),
  },
  {
    id: 'github',
    label: 'GitHub Models',
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

function budgetFor(providerId) {
  return PROVIDER_BUDGET[providerId] || PROVIDER_BUDGET.openrouter;
}

function truncateMiddle(text, maxChars) {
  const s = String(text || '');
  if (!maxChars || s.length <= maxChars) return s;
  const head = Math.floor(maxChars * 0.7);
  const tail = Math.max(0, maxChars - head - 32);
  return `${s.slice(0, head)}\n\n[…truncated…]\n\n${s.slice(-tail)}`;
}

function isPayloadTooLarge(err) {
  const msg = String(err?.message || err || '');
  const status = err?.status || err?.statusCode;
  return (
    status === 413 ||
    /request too large|tpm|tokens per minute|context.?length|too many tokens|maximum context/i.test(
      msg
    )
  );
}

function isJsonFormatUnsupported(err) {
  const msg = String(err?.message || err || '');
  return /response_format|json_object|Failed to validate JSON|json mode|not supported/i.test(
    msg
  );
}

function isModelUnavailable(err) {
  const msg = String(err?.message || err || '');
  const status = err?.status || err?.statusCode;
  return (
    status === 404 ||
    /model_decommissioned|model_not_found|does not exist|invalid model|decommissioned|not available/i.test(
      msg
    )
  );
}

function extractMessageText(completion) {
  const msg = completion?.choices?.[0]?.message;
  if (!msg) return '';
  const content = String(msg.content || '').trim();
  if (content) return content;
  // Alguns modelos reasoning devolvem só `reasoning` se max_tokens for baixo.
  const reasoning = String(msg.reasoning || '').trim();
  return reasoning;
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
 *   preferredProvider?: 'groq'|'openrouter'|'github'|null,
 *   strictProvider?: boolean,
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
  const systemPromptRaw =
    options.systemPrompt ||
    (json
      ? 'You are a helpful assistant. Always respond with a valid JSON object.'
      : 'You are a helpful assistant.');

  const errors = [];
  let anyKey = false;
  const preferred = String(options.preferredProvider || '').trim().toLowerCase();
  const strict = options.strictProvider === true;
  let providersToTry = PROVIDERS;
  if (preferred && PROVIDERS.some((p) => p.id === preferred)) {
    if (strict) {
      providersToTry = PROVIDERS.filter((p) => p.id === preferred);
    } else {
      providersToTry = [
        ...PROVIDERS.filter((p) => p.id === preferred),
        ...PROVIDERS.filter((p) => p.id !== preferred),
      ];
    }
  }

  for (const provider of providersToTry) {
    const apiKey = provider.getKey();
    if (!apiKey) {
      errors.push(`${provider.label}: chave em falta`);
      continue;
    }
    anyKey = true;

    const budget = budgetFor(provider.id);
    const primaryModel = provider.getModel(options);
    const models =
      typeof provider.getModelFallbacks === 'function'
        ? provider.getModelFallbacks(primaryModel)
        : [primaryModel];

    const client = makeClient(provider, apiKey);
    let systemPrompt = truncateMiddle(systemPromptRaw, budget.maxSystemChars);
    let userContent = truncateMiddle(prompt, budget.maxUserChars);
    let maxTokens = Math.min(
      options.maxTokens ?? budget.maxTokens,
      budget.maxTokens
    );

    for (const model of models) {
      const attempts = [
        { jsonMode: json, maxTokens, systemPrompt, userContent, label: 'full' },
      ];
      // 2ª tentativa: payload mais pequeno (TPM Groq)
      attempts.push({
        jsonMode: json,
        maxTokens: Math.min(maxTokens, 2048),
        systemPrompt: truncateMiddle(systemPrompt, Math.floor(budget.maxSystemChars * 0.55)),
        userContent: truncateMiddle(userContent, Math.floor(budget.maxUserChars * 0.7)),
        label: 'compact',
      });
      if (json) {
        attempts.push({
          jsonMode: false,
          maxTokens: Math.min(maxTokens, 2048),
          systemPrompt: truncateMiddle(
            `${systemPrompt}\n\nRespond ONLY with a valid JSON object.`,
            budget.maxSystemChars
          ),
          userContent,
          label: 'json-no-format',
        });
      }

      let modelDead = false;
      for (const attempt of attempts) {
        try {
          const messages = [
            { role: 'system', content: attempt.systemPrompt },
            { role: 'user', content: attempt.userContent },
          ];
          const body = {
            model,
            messages,
            temperature: options.temperature ?? 0.4,
            max_tokens: attempt.maxTokens,
          };
          if (attempt.jsonMode) {
            body.response_format = { type: 'json_object' };
          }

          const completion = await client.chat.completions.create(body);
          const text = extractMessageText(completion);
          if (!text) {
            errors.push(`${provider.label}/${model}: resposta vazia (${attempt.label})`);
            continue;
          }
          if (json) {
            try {
              JSON.parse(text);
            } catch {
              errors.push(`${provider.label}/${model}: JSON inválido (${attempt.label})`);
              continue;
            }
          }
          console.info(
            `[aiFallback] ok provider=${provider.id} model=${model} attempt=${attempt.label}`
          );
          return {
            ok: true,
            text,
            provider: provider.id,
            model: `${provider.id}:${model}`,
            raw: completion,
          };
        } catch (e) {
          const msg = e?.message || String(e);
          console.warn(
            `[aiFallback] ${provider.id}/${model} falhou (${attempt.label}): ${msg}`
          );
          errors.push(`${provider.label}/${model}: ${msg}`);

          if (isModelUnavailable(e)) {
            modelDead = true;
            break;
          }
          if (attempt.jsonMode && isJsonFormatUnsupported(e)) {
            continue; // tenta sem response_format
          }
          if (isPayloadTooLarge(e)) {
            continue; // tenta compact
          }
          // Outros erros: passa ao próximo modelo / provider
          modelDead = true;
          break;
        }
      }
      if (!modelDead) {
        // esgotou attempts sem sucesso — próximo modelo
        continue;
      }
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
  PROVIDER_BUDGET,
};
