import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plug } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getIntegrationsStatus } from '../../lib/integrationsApi';

const CHANNEL_ICONS = [
  {
    id: 'whatsapp_evolution',
    altIds: ['whatsapp'],
    label: 'WhatsApp',
    className: 'bg-[#25D366] text-white',
    glyph: 'W',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    className: 'bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white',
    glyph: 'IG',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    className: 'bg-[#1877F2] text-white',
    glyph: 'f',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    className: 'bg-[#FF0000] text-white',
    glyph: 'YT',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    className: 'bg-zinc-100 text-zinc-900',
    glyph: 'TT',
  },
  {
    id: 'mercadopago',
    altIds: [],
    label: 'Mercado Pago',
    className: 'bg-[#009EE3] text-white',
    glyph: 'MP',
  },
];

function isConnected(providers, channel) {
  if (!providers) return false;
  const ids = [channel.id, ...(channel.altIds || [])];
  return ids.some((id) => providers[id]?.status === 'connected');
}

/**
 * Barra "Integrações ativas" acima do input do chat — ícones só se ligadas.
 */
export default function IntegrationsBanner({ projectId }) {
  const { user } = useAuth();
  const [providers, setProviders] = useState(null);

  const to = projectId
    ? `/integrations?projectId=${encodeURIComponent(projectId)}`
    : '/integrations';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.getIdToken) {
        setProviders(null);
        return;
      }
      try {
        const token = await user.getIdToken();
        const data = await getIntegrationsStatus({ idToken: token });
        if (!cancelled) setProviders(data?.providers || {});
      } catch {
        if (!cancelled) setProviders({});
      }
    }
    load();
    function onBackendEnabled() {
      load();
    }
    window.addEventListener('gocreate:backend-enabled', onBackendEnabled);
    return () => {
      cancelled = true;
      window.removeEventListener('gocreate:backend-enabled', onBackendEnabled);
    };
  }, [user]);

  const active = CHANNEL_ICONS.filter((ch) => isConnected(providers, ch));

  return (
    <div className="mx-3 mb-2 flex items-center justify-between gap-2 px-1 py-1.5 text-[11px] text-zinc-500 border-b border-zinc-800/40">
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0 text-zinc-400 font-medium">Integrações ativas</span>
        {active.length > 0 ? (
          <div className="flex items-center gap-1 flex-wrap">
            {active.map((ch) => (
              <span
                key={ch.id}
                title={ch.label}
                className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded px-1 text-[9px] font-bold leading-none ${ch.className}`}
              >
                {ch.glyph}
              </span>
            ))}
          </div>
        ) : (
          <span className="truncate text-zinc-600">nenhuma ligada</span>
        )}
      </div>
      <Link
        to={to}
        className="inline-flex items-center gap-1 shrink-0 text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <Plug size={11} />
        Gerir
      </Link>
    </div>
  );
}
