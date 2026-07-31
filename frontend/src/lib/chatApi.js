// Cliente do POST /api/chat (SSE).
// Contrato: eventos { type: 'chunk'|'done'|'error', text?, message?, model? }
//
// VITE_API_URL vazio → same-origin `/api/chat` (gocreate.web.app rewrite → gocreateApi).
// Local: VITE_API_URL=http://localhost:4000

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/** No chunks for this long → heartbeat UI ("Ainda a gerar…"). */
const STALL_HEARTBEAT_MS = 25_000;
/**
 * Hard cap for idle/hung streams. Large prompts (full-stack) often need 4–6 min.
 * Activity (chunks) resets the effective wait via lastActivityAt checks below —
 * we only abort when wall-clock exceeds this OR when stall exceeds IDLE_ABORT_MS.
 */
const ABSOLUTE_TIMEOUT_MS = 420_000;
/** No SSE activity at all for this long → abort (true hang). */
const IDLE_ABORT_MS = 180_000;
const HEARTBEAT_POLL_MS = 4_000;

function chatEndpoint() {
  return `${API_URL}/api/chat`;
}

/** Erro 403 — créditos esgotados (UI deve abrir PricingModal, não bubble de IA). */
export class InsufficientCreditsError extends Error {
  constructor(message = 'Créditos insuficientes') {
    super(message);
    this.name = 'InsufficientCreditsError';
    this.status = 403;
  }
}

/**
 * @param {{
 *   projectId: string,
 *   messages: Array<{ role: string, text: string }>,
 *   attachmentUrl?: string|null,
 *   idToken: string,
 *   onChunk?: (text: string) => void,
 *   onHeartbeat?: (message: string) => void,
 *   onSuggestedIntegrations?: (ids: string[]) => void,
 *   signal?: AbortSignal,
 * }} opts
 * @returns {Promise<{ text: string, model: string|null, incomplete?: boolean, timeoutMessage?: string, suggestedIntegrations?: string[] }>}
 */
export async function streamChat({
  projectId,
  messages,
  attachmentUrl = null,
  idToken,
  onChunk,
  onHeartbeat,
  onSuggestedIntegrations,
  signal,
}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Nenhuma mensagem para enviar à API.');
  }
  const last = messages[messages.length - 1];
  if (!String(last?.text || '').trim()) {
    throw new Error('O prompt está vazio.');
  }

  const res = await fetch(chatEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ projectId, messages, attachmentUrl }),
    signal,
  });

  if (!res.ok) {
    let message = `Erro HTTP ${res.status}`;
    let data = null;
    try {
      data = await res.json();
      if (data?.message) message = data.message;
      else if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    if (res.status === 403) {
      throw new InsufficientCreditsError(message || 'Créditos insuficientes');
    }
    throw new Error(message);
  }

  if (!res.body) {
    throw new Error('Resposta sem stream.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let model = null;
  let suggestedIntegrations = [];
  let lastActivityAt = Date.now();
  const startedAt = Date.now();
  let heartbeatSent = false;
  let timedOut = false;
  let timeoutReason = '';

  const abortStream = (reason) => {
    timedOut = true;
    timeoutReason = reason;
    try {
      reader.cancel();
    } catch {
      /* ignore */
    }
  };

  const absoluteTimer = setTimeout(() => {
    abortStream(
      'A geração atingiu o tempo máximo. Podes continuar com “Continuar geração” para pedir o restante.'
    );
  }, ABSOLUTE_TIMEOUT_MS);

  const heartbeatTimer = setInterval(() => {
    const idleFor = Date.now() - lastActivityAt;
    if (idleFor >= IDLE_ABORT_MS) {
      abortStream(
        'A geração ficou sem resposta durante demasiado tempo. Tenta “Continuar geração” ou envia de novo.'
      );
      return;
    }
    if (idleFor < STALL_HEARTBEAT_MS) {
      heartbeatSent = false;
      return;
    }
    if (!heartbeatSent && typeof onHeartbeat === 'function') {
      heartbeatSent = true;
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      onHeartbeat(`Ainda a gerar… (${elapsedSec}s)`);
    }
  }, HEARTBEAT_POLL_MS);

  const cleanup = () => {
    clearTimeout(absoluteTimer);
    clearInterval(heartbeatTimer);
  };

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (timedOut) {
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;
      lastActivityAt = Date.now();
      heartbeatSent = false;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload) continue;

        let evt;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }

        if (evt.type === 'chunk' && evt.text) {
          full += evt.text;
          lastActivityAt = Date.now();
          heartbeatSent = false;
          if (typeof onChunk === 'function') onChunk(evt.text);
        } else if (evt.type === 'suggestedIntegrations' && Array.isArray(evt.ids)) {
          suggestedIntegrations = evt.ids;
          lastActivityAt = Date.now();
          if (typeof onSuggestedIntegrations === 'function') {
            onSuggestedIntegrations(evt.ids);
          }
        } else if (evt.type === 'done') {
          model = evt.model || null;
        } else if (evt.type === 'error') {
          throw new Error(evt.message || 'Erro ao gerar resposta.');
        }
      }
    }
  } finally {
    cleanup();
  }

  if (timedOut) {
    // Partial text may still be useful — return it with a flag instead of discarding.
    if (full.trim()) {
      return {
        text: full,
        model,
        incomplete: true,
        timeoutMessage: timeoutReason,
        suggestedIntegrations,
      };
    }
    throw new Error(
      timeoutReason ||
        'A geração demorou demasiado sem resposta. Verifica a ligação e tenta novamente.'
    );
  }

  return { text: full, model, incomplete: false, suggestedIntegrations };
}

export default streamChat;
