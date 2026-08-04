import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Zap,
  Check,
  Sparkles,
  Rocket,
  Loader2,
  QrCode,
  Copy,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PLANS } from '../lib/plans';
import { createPayment, getPaymentStatus } from '../lib/billingApi';
import Toast from './Toast';

/** src de <img> a partir do qr_code_base64 do Mercado Pago (sem mock local). */
function pixQrImageSrc(base64) {
  const raw = String(base64 || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:image')) return raw;
  return `data:image/png;base64,${raw}`;
}

/**
 * PricingModal — Free / Pro / Turbo.
 * Assinar Pro e Turbo → modal Pix no GoCreate (QR real MP + copia-e-cola).
 * Fallback: iframe do ticket_url sandbox/produção. Sem mock SVG / qrserver.
 */
export default function PricingModal({ open, onClose, currentPlan = 'free', message = null }) {
  const { user } = useAuth();
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);
  const [view, setView] = useState('plans'); // plans | pending | success
  const [pixData, setPixData] = useState(null);
  const [pixStatus, setPixStatus] = useState('pending');
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const pollRef = useRef(null);
  const iframeTimerRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopPolling();
      if (iframeTimerRef.current) {
        clearTimeout(iframeTimerRef.current);
        iframeTimerRef.current = null;
      }
      setView('plans');
      setPixData(null);
      setPixStatus('pending');
      setBusyId(null);
      setIframeBlocked(false);
    }
  }, [open, stopPolling]);

  useEffect(() => () => {
    stopPolling();
    if (iframeTimerRef.current) clearTimeout(iframeTimerRef.current);
  }, [stopPolling]);

  const startStatusPolling = useCallback(
    (transactionId) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          if (!user) return;
          const idToken = await user.getIdToken();
          const status = await getPaymentStatus({ transactionId, idToken });
          if (status?.status === 'completed') {
            setPixStatus('completed');
            setView('success');
            stopPolling();
          }
        } catch (err) {
          console.warn('[PricingModal] poll:', err);
        }
      }, 3000);
    },
    [user, stopPolling]
  );

  if (!open) return null;

  function resetToPlans() {
    stopPolling();
    if (iframeTimerRef.current) {
      clearTimeout(iframeTimerRef.current);
      iframeTimerRef.current = null;
    }
    setView('plans');
    setPixData(null);
    setPixStatus('pending');
    setIframeBlocked(false);
  }

  async function handleSelect(plan) {
    if (plan.id === 'free' || plan.amount === 0) {
      setToast({ message: 'Já estás no plano Free.', type: 'info' });
      return;
    }
    if (!user?.uid) {
      setToast({ message: 'Inicia sessão para continuar.', type: 'error' });
      return;
    }

    setBusyId(plan.id);
    setIframeBlocked(false);
    try {
      const idToken = await user.getIdToken();
      const result = await createPayment({ productId: plan.id, idToken });

      if (
        result.mode === 'pix' &&
        (result.qrCode || result.qrCodeBase64 || result.ticketUrl)
      ) {
        setPixData(result);
        setPixStatus('pending');
        setView('pending');
        startStatusPolling(result.transactionId);

        // Se só houver ticket (sem base64), preparar detecção de X-Frame-Options.
        if (!result.qrCodeBase64 && result.ticketUrl) {
          if (iframeTimerRef.current) clearTimeout(iframeTimerRef.current);
          iframeTimerRef.current = setTimeout(() => {
            setIframeBlocked(true);
          }, 4500);
        }
        return;
      }

      // Nunca redirecionar para Checkout Pro / init_point
      if (result.mode === 'checkout' || result.checkoutUrl) {
        setToast({
          message: 'Checkout por redirect desativado. Tenta novamente (Pix no modal).',
          type: 'error',
        });
        return;
      }

      setToast({ message: 'Resposta de pagamento inesperada.', type: 'error' });
    } catch (err) {
      console.error('[PricingModal]', err);
      if (err?.code === 'MP_NOT_CONFIGURED' || err?.status === 503) {
        setToast({
          message:
            'Mercado Pago ainda não configurado. Adicione MERCADOPAGO_ACCESS_TOKEN no servidor.',
          type: 'error',
        });
      } else {
        setToast({
          message: err?.message || 'Falha ao iniciar pagamento Pix.',
          type: 'error',
        });
      }
    } finally {
      setBusyId(null);
    }
  }

  async function copyPixCode() {
    if (!pixData?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pixData.qrCode);
      setToast({ message: 'Código Pix copiado.', type: 'success' });
    } catch {
      setToast({ message: 'Não foi possível copiar.', type: 'error' });
    }
  }

  const amountLabel =
    pixData?.amount != null
      ? `R$ ${Number(pixData.amount).toFixed(2).replace('.', ',')}`
      : '';

  const qrSrc = pixQrImageSrc(pixData?.qrCodeBase64);
  const useTicketIframe = Boolean(pixData?.ticketUrl) && !qrSrc;
  // Link externo só quando o iframe do ticket for bloqueado (X-Frame-Options).
  const showOpenMpLink = Boolean(pixData?.ticketUrl) && iframeBlocked && !qrSrc;
  const pendingWide = useTicketIframe;

  const headerTitle =
    view === 'pending'
      ? 'Pagar com Pix'
      : view === 'success'
        ? 'Pagamento confirmado'
        : 'Escolhe o teu ritmo';

  const headerSub =
    view === 'pending'
      ? qrSrc
        ? 'Escaneia o QR do Mercado Pago ou copia o código. Ativamos o plano assim que o Pix for aprovado.'
        : useTicketIframe
          ? 'Checkout Pix do Mercado Pago embutido. Ativamos o plano assim que for aprovado.'
          : 'Copia o código Pix. Ativamos o plano assim que for aprovado.'
      : view === 'success'
        ? 'Créditos e plano atualizados na tua conta.'
        : message || 'Créditos alimentam cada geração com a IA. Faz upgrade quando precisares.';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
        onClick={view === 'pending' ? undefined : onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full gc-themed bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden ${
          view === 'pending' && pendingWide
            ? 'max-w-2xl max-h-[92vh] flex flex-col'
            : view === 'pending' || view === 'success'
              ? 'max-w-md'
              : 'max-w-5xl'
        }`}
      >
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(37,99,235,0.12),transparent_60%)]" />

        <div className="relative flex items-start justify-between gap-4 px-5 sm:px-7 py-5 border-b border-zinc-800 shrink-0">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 mb-1">
              {view === 'pending' ? 'Checkout' : 'Planos'}
            </p>
            <h2 className="text-xl sm:text-2xl font-bold text-zinc-50 tracking-tight">
              {headerTitle}
            </h2>
            <p className="text-sm text-zinc-400 mt-1.5 max-w-lg">{headerSub}</p>
            {view === 'plans' && message ? (
              <p className="mt-2 text-xs text-amber-300/90 bg-amber-950/40 border border-amber-700/30 rounded-lg px-3 py-2 max-w-lg">
                {message}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-all shrink-0"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {view === 'plans' && (
          <div className="relative p-5 sm:p-7">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
              {PLANS.map((plan) => {
                const isCurrent = plan.id === currentPlan && plan.type === 'subscription';
                const Icon = plan.id === 'pro' ? Rocket : plan.id === 'turbo' ? Sparkles : Zap;
                const isPro = plan.highlight;

                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col rounded-2xl border p-5 sm:p-6 transition-all ${
                      isPro
                        ? 'border-blue-500/60 bg-gradient-to-b from-blue-600/15 via-zinc-900/90 to-zinc-950 shadow-[0_0_40px_rgba(37,99,235,0.22)] md:scale-[1.02] md:-my-1'
                        : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900/80'
                    }`}
                  >
                    {isPro && (
                      <>
                        <div
                          className="absolute -inset-px rounded-2xl bg-gradient-to-b from-blue-500/25 via-transparent to-transparent pointer-events-none"
                          aria-hidden
                        />
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-900/40">
                          Popular
                        </span>
                      </>
                    )}

                    <div className="relative flex items-center gap-2.5 mb-4">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                          isPro
                            ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700/80'
                        }`}
                      >
                        <Icon size={17} />
                      </div>
                      <h3 className="text-base font-semibold text-zinc-50">{plan.name}</h3>
                    </div>

                    <div className="relative mb-5">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold tracking-tight text-zinc-50">
                          {plan.priceLabel}
                        </span>
                        <span className="text-sm text-zinc-400">{plan.period}</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-1.5">
                        {plan.credits} créditos
                        {plan.type === 'subscription' ? '/mês' : ' únicos'}
                      </p>
                    </div>

                    <ul className="relative space-y-2.5 mb-6 flex-1">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-300">
                          <Check
                            size={14}
                            className={`mt-0.5 shrink-0 ${isPro ? 'text-blue-400' : 'text-zinc-500'}`}
                          />
                          {f}
                        </li>
                      ))}
                    </ul>

                    <button
                      type="button"
                      disabled={isCurrent || busyId === plan.id}
                      onClick={() => handleSelect(plan)}
                      className={`relative w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
                        plan.amount > 0
                          ? isPro
                            ? 'text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/30 ring-1 ring-blue-400/30'
                            : 'text-zinc-950 bg-zinc-100 hover:bg-white'
                          : 'text-zinc-400 bg-zinc-800/80 border border-zinc-700 cursor-default'
                      }`}
                    >
                      {busyId === plan.id ? (
                        <span className="inline-flex items-center gap-2 justify-center">
                          <Loader2 size={14} className="animate-spin" /> A gerar Pix…
                        </span>
                      ) : isCurrent ? (
                        'Plano atual'
                      ) : (
                        plan.cta
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === 'pending' && pixData && (
          <div
            className={`relative p-5 sm:p-7 flex flex-col items-center gap-5 ${
              pendingWide ? 'overflow-y-auto min-h-0 flex-1' : ''
            }`}
          >
            <button
              type="button"
              onClick={resetToPlans}
              className="self-start inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-all"
            >
              <ArrowLeft size={13} /> Voltar aos planos
            </button>

            <div className="w-full rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/95 to-zinc-950 p-6 flex flex-col items-center gap-5">
              <div className="w-full flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <QrCode size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">
                      {pixData.plan === 'pro' || pixData.title?.includes?.('Pro')
                        ? 'GoCreate Pro'
                        : 'GoCreate Turbo'}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {pixData.credits != null ? `+${pixData.credits} créditos` : 'Pagamento Pix'}
                    </p>
                  </div>
                </div>
                <p className="text-xl font-bold tracking-tight text-zinc-50">{amountLabel}</p>
              </div>

              {/* Primário: QR real do Mercado Pago (qr_code_base64) */}
              {qrSrc ? (
                <img
                  src={qrSrc}
                  alt="QR Code Pix Mercado Pago"
                  width={256}
                  height={256}
                  className="w-56 h-56 sm:w-64 sm:h-64 rounded-2xl bg-white p-3 shadow-lg shadow-black/40 object-contain"
                  onError={() => {
                    // Base64 inválido → cair no iframe do ticket se existir
                    setPixData((prev) =>
                      prev ? { ...prev, qrCodeBase64: null } : prev
                    );
                    if (pixData.ticketUrl) {
                      if (iframeTimerRef.current) clearTimeout(iframeTimerRef.current);
                      iframeTimerRef.current = setTimeout(() => setIframeBlocked(true), 4500);
                    }
                  }}
                />
              ) : useTicketIframe && !iframeBlocked ? (
                <div className="w-full rounded-xl overflow-hidden border border-zinc-700 bg-white min-h-[420px] h-[52vh] max-h-[560px]">
                  <iframe
                    title="Pix Mercado Pago"
                    src={pixData.ticketUrl}
                    className="w-full h-full border-0"
                    referrerPolicy="no-referrer-when-downgrade"
                    allow="payment *; clipboard-write"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                    onLoad={() => {
                      if (iframeTimerRef.current) {
                        clearTimeout(iframeTimerRef.current);
                        iframeTimerRef.current = null;
                      }
                      setIframeBlocked(false);
                    }}
                  />
                </div>
              ) : (
                <div className="w-56 h-56 rounded-2xl bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-zinc-500 text-xs text-center px-6">
                  {pixData.qrCode
                    ? 'Usa o código copia-e-cola abaixo no app do teu banco'
                    : 'QR indisponível — tenta novamente'}
                </div>
              )}

              {pixData.qrCode && (
                <div className="w-full space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                    Pix copia e cola
                  </p>
                  <div className="flex items-stretch gap-2">
                    <p className="flex-1 text-[11px] text-zinc-400 font-mono break-all bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 max-h-20 overflow-y-auto">
                      {pixData.qrCode}
                    </p>
                    <button
                      type="button"
                      onClick={copyPixCode}
                      className="shrink-0 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-all"
                      title="Copiar código"
                    >
                      <Copy size={14} /> Copiar
                    </button>
                  </div>
                </div>
              )}

              {/* Só se o iframe for bloqueado (X-Frame-Options) — link secundário mínimo */}
              {showOpenMpLink && (
                <a
                  href={pixData.ticketUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Abrir no Mercado Pago <ExternalLink size={10} />
                </a>
              )}

              <div className="flex items-center gap-2 text-sm text-zinc-300">
                {pixStatus === 'pending' ? (
                  <>
                    <Loader2 size={15} className="animate-spin text-blue-400" />
                    Aguardando confirmação do Pix…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} className="text-emerald-400" />
                    Pagamento aprovado
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 bg-zinc-950/50 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {view === 'success' && (
          <div className="relative p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-emerald-400" />
            </div>
            <p className="text-zinc-100 font-medium">Pagamento confirmado</p>
            <p className="text-sm text-zinc-400 max-w-sm">
              Os créditos e o plano já devem aparecer na tua conta. Se ainda não, atualiza a página.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-all"
            >
              Continuar a criar
            </button>
          </div>
        )}

        {view === 'plans' && (
          <p className="relative px-6 pb-5 text-[11px] text-zinc-500 text-center">
            Pagamento via Pix · Mercado Pago · sem sair do GoCreate
          </p>
        )}
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
