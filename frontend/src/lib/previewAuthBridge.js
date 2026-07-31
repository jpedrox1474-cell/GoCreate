/**
 * Parent-window bridge for Google Auth inside Sandpack iframes.
 * Sandpack runs on *.codesandbox.io — Firebase OAuth only works on authorized
 * parent origins (gocreate.web.app). The iframe posts here; we run signInWithPopup
 * and return user + idToken via postMessage.
 */
import { signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

export const GOCREATE_AUTH_MSG = 'gocreate-auth';

const ERROR_PT = {
  'auth/popup-closed-by-user': 'Login cancelado.',
  'auth/popup-blocked':
    'O browser bloqueou o popup de login. Permite popups para este site e tenta de novo.',
  'auth/cancelled-popup-request': 'Login cancelado (outro popup já estava aberto).',
  'auth/unauthorized-domain':
    'Domínio não autorizado para login Google. Contacta o suporte GoCreate.',
  'auth/network-request-failed': 'Falha de rede ao autenticar. Verifica a ligação e tenta de novo.',
};

function serializeUser(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || null,
    photoURL: user.photoURL || null,
    emailVerified: Boolean(user.emailVerified),
    providerId: user.providerData?.[0]?.providerId || 'google.com',
  };
}

function toBridgeError(err) {
  const code = err?.code || 'BRIDGE_ERROR';
  const message =
    ERROR_PT[code] ||
    (/unauthorized.?domain|not authorized for OAuth/i.test(String(err?.message || ''))
      ? ERROR_PT['auth/unauthorized-domain']
      : null) ||
    'Não foi possível autenticar com Google. Tenta novamente.';
  return { code, message };
}

function isTrustedPreviewOrigin(origin) {
  if (!origin || origin === 'null') return true; // sandboxed iframe may send null
  try {
    const host = new URL(origin).hostname;
    return (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
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

async function handleSignInWithGoogle() {
  const provider = googleProvider || new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  const idToken = await result.user.getIdToken();
  return {
    user: serializeUser(result.user),
    idToken,
  };
}

async function handleSignOut() {
  await signOut(auth);
  return { ok: true };
}

/**
 * Installs window message listener. Returns cleanup function.
 */
export function installPreviewAuthBridge() {
  if (typeof window === 'undefined') return () => {};

  async function onMessage(event) {
    const data = event?.data;
    if (!data || data.type !== GOCREATE_AUTH_MSG) return;
    if (data.action !== 'signInWithGoogle' && data.action !== 'signOut') return;
    if (!data.requestId) return;
    if (!isTrustedPreviewOrigin(event.origin)) {
      console.warn('[previewAuthBridge] Ignored message from untrusted origin:', event.origin);
      return;
    }

    const reply = (payload) => {
      try {
        const target = event.source;
        if (target && typeof target.postMessage === 'function') {
          target.postMessage(
            {
              type: GOCREATE_AUTH_MSG,
              action: data.action === 'signOut' ? 'signOutResult' : 'signInWithGoogleResult',
              requestId: data.requestId,
              ...payload,
            },
            event.origin === 'null' ? '*' : event.origin
          );
        }
      } catch (err) {
        console.error('[previewAuthBridge] Failed to reply', err);
      }
    };

    try {
      if (data.action === 'signInWithGoogle') {
        const result = await handleSignInWithGoogle();
        reply(result);
      } else {
        await handleSignOut();
        reply({ ok: true });
      }
    } catch (err) {
      console.error('[previewAuthBridge]', err);
      reply({ error: toBridgeError(err) });
    }
  }

  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
