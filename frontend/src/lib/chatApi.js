// Cliente do POST /api/chat (SSE).
// Contrato: eventos { type: 'chunk'|'done'|'error', text?, message?, model? }
//
// VITE_API_URL vazio → same-origin `/api/chat` (gocreate.web.app rewrite → gocreateApi).
// Local: VITE_API_URL=http://localhost:4000

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

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
 *   signal?: AbortSignal,
 * }} opts
 * @returns {Promise<{ text: string, model: string|null }>}
 */
export async function streamChat({
  projectId,
  messages,
  attachmentUrl = null,
  idToken,
  onChunk,
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
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
        if (typeof onChunk === 'function') onChunk(evt.text);
      } else if (evt.type === 'done') {
        model = evt.model || null;
      } else if (evt.type === 'error') {
        throw new Error(evt.message || 'Erro ao gerar resposta.');
      }
    }
  }

  return { text: full, model };
}

export default streamChat;
