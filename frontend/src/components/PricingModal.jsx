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
  ExternalLink,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PLANS } from '../lib/plans';
import { createPayment, getPaymentStatus } from '../lib/billingApi';
import Toast from './Toast';

/**
 * PricingModal — Dark Premium Bento (Free / Pro / Turbo).
 *
 * Mercado Pago:
 * - Pro → Preference Checkout (redirect init_point)
 * - Turbo → Pix QR + polling /api/billing/status
 * - Webhook POST /api/billing/webhook completa transaction + créditos (Admin)
 *
 * Futuro Stripe: mesmo create-payment com provider=stripe.
 */
export default function PricingModal({ open, onClose, currentPlan = 'free' }) {
  const { user } = useAuth();
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);
  const [view, setView] = useState('plans'); // plans | pix | success
  const [pixData, setPixData] = useState(null);
  const [pixStatus, setPixStatus] = useState('pending');
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopPolling();
      setView('plans');
      setPixData(null);
      setPixStatus('pending');
      setBusyId(null);
    }
  }, [open, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPixPolling = useCallback(
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
      }, 3500);
    },
    [user, stopPolling]
  );

  if (!open) return null;

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
    try {
      const idToken = await user.getIdToken();
      const result = await createPayment({ productId: plan.id, idToken });

      if (result.mode === 'checkout' && result.checkoutUrl) {
        setToast({ message: 'A redirecionar para o Mercado Pago…', type: 'info' });
        window.location.href = result.checkoutUrl;
        return;
      }

      if (result.mode === 'pix') {
        setPixData(result);
        setPixStatus('pending');
        setView('pix');
        startPixPolling(result.transactionId);
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
          message: err?.message || 'Falha ao iniciar pagamento.',
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

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-4xl gc-themed bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-5 border-b border-zinc-800">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 mb-1">
              Planos
            </p>
            <h2 className="text-xl font-bold text-zinc-100 tracking-tight">
              {view === 'pix'
                ? 'Pagar com Pix'
                : view === 'success'
                  ? 'Pagamento confirmado'
                  : 'Escolhe o teu ritmo'}
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              {view === 'pix'
                ? 'Escaneia o QR ou copia o código. Os créditos entram assim que o Pix for aprovado.'
                : view === 'success'
                  ? 'Créditos adicionados à tua conta.'
                  : 'Créditos alimentam cada geração com a IA. Faz upgrade quando precisares.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-all shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {view === 'plans' && (
          <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map((plan) => {
              const isCurrent = plan.id === currentPlan && plan.type === 'subscription';
              const Icon = plan.id === 'pro' ? Rocket : plan.id === 'turbo' ? Sparkles : Zap;
              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-xl border p-5 transition-all ${
                    plan.highlight
                      ? 'border-blue-500/50 bg-gradient-to-b from-blue-600/10 to-zinc-900/80 shadow-lg shadow-blue-900/20'
                      : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
                  }`}
                >
                  {plan.highlight && (
                    <span className="absolute -top-2.5 left-4 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-blue-600 text-white">
                      Popular
                    </span>
                  )}
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        plan.highlight ? 'bg-blue-600/20 text-blue-400' : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      <Icon size={16} />
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-100">{plan.name}</h3>
                  </div>
                  <div className="mb-4">
                    <span className="text-2xl font-bold text-zinc-50">{plan.priceLabel}</span>
                    <span className="text-xs text-zinc-500">{plan.period}</span>
                  </div>
                  <ul className="space-y-2 mb-5 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-zinc-400">
                        <Check size={13} className="text-blue-400 mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    disabled={isCurrent || busyId === plan.id}
                    onClick={() => handleSelect(plan)}
                    className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 ${
                      plan.amount > 0
                        ? 'text-white bg-blue-600 hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-600/40 hover:ring-2 hover:ring-indigo-500/40'
                        : 'text-zinc-400 bg-zinc-800 border border-zinc-700 cursor-default'
                    }`}
                  >
                    {busyId === plan.id ? (
                      <span className="inline-flex items-center gap-2 justify-center">
                        <Loader2 size={14} className="animate-spin" /> A processar…
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
        )}

        {view === 'pix' && pixData && (
          <div className="p-5 sm:p-8 flex flex-col items-center gap-5">
            <button
              type="button"
              onClick={() => {
                stopPolling();
                setView('plans');
                setPixData(null);
              }}
              className="self-start inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-all"
            >
              <ArrowLeft size={13} /> Voltar aos planos
            </button>

            <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 text-zinc-300 text-sm font-medium">
                <QrCode size={16} className="text-blue-400" />
                Pix · R$ {pixData.amount}
                <span className="text-zinc-600">·</span>
                +{pixData.credits} créditos
              </div>

              {pixData.qrCodeBase64 ? (
                <img
                  src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                  alt="QR Code Pix"
                  className="w-52 h-52 rounded-xl bg-white p-2"
                />
              ) : (
                <div className="w-52 h-52 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs">
                  QR indisponível
                </div>
              )}

              <div className="w-full flex items-center gap-2">
                <p className="flex-1 text-[11px] text-zinc-500 font-mono truncate bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
                  {pixData.qrCode || '—'}
                </p>
                <button
                  type="button"
                  onClick={copyPixCode}
                  className="shrink-0 p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-all"
                  title="Copiar código"
                >
                  <Copy size={14} />
                </button>
              </div>

              {pixData.ticketUrl && (
                <a
                  href={pixData.ticketUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
                >
                  Abrir no Mercado Pago <ExternalLink size={12} />
                </a>
              )}

              <div className="flex items-center gap-2 text-xs text-zinc-500">
                {pixStatus === 'pending' ? (
                  <>
                    <Loader2 size={13} className="animate-spin text-blue-400" />
                    Aguardando confirmação do Pix…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} className="text-emerald-400" />
                    Pagamento aprovado
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {view === 'success' && (
          <div className="p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-emerald-400" />
            </div>
            <p className="text-zinc-200 font-medium">Pix confirmado</p>
            <p className="text-sm text-zinc-500 max-w-sm">
              Os créditos já devem aparecer no teu saldo. Se ainda não, atualiza a página.
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
          <p className="px-6 pb-5 text-[11px] text-zinc-600 text-center">
            Pagamentos via Mercado Pago · webhook /api/billing/webhook
            {/* TODO(stripe): Stripe Checkout + stripe-signature */}
          </p>
        )}
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
