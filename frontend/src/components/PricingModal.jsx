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
  CreditCard,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PLANS } from '../lib/plans';
import {
  createPayment,
  createStripeCheckout,
  getBillingProviders,
  getPaymentStatus,
} from '../lib/billingApi';
import MercadoPagoCheckout from './MercadoPagoCheckout';
import Toast from './Toast';

/**
 * PricingModal — Dark Premium Bento (Free / Pro / Turbo).
 *
 * Mercado Pago:
 * - Pro → Payment Brick embutido (Pix, boleto, cartão, Conta MP)
 * - Turbo → Pix QR + polling /api/billing/status
 * Stripe (optional):
 * - Pro → Checkout Session (cartão internacional)
 */
export default function PricingModal({ open, onClose, currentPlan = 'free', message = null }) {
  const { user } = useAuth();
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);
  const [view, setView] = useState('plans'); // plans | brick | pending | success
  const [pixData, setPixData] = useState(null);
  const [pixStatus, setPixStatus] = useState('pending');
  const [brickSession, setBrickSession] = useState(null);
  const [brickIdToken, setBrickIdToken] = useState(null);
  const [stripeReady, setStripeReady] = useState(false);
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
      setBrickSession(null);
      setBrickIdToken(null);
      setBusyId(null);
      return;
    }
    getBillingProviders().then((p) => setStripeReady(Boolean(p?.stripe)));
  }, [open, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

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
      }, 3500);
    },
    [user, stopPolling]
  );

  if (!open) return null;

  function resetToPlans() {
    stopPolling();
    setView('plans');
    setPixData(null);
    setBrickSession(null);
    setBrickIdToken(null);
    setPixStatus('pending');
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
    try {
      const idToken = await user.getIdToken();
      const result = await createPayment({ productId: plan.id, idToken });

      if (result.mode === 'brick') {
        setBrickSession(result);
        setBrickIdToken(idToken);
        setView('brick');
        return;
      }

      if (result.mode === 'checkout' && result.checkoutUrl) {
        setToast({ message: 'A abrir checkout Mercado Pago…', type: 'info' });
        window.location.href = result.checkoutUrl;
        return;
      }

      if (result.mode === 'pix') {
        setPixData(result);
        setPixStatus('pending');
        setView('pending');
        startStatusPolling(result.transactionId);
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

  async function handleStripePro() {
    if (!user?.uid) {
      setToast({ message: 'Inicia sessão para continuar.', type: 'error' });
      return;
    }
    setBusyId('stripe-pro');
    try {
      const idToken = await user.getIdToken();
      const result = await createStripeCheckout({ productId: 'pro', idToken });
      if (result.checkoutUrl) {
        setToast({ message: 'A redirecionar para o Stripe…', type: 'info' });
        window.location.href = result.checkoutUrl;
        return;
      }
      setToast({ message: 'Resposta Stripe inesperada.', type: 'error' });
    } catch (err) {
      console.error('[PricingModal] stripe:', err);
      if (err?.code === 'STRIPE_NOT_CONFIGURED' || err?.status === 503) {
        setToast({
          message: 'Stripe ainda não configurado no servidor (STRIPE_SECRET_KEY).',
          type: 'error',
        });
      } else {
        setToast({ message: err?.message || 'Falha ao iniciar Stripe Checkout.', type: 'error' });
      }
    } finally {
      setBusyId(null);
    }
  }

  function handleBrickResult(result) {
    if (!result) return;

    if (result.status === 'approved' || result.alreadyCompleted) {
      stopPolling();
      setPixStatus('completed');
      setView('success');
      setToast({ message: 'Pagamento aprovado. Plano Pro ativado.', type: 'success' });
      return;
    }

    // Pix / boleto / pending — mostrar QR ou bilhete e poll
    if (
      result.status === 'pending' ||
      result.status === 'in_process' ||
      result.qrCode ||
      result.qrCodeBase64 ||
      result.ticketUrl
    ) {
      setPixData({
        ...result,
        amount: result.amount ?? brickSession?.amount,
        credits: result.credits ?? brickSession?.credits,
      });
      setPixStatus('pending');
      setView('pending');
      if (result.transactionId) {
        startStatusPolling(result.transactionId);
      }
      setToast({
        message:
          result.qrCode || result.qrCodeBase64
            ? 'Pix gerado — paga para ativar o Pro.'
            : result.ticketUrl
              ? 'Boleto gerado — paga para ativar o Pro.'
              : 'Pagamento pendente — aguardando confirmação.',
        type: 'info',
      });
      return;
    }

    if (result.status === 'rejected') {
      setToast({
        message: result.statusDetail
          ? `Pagamento recusado (${result.statusDetail}).`
          : 'Pagamento recusado. Tenta outro método.',
        type: 'error',
      });
      return;
    }

    setToast({
      message: `Estado: ${result.status || 'desconhecido'}.`,
      type: 'info',
    });
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

  const headerTitle =
    view === 'brick'
      ? 'Checkout Pro'
      : view === 'pending'
        ? pixData?.qrCode || pixData?.qrCodeBase64
          ? 'Pagar com Pix'
          : pixData?.ticketUrl
            ? 'Boleto / bilhete'
            : 'Aguardando pagamento'
        : view === 'success'
          ? 'Pagamento confirmado'
          : 'Escolhe o teu ritmo';

  const headerSub =
    view === 'brick'
      ? 'Paga aqui mesmo — Pix, boleto, cartão ou Conta Mercado Pago.'
      : view === 'pending'
        ? pixData?.qrCode || pixData?.qrCodeBase64
          ? 'Escaneia o QR ou copia o código. Os créditos entram assim que for aprovado.'
          : 'Usa o link do bilhete. Ativamos o plano assim que o pagamento for confirmado.'
        : view === 'success'
          ? 'Créditos e plano atualizados na tua conta.'
          : message || 'Créditos alimentam cada geração com a IA. Faz upgrade quando precisares.';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full gc-themed bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden ${
          view === 'brick' ? 'max-w-xl max-h-[92vh] flex flex-col' : 'max-w-5xl'
        }`}
      >
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(37,99,235,0.12),transparent_60%)]" />

        <div className="relative flex items-start justify-between gap-4 px-5 sm:px-7 py-5 border-b border-zinc-800 shrink-0">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 mb-1">
              Planos
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
                          <Loader2 size={14} className="animate-spin" /> A processar…
                        </span>
                      ) : isCurrent ? (
                        'Plano atual'
                      ) : (
                        plan.cta
                      )}
                    </button>

                    {isPro && !isCurrent && (
                      <button
                        type="button"
                        disabled={busyId === 'stripe-pro'}
                        onClick={handleStripePro}
                        className="relative mt-2 w-full py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white border border-zinc-700/80 hover:border-zinc-500 bg-zinc-950/60 transition-all disabled:opacity-50"
                        title={
                          stripeReady
                            ? 'Cartão internacional via Stripe Checkout'
                            : 'Stripe: adiciona STRIPE_SECRET_KEY no servidor'
                        }
                      >
                        {busyId === 'stripe-pro' ? (
                          <span className="inline-flex items-center gap-2 justify-center">
                            <Loader2 size={12} className="animate-spin" /> Stripe…
                          </span>
                        ) : (
                          'Cartão internacional (Stripe)'
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === 'brick' && brickSession && brickIdToken && (
          <div className="relative p-5 sm:p-6 overflow-y-auto flex-1">
            <button
              type="button"
              onClick={resetToPlans}
              className="mb-4 inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-all"
            >
              <ArrowLeft size={13} /> Voltar aos planos
            </button>

            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <CreditCard size={15} />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-100">GoCreate Pro</p>
                  <p className="text-[11px] text-zinc-500">+{brickSession.credits} créditos/mês</p>
                </div>
              </div>
              <p className="text-lg font-bold text-zinc-50">
                R$ {Number(brickSession.amount).toFixed(2).replace('.', ',')}
              </p>
            </div>

            <MercadoPagoCheckout
              publicKey={brickSession.publicKey}
              amount={brickSession.amount}
              preferenceId={brickSession.preferenceId}
              transactionId={brickSession.transactionId}
              payerEmail={brickSession.payerEmail || user?.email}
              idToken={brickIdToken}
              onResult={handleBrickResult}
              onError={(err) => {
                setToast({
                  message: err?.message || 'Erro no checkout Mercado Pago.',
                  type: 'error',
                });
              }}
            />
          </div>
        )}

        {view === 'pending' && pixData && (
          <div className="relative p-5 sm:p-8 flex flex-col items-center gap-5">
            <button
              type="button"
              onClick={resetToPlans}
              className="self-start inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-all"
            >
              <ArrowLeft size={13} /> Voltar aos planos
            </button>

            <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 text-zinc-200 text-sm font-medium">
                <QrCode size={16} className="text-blue-400" />
                {pixData.qrCode || pixData.qrCodeBase64 ? 'Pix' : 'Pagamento'} · R${' '}
                {pixData.amount}
                {pixData.credits != null && (
                  <>
                    <span className="text-zinc-600">·</span>+{pixData.credits} créditos
                  </>
                )}
              </div>

              {pixData.qrCodeBase64 ? (
                <img
                  src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                  alt="QR Code Pix"
                  className="w-52 h-52 rounded-xl bg-white p-2"
                />
              ) : pixData.qrCode ? (
                <div className="w-52 h-52 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs text-center px-4">
                  Usa o código copia-e-cola abaixo
                </div>
              ) : null}

              {pixData.qrCode && (
                <div className="w-full flex items-center gap-2">
                  <p className="flex-1 text-[11px] text-zinc-400 font-mono truncate bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
                    {pixData.qrCode}
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
              )}

              {pixData.ticketUrl && (
                <a
                  href={pixData.ticketUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
                >
                  Abrir boleto / bilhete <ExternalLink size={12} />
                </a>
              )}

              {pixData.barcode && (
                <p className="w-full text-[11px] text-zinc-400 font-mono break-all bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
                  {pixData.barcode}
                </p>
              )}

              <div className="flex items-center gap-2 text-xs text-zinc-400">
                {pixStatus === 'pending' ? (
                  <>
                    <Loader2 size={13} className="animate-spin text-blue-400" />
                    Aguardando confirmação…
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
            Mercado Pago (Pix, boleto, cartão) · Stripe opcional (cartão internacional)
          </p>
        )}
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
