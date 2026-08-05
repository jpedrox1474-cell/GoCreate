/**
 * Catálogo de modelos/providers do GoCreate Assistant + persistência.
 * Auto = disponibilidade/fallback (Gemini → Groq → OpenRouter → GitHub),
 * com prioridade leve Groq em turnos chat_only — não é ranking por capacidade.
 */

export const AI_MODEL_STORAGE_KEY = 'gocreate-ai-provider';
export const AI_DISCUSS_STORAGE_KEY = 'gocreate-ai-discuss';

/** @typedef {'auto'|'gemini'|'groq'|'openrouter'|'github'} AiProviderId */

export const AI_MODELS = [
  {
    id: 'auto',
    label: 'Auto',
    description:
      'Automático — tenta o melhor disponível / fallback (Gemini → Groq → OpenRouter → GitHub)',
    premium: false,
    icon: 'auto',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    description: 'Google Gemini Flash',
    premium: false,
    icon: 'gemini',
  },
  {
    id: 'groq',
    label: 'Groq',
    description: 'Llama 3.3 70B — rápido',
    premium: false,
    icon: 'groq',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'GPT-4o mini via OpenRouter',
    premium: false,
    icon: 'openrouter',
  },
  {
    id: 'github',
    label: 'GitHub Models',
    description: 'Inference via GitHub Models',
    premium: true,
    icon: 'github',
    note: 'Usa mais créditos por solicitação',
  },
];

const VALID = new Set(AI_MODELS.map((m) => m.id));

/** @returns {AiProviderId} */
export function getPreferredAiProvider() {
  try {
    const v = String(localStorage.getItem(AI_MODEL_STORAGE_KEY) || 'auto').trim();
    return VALID.has(v) ? /** @type {AiProviderId} */ (v) : 'auto';
  } catch {
    return 'auto';
  }
}

/** @param {AiProviderId|string} id */
export function setPreferredAiProvider(id) {
  const next = VALID.has(id) ? id : 'auto';
  try {
    localStorage.setItem(AI_MODEL_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  return next;
}

export function getAiModelMeta(id) {
  return AI_MODELS.find((m) => m.id === id) || AI_MODELS[0];
}

export function getDiscussMode() {
  try {
    return localStorage.getItem(AI_DISCUSS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDiscussMode(on) {
  try {
    localStorage.setItem(AI_DISCUSS_STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  return Boolean(on);
}
