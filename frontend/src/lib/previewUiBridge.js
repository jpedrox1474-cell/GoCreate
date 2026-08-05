/**
 * Parent-window bridge for GoCreateUI messages from Sandpack iframes.
 * Replies with ack so the iframe skips its local overlay when the editor handles UI.
 */
export const GOCREATE_UI_MSG = 'gocreate:ui';

function isTrustedPreviewOrigin(origin) {
  if (!origin || origin === 'null') return true;
  try {
    const host = new URL(origin).hostname;
    return (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === 'gocreate-app.web.app' ||
      host === 'gocreate-app.firebaseapp.com' ||
      host === 'gen-lang-client-0968841856.web.app' ||
      host === 'gen-lang-client-0968841856.firebaseapp.com' ||
      host === 'gocreate.web.app' ||
      host === 'gocreate.firebaseapp.com' ||
      host.endsWith('.codesandbox.io') ||
      host.endsWith('.csb.app') ||
      host === 'csb.app' ||
      host === 'sandbox.csb.app'
    );
  } catch {
    return false;
  }
}

function replyAck(event, requestId) {
  if (!requestId) return;
  try {
    const target = event.source;
    if (target && typeof target.postMessage === 'function') {
      target.postMessage(
        {
          type: GOCREATE_UI_MSG,
          action: 'ack',
          requestId,
        },
        event.origin === 'null' ? '*' : event.origin
      );
    }
  } catch (err) {
    console.warn('[previewUiBridge] ack failed', err);
  }
}

/**
 * @param {{
 *   onModal?: (payload: { title?: string, message: string, variant?: string, openSettings?: boolean }) => void,
 *   onToast?: (payload: { message: string, type?: string, duration?: number }) => void,
 *   onOpenSettings?: () => void,
 * }} handlers
 */
export function installPreviewUiBridge(handlers = {}) {
  if (typeof window === 'undefined') return () => {};

  function onMessage(event) {
    const data = event?.data;
    if (!data || data.type !== GOCREATE_UI_MSG) return;
    if (data.action === 'ack') return;
    if (!isTrustedPreviewOrigin(event.origin)) {
      console.warn('[previewUiBridge] Ignored message from untrusted origin:', event.origin);
      return;
    }

    const action = data.action;
    if (action === 'openSettings') {
      handlers.onOpenSettings?.();
      replyAck(event, data.requestId);
      return;
    }

    if (action === 'toast') {
      const type =
        data.variant === 'success' || data.variant === 'ok'
          ? 'success'
          : data.variant === 'error'
            ? 'error'
            : 'info';
      handlers.onToast?.({
        message: String(data.message || ''),
        type,
        duration: 5200,
      });
      replyAck(event, data.requestId);
      return;
    }

    if (action === 'modal' || action === 'alert' || action === 'confirm' || action === 'prompt') {
      // confirm/prompt stay in-iframe (async); only alert/modal are parent-handled
      if (action === 'confirm' || action === 'prompt') return;
      handlers.onModal?.({
        title: data.title || 'Aviso',
        message: String(data.message || ''),
        variant: data.variant || 'info',
        openSettings: Boolean(data.openSettings),
      });
      replyAck(event, data.requestId);
    }
  }

  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
