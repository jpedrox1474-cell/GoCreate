import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Plug, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  startPlatformOAuth,
  openOAuthPopup,
  waitForOAuthMessage,
} from '../../lib/socialChannelsApi';

const LABELS = {
  mercadopago: 'Mercado Pago',
  stripe: 'Stripe',
  paypal: 'PayPal',
  whatsapp: 'WhatsApp',
  google: 'Login Google',
  google_oauth: 'Login Google',
  firebase_auth: 'Firebase Auth',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

/** Providers that open OAuth popup from the editor chip. */
const OAUTH_IDS = new Set(['stripe', 'paypal', 'youtube', 'tiktok']);

/** Platform-powered: toast + deep-link; no Client Secret. */
const PLATFORM_AUTH_IDS = new Set(['google', 'google_oauth', 'firebase_auth']);

/**
 * Chips não-bloqueantes: "Este projeto precisa de: Stripe, WhatsApp — Conectar"
 * Continuar sem conectar nunca trava a geração.
 */
export default function SuggestedIntegrationsBanner({
  ids = [],
  projectId,
  onDismiss,
  onConnected,
}) {
  const { user } = useAuth();
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const labels = useMemo(
    () => (ids || []).map((id) => LABELS[id] || id).filter(Boolean),
    [ids]
  );

  if (!ids?.length) return null;

  const to = projectId
    ? `/integrations?projectId=${encodeURIComponent(projectId)}`
    : '/integrations';

  async function handleConnect(id) {
    setError(null);
    if (PLATFORM_AUTH_IDS.has(id)) {
      // Deep-link → Integrações dispara popup Google (1-click)
      window.location.assign(`${to}#google_oauth`);
      return;
    }
    if (!OAUTH_IDS.has(id)) {
      // MP / WhatsApp / Meta → página Integrações (QR / platform / FB.login)
      window.location.assign(`${to}#${id}`);
      return;
    }
    if (!user?.getIdToken) return;
    setBusyId(id);
    try {
      const token = await user.getIdToken();
      const { authUrl } = await startPlatformOAuth({ idToken: token, platform: id });
      const popup = openOAuthPopup(authUrl);
      await waitForOAuthMessage(id, popup);
      onConnected?.(id);
    } catch (err) {
      setError(err?.message || `Falha ao ligar ${LABELS[id] || id}.`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-3 mb-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-[12px] text-amber-100/90">
      <div className="flex items-start gap-2">
        <Plug size={14} className="mt-0.5 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="leading-snug">
            Este projeto precisa de:{' '}
            <span className="font-semibold text-amber-50">{labels.join(', ')}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {ids.map((id) => (
              <button
                key={id}
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => handleConnect(id)}
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/25 disabled:opacity-50"
              >
                {busyId === id ? <Loader2 size={11} className="animate-spin" /> : null}
                Conectar {LABELS[id] || id}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onDismiss?.()}
              className="inline-flex items-center rounded-md border border-zinc-700/80 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800/80"
            >
              Continuar sem conectar
            </button>
            <Link
              to={to}
              className="inline-flex items-center text-[11px] text-zinc-400 hover:text-zinc-200 underline-offset-2 hover:underline"
            >
              Ver Integrações
            </Link>
          </div>
          {error ? <p className="mt-1.5 text-[11px] text-red-300">{error}</p> : null}
        </div>
        <button
          type="button"
          aria-label="Fechar"
          onClick={() => onDismiss?.()}
          className="shrink-0 p-0.5 text-zinc-500 hover:text-zinc-300"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
