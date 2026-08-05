/**
 * Prompt/anexo pendente da landing → editor (e login).
 * PENDING_PROMPT_KEY: string (legado) ou JSON { text, attachment? }.
 * File em memória para guests (SPA sem reload) até upload autenticado no Editor.
 */

import { PENDING_PROMPT_KEY } from './mockData';

let pendingFile = null;

export function setPendingLandingFile(file) {
  pendingFile = file instanceof File ? file : null;
}

export function takePendingLandingFile() {
  const f = pendingFile;
  pendingFile = null;
  return f;
}

export function peekPendingLandingFile() {
  return pendingFile;
}

/**
 * @param {string} text
 * @param {{ url: string, name?: string, resourceType?: string, mimeType?: string|null } | null} [attachment]
 */
export function savePendingPrompt(text, attachment = null) {
  const trimmed = String(text || '').trim();
  if (!trimmed && !attachment?.url) return;
  if (attachment?.url) {
    sessionStorage.setItem(
      PENDING_PROMPT_KEY,
      JSON.stringify({
        text: trimmed,
        attachment: {
          url: attachment.url,
          name: attachment.name || 'Anexo',
          resourceType: attachment.resourceType || 'raw',
          mimeType: attachment.mimeType || null,
        },
      })
    );
    return;
  }
  sessionStorage.setItem(PENDING_PROMPT_KEY, trimmed);
}

/**
 * Lê sem remover — evita perder o prompt se o envio falhar / remount.
 * @returns {{ text: string, attachment: { url: string, name: string, resourceType: string, mimeType?: string|null } | null } | null}
 */
export function peekPendingPrompt() {
  const raw = sessionStorage.getItem(PENDING_PROMPT_KEY);
  if (!raw) return null;
  try {
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw);
      const text = String(parsed?.text || '').trim();
      const att = parsed?.attachment;
      if (!text && !att?.url) return null;
      return {
        text,
        attachment: att?.url
          ? {
              url: att.url,
              name: att.name || 'Anexo',
              resourceType: att.resourceType || 'raw',
              mimeType: att.mimeType || null,
            }
          : null,
      };
    }
  } catch {
    // plain string
  }
  const text = raw.trim();
  return text ? { text, attachment: null } : null;
}

export function clearPendingPrompt() {
  try {
    sessionStorage.removeItem(PENDING_PROMPT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Consome (peek + clear). Preferir peek + clear após o envio começar.
 * @returns {{ text: string, attachment: { url: string, name: string, resourceType: string, mimeType?: string|null } | null } | null}
 */
export function loadPendingPrompt() {
  const pending = peekPendingPrompt();
  if (pending) clearPendingPrompt();
  return pending;
}
