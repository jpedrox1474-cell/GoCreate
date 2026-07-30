import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, X, Check, Plug } from 'lucide-react';
import { getIntegrationsStatus } from '../../lib/integrationsApi';

/**
 * Banner no editor: lembra de ligar Mercado Pago para Pix/cartão reais.
 * Aparece quando há ficheiros gerados que sugerem checkout, ou sempre (compacto) se MP não ligado.
 */
export default function IntegrationsBanner({ user, projectId, files }) {
  const [mpConnected, setMpConnected] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  const looksLikeCheckout = React.useMemo(() => {
    const blob = Object.values(files || {})
      .map((f) => (typeof f === 'string' ? f : f?.code || ''))
      .join('\n')
      .toLowerCase();
    return (
      blob.includes('pix') ||
      blob.includes('checkout') ||
      blob.includes('gocreatepayments') ||
      blob.includes('mercadopago') ||
      blob.includes('qrcode')
    );
  }, [files]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const token = await user.getIdToken();
        const data = await getIntegrationsStatus({ idToken: token });
        if (!cancelled) {
          setMpConnected(data?.providers?.mercadopago?.status === 'connected');
        }
      } catch {
        if (!cancelled) setMpConnected(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (dismissed || loading || mpConnected === null) return null;
  if (mpConnected && !looksLikeCheckout) return null;

  if (mpConnected) {
    return (
      <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300">
        <Check size={13} className="shrink-0" />
        <span className="flex-1 min-w-0">
          Mercado Pago ligado — checkouts Pix/cartão usam{' '}
          <code className="text-emerald-200/90">GoCreatePayments</code>
          {projectId ? ` (projeto ${String(projectId).slice(0, 8)}…)` : ''}.
        </span>
        <Link to="/integrations" className="shrink-0 underline-offset-2 hover:underline font-medium">
          Gerir
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-0.5 text-emerald-400/70 hover:text-emerald-200"
          aria-label="Fechar"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-3 mb-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[11px] text-amber-100/90">
      <Wallet size={14} className="shrink-0 mt-0.5 text-amber-400" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-amber-200 mb-0.5">
          {looksLikeCheckout
            ? 'Conectar Mercado Pago para pagamentos reais'
            : 'Integrações prontas para checkout Pix'}
        </p>
        <p className="text-amber-100/70 leading-snug">
          A IA emite o trigger{' '}
          <code className="text-amber-100/90">window.GoCreatePayments.createPix</code>. Liga o teu
          Access Token para QR Codes e cartão funcionarem de verdade.
        </p>
      </div>
      <Link
        to="/integrations"
        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-100 font-semibold hover:bg-amber-500/30 transition-all"
      >
        <Plug size={12} /> Ligar
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="p-0.5 text-amber-400/70 hover:text-amber-200 shrink-0"
        aria-label="Fechar"
      >
        <X size={12} />
      </button>
    </div>
  );
}
