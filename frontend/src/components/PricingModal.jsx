import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Zap,
  Check,
  Sparkles,
  Rocket,
  Loader2,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PLANS } from '../lib/plans';
import { createPayment, getBillingConfig, getPaymentStatus } from '../lib/billingApi';
import MercadoPagoCheckout from './MercadoPagoCheckout';
import Toast from './Toast';

/**
 * PricingModal — Free / Pro / Turbo.
 * Assinar Pro e Turbo → Payment Brick Mercado Pago in-app
 * (Pix, cartão, boleto, Conta MP — a pessoa escolhe no Brick).
 */
export default function PricingModal({ open, onClose, currentPlan = 'free', message = null }) {
  const { user } = useAuth();
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);
  const [view, setView] = useState('plans'); // plans | checkout | success
  const [checkout, setCheckout] = useState(null);
  const [payStatus, setPayStatus] = useState('pending');
  const [idToken, setIdToken] = useState(null);
  /** Default true — billing ON; só desliga se /config disser explicitamente. */
  const [mpBillingOn, setMpBillingOn] = useState(true);
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
      setCheckout(null);
      setPayStatus('pending');
      setBusyId(null);
      setIdToken(null);
      return;
    }
    let cancelled = false;
    getBillingConfig().then((cfg) => {
      if (cancelled) return;
      // Só “Em breve” se o kill switch estiver explicitamente off.
      setMpBillingOn(cfg?.mercadopagoBillingEnabled !== false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    if (view !== 'checkout' || !user || !checkout?.transactionId) {
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        if (!cancelled) setIdToken(token || null);
      } catch {
        if (!cancelled) setIdToken(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, user, checkout?.transactionId]);

  const startStatusPolling = useCallback(
    (transactionId) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          if (!user) return;
          const token = await user.getIdToken();
          const status = await getPaymentStatus({ transactionId, idToken: token });
          if (status?.status === 'completed') {
            setPayStatus('completed');
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
    setView('plans');
    setCheckout(null);
    setPayStatus('pending');
    setIdToken(null);
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
      const token = await user.getIdToken();
      const result = await createPayment({ productId: plan.id, idToken: token });

      if (result.mode === 'brick' && result.preferenceId && result.publicKey) {
        setCheckout({
          transactionId: result.transactionId,
          preferenceId: result.preferenceId,
          publicKey: result.publicKey,
          amount: result.amount,
          credits: result.credits,
          plan: result.plan,
          title: result.title,
        });
        setIdToken(token);
        setPayStatus('pending');
        setView('checkout');
        startStatusPolling(result.transactionId);
        return;
      }

      if (result.mode === 'brick' && !result.publicKey) {
        setToast({
          message:
            'Chave pública Mercado Pago em falta. Configure MERCADOPAGO_PUBLIC_KEY no servidor.',
          type: 'error',
        });
        return;
      }

      if (result.mode === 'checkout' || result.checkoutUrl) {
        setToast({
          message: 'Checkout transparente indisponível. Verifica MERCADOPAGO_PUBLIC_KEY.',
          type: 'error',
        });
        return;
      }

      setToast({ message: 'Resposta de pagamento inesperada.', type: 'error' });
    } catch (err) {
      console.error('[PricingModal]', err);
      if (err?.code === 'MP_PUBLIC_KEY_MISSING') {
        setToast({
          message:
            'Checkout Mercado Pago precisa de MERCADOPAGO_PUBLIC_KEY no servidor (não há QR fake).',
          type: 'error',
        });
      } else if (err?.code === 'MP_NOT_CONFIGURED' || err?.code === 'MP_BILLING_DISABLED' || err?.status === 503) {
        setToast({
          message: err?.message || 'Mercado Pago ainda não configurado no servidor.',
          type: 'error',
        });
      } else {
        setToast({
          message: err?.message || 'Falha ao iniciar pagamento Mercado Pago.',
          type: 'error',
        });
      }
    } finally {
      setBusyId(null);
    }
  }

  function handleBrickResult(result) {
    if (result?.status === 'approved' || result?.alreadyCompleted) {
      setPayStatus('completed');
      setView('success');
      stopPolling();
      return;
    }
    setPayStatus('pending');
    if (checkout?.transactionId) {
      startStatusPolling(checkout.transactionId);
    }
    setToast({
      message:
        result?.status === 'pending' || result?.status === 'in_process'
          ? 'Pagamento pendente. Confirmamos assim que o Mercado Pago aprovar.'
          : 'Pagamento enviado. Aguardando confirmação…',
      type: 'info',
    });
  }

  function handleBrickError(err) {
    setToast({
      message: err?.message || 'Erro no checkout Mercado Pago.',
      type: 'error',
    });
  }

  const amountLabel =
    checkout?.amount != null
      ? `R$ ${Number(checkout.amount).toFixed(2).replace('.', ',')}`
      : '';

  const headerTitle =
    view === 'checkout'
      ? 'Pagar com Mercado Pago'
      : view === 'success'
        ? 'Pagamento confirmado'
        : 'Escolhe o teu ritmo';

  const headerSub =
    view === 'checkout'
      ? 'Escolhe Pix, cartão, boleto ou Conta Mercado Pago. Ativamos o plano assim que for aprovado.'
      : view === 'success'
        ? 'Créditos e plano atualizados na tua conta.'
        : message ||
          (mpBillingOn
            ? 'Créditos alimentam cada geração com a IA. Faz upgrade quando precisares.'
            : 'Créditos alimentam cada geração com a IA. Assinatura Pro em breve.');

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
        onClick={view === 'checkout' ? undefined : onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full gc-themed bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden ${
          view === 'checkout'
            ? 'max-w-lg max-h-[92vh] flex flex-col'
            : view === 'success'
              ? 'max-w-md'
              : 'max-w-5xl'
        }`}
      >
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(37,99,235,0.12),transparent_60%)]" />

        <div className="relative flex items-start justify-between gap-4 px-5 sm:px-7 py-5 border-b border-zinc-800 shrink-0">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 mb-1">
              {view === 'checkout' ? 'Checkout' : 'Planos'}
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
                      disabled={
                        isCurrent ||
                        busyId === plan.id ||
                        (plan.amount > 0 && !mpBillingOn)
                      }
                      onClick={() => handleSelect(plan)}
                      className={`relative w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
                        plan.amount > 0 && mpBillingOn
                          ? isPro
                            ? 'text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/30 ring-1 ring-blue-400/30'
                            : 'text-zinc-950 bg-zinc-100 hover:bg-white'
                          : 'text-zinc-400 bg-zinc-800/80 border border-zinc-700 cursor-default'
                      }`}
                    >
                      {busyId === plan.id ? (
                        <span className="inline-flex items-center gap-2 justify-center">
                          <Loader2 size={14} className="animate-spin" /> A abrir Mercado Pago…
                        </span>
                      ) : isCurrent ? (
                        'Plano atual'
                      ) : plan.amount > 0 && !mpBillingOn ? (
                        'Em breve'
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

        {view === 'checkout' && checkout && (
          <div className="relative p-5 sm:p-7 flex flex-col gap-4 overflow-y-auto min-h-0 flex-1">
            <button
              type="button"
              onClick={resetToPlans}
              className="self-start inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-all"
            >
              <ArrowLeft size={13} /> Voltar aos planos
            </button>

            <div className="w-full flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-zinc-100">
                  {checkout.plan === 'pro' || checkout.title?.includes?.('Pro')
                    ? 'GoCreate Pro'
                    : 'GoCreate Turbo'}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {checkout.credits != null
                    ? `+${checkout.credits} créditos`
                    : 'Pagamento Mercado Pago'}
                </p>
              </div>
              <p className="text-xl font-bold tracking-tight text-zinc-50">{amountLabel}</p>
            </div>

            {!idToken ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-400">
                <Loader2 size={16} className="animate-spin text-blue-400" />
                A preparar sessão de pagamento…
              </div>
            ) : (
              <MercadoPagoCheckout
                key={checkout.transactionId}
                publicKey={checkout.publicKey}
                amount={checkout.amount}
                preferenceId={checkout.preferenceId}
                transactionId={checkout.transactionId}
                payerEmail={user?.email || null}
                idToken={idToken}
                onResult={handleBrickResult}
                onError={handleBrickError}
              />
            )}

            {payStatus === 'pending' && (
              <div className="flex items-center gap-2 text-sm text-zinc-400 justify-center">
                <Loader2 size={14} className="animate-spin text-blue-400" />
                Aguardando confirmação do Mercado Pago…
              </div>
            )}
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
            Pagamento via Mercado Pago · Pix, cartão ou boleto · sem sair do GoCreate
          </p>
        )}
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
