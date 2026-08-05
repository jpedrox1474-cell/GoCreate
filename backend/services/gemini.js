/**
 * Cliente Gemini (REST) — padrão Promifer / BarberPro.
 * Chave só no backend. Fallback entre modelos free-tier.
 * Anexos Cloudinary: multimodal (inlineData / Files API) + URL no texto.
 * Se Gemini falhar / sem chave: aiFallbackService (Groq → OpenRouter → GitHub).
 */

import {
  hasAiFallbackKeys,
  completeTextWithFallback,
  listConfiguredFallbackProviders,
} from './aiFallbackService.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_FILES_BASE = 'https://generativelanguage.googleapis.com';

/** Prefer modelos free-tier (Promifer: gemini-flash-latest). 1.5 costuma 404 na v1beta. */
const DEFAULT_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
];

/** Inline base64 até este tamanho; vídeos maiores vão para Files API. */
const INLINE_MAX_BYTES = 12 * 1024 * 1024;

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

/** True se Gemini ou algum provider de fallback tiver chave. */
export function hasAnyAiProvider() {
  return Boolean(getGeminiApiKey()) || hasAiFallbackKeys();
}

/** Providers com chave configurada (para o picker Auto). */
export function listConfiguredAiProviders() {
  const out = [];
  if (getGeminiApiKey()) out.push('gemini');
  for (const id of listConfiguredFallbackProviders()) out.push(id);
  return out;
}

/**
 * Converte histórico GoCreate → prompt texto para providers OpenAI-compatible.
 */
function buildFallbackUserPrompt(systemPrompt, messages, attachmentUrl) {
  const lines = [];
  for (const m of messages || []) {
    const role =
      m.role === 'ai' || m.role === 'assistant' || m.role === 'model'
        ? 'Assistant'
        : 'User';
    const text = String(m.text || m.content || '').trim();
    if (text) lines.push(`${role}:\n${text}`);
  }
  if (attachmentUrl) {
    lines.push(`User attachment URL (fetch/describe if useful):\n${attachmentUrl}`);
  }
  return lines.join('\n\n') || 'Continue.';
}

async function tryOpenAiFallbackChat({
  systemPrompt,
  messages,
  attachmentUrl,
  onChunk,
  preferredProvider = null,
  strictProvider = false,
}) {
  if (!hasAiFallbackKeys()) return null;
  console.warn(
    `[gemini] a tentar AI fallback (Groq → OpenRouter → GitHub)${
      preferredProvider ? ` preferido=${preferredProvider}` : ''
    }…`
  );
  const result = await completeTextWithFallback(
    buildFallbackUserPrompt(systemPrompt, messages, attachmentUrl),
    {
      systemPrompt: String(systemPrompt || '').slice(0, 120000) || undefined,
      temperature: 0.5,
      maxTokens: 8192,
      preferredProvider: preferredProvider || undefined,
      strictProvider: Boolean(strictProvider),
    }
  );
  if (typeof onChunk === 'function' && result.text) onChunk(result.text);
  return { ok: true, text: result.text, model: result.model, provider: result.provider };
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

function guessMimeFromUrl(url = '') {
  const path = String(url).split('?')[0].toLowerCase();
  if (/\.(png)$/.test(path)) return 'image/png';
  if (/\.(jpe?g)$/.test(path)) return 'image/jpeg';
  if (/\.(gif)$/.test(path)) return 'image/gif';
  if (/\.(webp)$/.test(path)) return 'image/webp';
  if (/\.(svg)$/.test(path)) return 'image/svg+xml';
  if (/\.(mp4)$/.test(path)) return 'video/mp4';
  if (/\.(webm)$/.test(path)) return 'video/webm';
  if (/\.(mov)$/.test(path)) return 'video/quicktime';
  if (/\.(pdf)$/.test(path)) return 'application/pdf';
  // Cloudinary: /image/upload/… /video/upload/…
  if (/\/image\/upload\//.test(path)) return 'image/jpeg';
  if (/\/video\/upload\//.test(path)) return 'video/mp4';
  return '';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Upload resumable para Gemini Files API (vídeos / ficheiros maiores).
 */
async function uploadToGeminiFiles({ buffer, mimeType, apiKey, displayName = 'gocreate-attachment' }) {
  const startRes = await fetch(
    `${GEMINI_FILES_BASE}/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(buffer.length),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    }
  );

  if (!startRes.ok) {
    const errBody = await startRes.text().catch(() => '');
    throw new Error(`Gemini Files start falhou: HTTP ${startRes.status} ${errBody}`);
  }

  const uploadUrl = startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    throw new Error('Gemini Files: upload URL em falta.');
  }

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(buffer.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
      'Content-Type': mimeType,
    },
    body: buffer,
  });

  const uploaded = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok) {
    throw new Error(
      uploaded?.error?.message || `Gemini Files upload falhou: HTTP ${uploadRes.status}`
    );
  }

  let file = uploaded?.file || uploaded;
  const name = file?.name;
  if (!name) {
    throw new Error('Gemini Files: resposta sem file.name.');
  }

  // Espera ACTIVE (vídeos demoram a processar)
  for (let i = 0; i < 60; i++) {
    const state = String(file?.state || '').toUpperCase();
    if (state === 'ACTIVE') break;
    if (state === 'FAILED') {
      throw new Error('Gemini Files: processamento do vídeo falhou.');
    }
    await sleep(1000);
    const poll = await fetch(
      `${GEMINI_FILES_BASE}/v1beta/${name}?key=${encodeURIComponent(apiKey)}`
    );
    const polled = await poll.json().catch(() => ({}));
    file = polled?.file || polled;
  }

  if (String(file?.state || '').toUpperCase() !== 'ACTIVE') {
    throw new Error('Gemini Files: timeout a processar o anexo.');
  }

  return {
    uri: file.uri,
    mimeType: file.mimeType || mimeType,
  };
}

/**
 * Descarrega o anexo Cloudinary e monta parts multimodais para o Gemini.
 * Freemium: qualquer user autenticado com créditos pode anexar/ler mídia.
 */
export async function buildAttachmentParts({
  attachmentUrl,
  attachmentResourceType,
  attachmentMimeType,
  apiKey,
}) {
  if (!attachmentUrl) return [];

  try {
    const res = await fetch(attachmentUrl, { redirect: 'follow' });
    if (!res.ok) {
      console.warn(`[gemini] fetch anexo HTTP ${res.status}: ${attachmentUrl}`);
      return [];
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return [];

    let mime =
      String(attachmentMimeType || '').split(';')[0].trim() ||
      String(res.headers.get('content-type') || '')
        .split(';')[0]
        .trim() ||
      guessMimeFromUrl(attachmentUrl);

    const rt = String(attachmentResourceType || '').toLowerCase();
    if (!mime) {
      if (rt === 'image') mime = 'image/jpeg';
      else if (rt === 'video') mime = 'video/mp4';
      else mime = 'application/octet-stream';
    }

    const isVideo = mime.startsWith('video/') || rt === 'video';
    const isImage = mime.startsWith('image/') || rt === 'image';

    // Vídeos grandes → Files API; imagens e clips pequenos → inlineData
    if (isVideo && buf.length > INLINE_MAX_BYTES) {
      const file = await uploadToGeminiFiles({
        buffer: buf,
        mimeType: mime,
        apiKey,
        displayName: 'gocreate-clip',
      });
      return [{ fileData: { mimeType: file.mimeType, fileUri: file.uri } }];
    }

    if (isImage || isVideo || mime === 'application/pdf' || buf.length <= INLINE_MAX_BYTES) {
      return [
        {
          inlineData: {
            mimeType: mime,
            data: buf.toString('base64'),
          },
        },
      ];
    }

    // Docs grandes → Files API
    const file = await uploadToGeminiFiles({
      buffer: buf,
      mimeType: mime,
      apiKey,
      displayName: 'gocreate-doc',
    });
    return [{ fileData: { mimeType: file.mimeType, fileUri: file.uri } }];
  } catch (err) {
    console.warn('[gemini] buildAttachmentParts:', err?.message || err);
    // Continua só com a URL no texto — geração não falha por causa do anexo
    return [];
  }
}

/**
 * Monta o body generateContent / streamGenerateContent no formato Gemini.
 * messages: [{ role: 'user'|'ai'|'assistant'|'model', text }]
 */
export function buildGeminiBody({
  systemPrompt,
  messages,
  attachmentUrl,
  attachmentParts = [],
  maxOutputTokens = 65536,
}) {
  const contents = [];
  const list = Array.isArray(messages) ? messages : [];

  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    const isLast = i === list.length - 1;
    let text = String(m?.text || '').trim();
    if (!text) continue;
    if (isLast && attachmentUrl) {
      const hasVision = Array.isArray(attachmentParts) && attachmentParts.length > 0;
      text = hasVision
        ? `${text}\n\n[Anexo do utilizador — analisa o conteúdo visual/vídeo nas parts multimodais. URL pública para usar no código: ${attachmentUrl}]`
        : `${text}\n\n[Arquivo anexado pelo usuário, disponível nesta URL pública: ${attachmentUrl}]`;
    }
    const role =
      m.role === 'ai' || m.role === 'assistant' || m.role === 'model' ? 'model' : 'user';
    const parts = [{ text }];
    if (isLast && Array.isArray(attachmentParts) && attachmentParts.length) {
      parts.push(...attachmentParts);
    }
    contents.push({ role, parts });
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

async function prepareBody({
  systemPrompt,
  messages,
  attachmentUrl,
  attachmentResourceType,
  attachmentMimeType,
  apiKey,
}) {
  const attachmentParts = await buildAttachmentParts({
    attachmentUrl,
    attachmentResourceType,
    attachmentMimeType,
    apiKey,
  });
  return buildGeminiBody({
    systemPrompt,
    messages,
    attachmentUrl,
    attachmentParts,
  });
}

/**
 * Streaming SSE nativo do Gemini (alt=sse). Callback onChunk(textDelta).
 * Tenta cada modelo candidato até um funcionar.
 */
export async function streamGeminiChat({
  systemPrompt,
  messages,
  attachmentUrl,
  attachmentResourceType,
  attachmentMimeType,
  onChunk,
  timeoutMs = 120000,
  preferredProvider = null,
  turnIntent = null,
}) {
  const pref = String(preferredProvider || 'auto').trim().toLowerCase();
  const forceFallback =
    pref === 'groq' || pref === 'openrouter' || pref === 'github';
  const forceGemini = pref === 'gemini';
  const intent = String(turnIntent || '').trim().toLowerCase();

  const apiKey = getGeminiApiKey();

  // Provider explícito (não Auto / não Gemini) → só fallback OpenAI-compatible
  if (forceFallback) {
    try {
      const fb = await tryOpenAiFallbackChat({
        systemPrompt,
        messages,
        attachmentUrl,
        onChunk,
        preferredProvider: pref,
        strictProvider: true,
      });
      if (fb) return fb;
    } catch (e) {
      const err = new Error(
        e?.message ||
          `Provider ${pref} indisponível. Verifica a chave no servidor ou escolhe Auto.`
      );
      err.status = e?.status || 503;
      throw err;
    }
    const err = new Error(
      `Provider ${pref} sem chave configurada. Define a env correspondente ou escolhe Auto.`
    );
    err.status = 503;
    throw err;
  }

  // Auto + chat_only: prioriza Groq (rápido/barato) se houver chave; senão Gemini.
  // Continua a ser fallback por disponibilidade — não ranking de “melhor modelo”.
  if (!forceGemini && (pref === 'auto' || !pref) && intent === 'chat_only' && hasAiFallbackKeys()) {
    try {
      const fb = await tryOpenAiFallbackChat({
        systemPrompt,
        messages,
        attachmentUrl,
        onChunk,
        preferredProvider: 'groq',
        strictProvider: false,
      });
      if (fb) return fb;
    } catch (e) {
      console.warn('[gemini] auto chat_only fallback falhou, a tentar Gemini:', e?.message);
    }
  }

  if (!apiKey) {
    if (forceGemini) {
      const err = new Error(
        'GEMINI_API_KEY não configurada. Escolhe Auto ou outro provider com chave.'
      );
      err.status = 503;
      throw err;
    }
    if (hasAiFallbackKeys()) {
      return tryOpenAiFallbackChat({
        systemPrompt,
        messages,
        attachmentUrl,
        onChunk,
      });
    }
    const err = new Error(
      'GEMINI_API_KEY não configurada no backend. Defina em backend/.env e reinicie o servidor (ou configure GROQ_API_KEY / OPENROUTER_API_KEY / GITHUB_MODELS_TOKEN).'
    );
    err.status = 503;
    throw err;
  }

  const body = await prepareBody({
    systemPrompt,
    messages,
    attachmentUrl,
    attachmentResourceType,
    attachmentMimeType,
    apiKey,
  });
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

      return { ok: true, text: full, model: `gemini:${model}`, provider: 'gemini' };
    } catch (e) {
      if (e?.status && e.status !== 404 && e.status !== 429 && e.status !== 503) throw e;
      lastError =
        e?.name === 'AbortError' ? 'Timeout na API Gemini.' : String(e?.message || e);
      console.warn(`[gemini] stream exceção model=${model}: ${lastError}`);
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    return await generateGeminiChat({
      systemPrompt,
      messages,
      attachmentUrl,
      attachmentResourceType,
      attachmentMimeType,
      onChunk,
      preferredProvider: pref,
    });
  } catch (genErr) {
    if (forceGemini) throw genErr;
    try {
      const fb = await tryOpenAiFallbackChat({
        systemPrompt,
        messages,
        attachmentUrl,
        onChunk,
      });
      if (fb) return fb;
    } catch (fbErr) {
      console.warn('[gemini] AI fallback também falhou:', fbErr?.message || fbErr);
    }
    throw genErr;
  }
}

/**
 * generateContent sem stream — devolve texto completo (opcionalmente emite onChunk uma vez).
 */
export async function generateGeminiChat({
  systemPrompt,
  messages,
  attachmentUrl,
  attachmentResourceType,
  attachmentMimeType,
  onChunk,
  timeoutMs = 90000,
}) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    if (hasAiFallbackKeys()) {
      return tryOpenAiFallbackChat({
        systemPrompt,
        messages,
        attachmentUrl,
        onChunk,
      });
    }
    const err = new Error(
      'GEMINI_API_KEY não configurada no backend. Defina em backend/.env e reinicie o servidor (ou configure GROQ_API_KEY / OPENROUTER_API_KEY / GITHUB_MODELS_TOKEN).'
    );
    err.status = 503;
    throw err;
  }

  const body = await prepareBody({
    systemPrompt,
    messages,
    attachmentUrl,
    attachmentResourceType,
    attachmentMimeType,
    apiKey,
  });
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

  try {
    const fb = await tryOpenAiFallbackChat({
      systemPrompt,
      messages,
      attachmentUrl,
      onChunk,
    });
    if (fb) return fb;
  } catch (fbErr) {
    console.warn('[gemini] AI fallback também falhou:', fbErr?.message || fbErr);
    lastError = `${lastError} | fallback: ${fbErr?.message || fbErr}`;
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
  hasAnyAiProvider,
  buildGeminiBody,
  buildAttachmentParts,
  streamGeminiChat,
  generateGeminiChat,
};
