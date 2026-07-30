/**
 * Cliente Gemini (REST) — padrão Promifer / BarberPro.
 * Chave só no backend. Fallback entre modelos free-tier.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Prefer modelos free-tier (Promifer: gemini-flash-latest). 1.5 costuma 404 na v1beta. */
const DEFAULT_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
];

function normalizeModelId(raw) {
  return String(raw || '')
    .trim()
    .replace(/^models\//, '');
}

export function modelCandidates() {
  const configured = normalizeModelId(process.env.GEMINI_MODEL);
  const seen = new Set();
  const out = [];
  for (const m of [configured, ...DEFAULT_MODELS]) {
    const id = normalizeModelId(m);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function getGeminiApiKey() {
  return String(process.env.GEMINI_API_KEY || '').trim();
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((p) => p && typeof p.text === 'string' && p.thought !== true)
    .map((p) => p.text)
    .join('')
    .trim();
}

function isRetryable(status, errMsg) {
  return (
    status === 404 ||
    status === 429 ||
    status === 503 ||
    /not found|quota|rate limit|resource exhausted|unavailable|high demand|overloaded/i.test(
      String(errMsg || '')
    )
  );
}

/**
 * Monta o body generateContent / streamGenerateContent no formato Gemini.
 * messages: [{ role: 'user'|'ai'|'assistant'|'model', text }]
 */
export function buildGeminiBody({ systemPrompt, messages, attachmentUrl, maxOutputTokens = 8192 }) {
  const contents = [];
  const list = Array.isArray(messages) ? messages : [];

  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    const isLast = i === list.length - 1;
    let text = String(m?.text || '').trim();
    if (!text) continue;
    if (isLast && attachmentUrl) {
      text = `${text}\n\n[Arquivo anexado pelo usuário, disponível nesta URL pública: ${attachmentUrl}]`;
    }
    const role =
      m.role === 'ai' || m.role === 'assistant' || m.role === 'model' ? 'model' : 'user';
    contents.push({ role, parts: [{ text }] });
  }

  // Gemini exige que o histórico comece com user
  while (contents.length && contents[0].role !== 'user') {
    contents.shift();
  }

  return {
    systemInstruction: {
      parts: [{ text: String(systemPrompt || '') }],
    },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens,
    },
  };
}

/**
 * Streaming SSE nativo do Gemini (alt=sse). Callback onChunk(textDelta).
 * Tenta cada modelo candidato até um funcionar.
 */
export async function streamGeminiChat({
  systemPrompt,
  messages,
  attachmentUrl,
  onChunk,
  timeoutMs = 120000,
}) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    const err = new Error(
      'GEMINI_API_KEY não configurada no backend. Defina em backend/.env e reinicie o servidor.'
    );
    err.status = 503;
    throw err;
  }

  const body = buildGeminiBody({ systemPrompt, messages, attachmentUrl });
  if (!body.contents.length) {
    const err = new Error('Nenhuma mensagem válida para enviar ao Gemini.');
    err.status = 400;
    throw err;
  }

  const candidates = modelCandidates();
  let lastError = 'Modelo Gemini indisponível.';

  for (const model of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `${GEMINI_API_BASE}/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errMsg = data?.error?.message || `HTTP ${res.status}`;
        lastError = errMsg;
        console.warn(`[gemini] stream falhou model=${model}: ${errMsg}`);
        if (!isRetryable(res.status, errMsg)) {
          const err = new Error(errMsg);
          err.status = res.status;
          throw err;
        }
        continue;
      }

      let full = '';
      const reader = res.body?.getReader();
      if (!reader) {
        lastError = 'Resposta sem body legível.';
        continue;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Eventos SSE: linhas "data: {...}"
        const parts = buffer.split('\n');
        buffer = parts.pop() || '';

        for (const line of parts) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const delta = extractText(json);
            // extractText junta parts; no stream cada evento traz o delta incremental
            // Na API streamGenerateContent, cada chunk traz parts com o pedaço novo.
            const chunkParts = json?.candidates?.[0]?.content?.parts;
            let piece = '';
            if (Array.isArray(chunkParts)) {
              piece = chunkParts
                .filter((p) => p && typeof p.text === 'string' && p.thought !== true)
                .map((p) => p.text)
                .join('');
            } else if (delta) {
              piece = delta;
            }
            if (piece) {
              full += piece;
              if (typeof onChunk === 'function') onChunk(piece);
            }
          } catch {
            // ignora linhas SSE malformadas
          }
        }
      }

      if (!full.trim()) {
        lastError = 'Resposta vazia do Gemini (stream).';
        continue;
      }

      return { ok: true, text: full, model };
    } catch (e) {
      if (e?.status && e.status !== 404 && e.status !== 429 && e.status !== 503) throw e;
      lastError =
        e?.name === 'AbortError' ? 'Timeout na API Gemini.' : String(e?.message || e);
      console.warn(`[gemini] stream exceção model=${model}: ${lastError}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // Fallback não-streaming (mesmo padrão Promifer)
  return generateGeminiChat({ systemPrompt, messages, attachmentUrl, onChunk });
}

/**
 * generateContent sem stream — devolve texto completo (opcionalmente emite onChunk uma vez).
 */
export async function generateGeminiChat({
  systemPrompt,
  messages,
  attachmentUrl,
  onChunk,
  timeoutMs = 90000,
}) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    const err = new Error(
      'GEMINI_API_KEY não configurada no backend. Defina em backend/.env e reinicie o servidor.'
    );
    err.status = 503;
    throw err;
  }

  const body = buildGeminiBody({ systemPrompt, messages, attachmentUrl });
  if (!body.contents.length) {
    const err = new Error('Nenhuma mensagem válida para enviar ao Gemini.');
    err.status = 400;
    throw err;
  }

  const candidates = modelCandidates();
  let lastError = 'Modelo Gemini indisponível.';

  for (const model of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const text = extractText(data);
        if (!text) {
          lastError = 'Resposta vazia do Gemini.';
          continue;
        }
        if (typeof onChunk === 'function') onChunk(text);
        return { ok: true, text, model };
      }
      const errMsg = data?.error?.message || `HTTP ${res.status}`;
      lastError = errMsg;
      console.warn(`[gemini] generate falhou model=${model}: ${errMsg}`);
      if (!isRetryable(res.status, errMsg)) {
        const err = new Error(errMsg);
        err.status = res.status;
        throw err;
      }
    } catch (e) {
      if (e?.status && !isRetryable(e.status, e.message)) throw e;
      lastError =
        e?.name === 'AbortError' ? 'Timeout na API Gemini.' : String(e?.message || e);
    } finally {
      clearTimeout(timer);
    }
  }

  const err = new Error(lastError);
  err.status = 502;
  throw err;
}

export default {
  GEMINI_API_BASE,
  DEFAULT_MODELS,
  modelCandidates,
  getGeminiApiKey,
  buildGeminiBody,
  streamGeminiChat,
  generateGeminiChat,
};
