import React, { useState } from 'react';
import { X, Zap, Check, Sparkles, Rocket, Loader2 } from 'lucide-react';
import {
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { PLANS } from '../lib/plans';
import Toast from './Toast';

/**
 * PricingModal — Dark Premium Bento (Free / Pro / Turbo).
 *
 * Integração futura Stripe / Mercado Pago:
 * - Pro CTA → criar Preference/PaymentIntent + transaction pending
 * - Turbo PIX → Mercado Pago PIX QR
 * - Webhook POST /api/billing/webhook completa a transaction e incrementa credits (Admin)
 */
export default function PricingModal({ open, onClose, currentPlan = 'free' }) {
  const { user } = useAuth();
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

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
      // Estrutura pronta para o webhook completar (status → completed + credit Admin).
      // TODO(stripe|mp): trocar por POST /api/billing/checkout-intent e redirecionar checkoutUrl
      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        amount: plan.amount,
        credits: plan.credits,
        type: plan.type,
        plan: plan.id,
        status: 'pending',
        provider: plan.id === 'turbo' ? 'mercadopago' : 'stripe',
        createdAt: serverTimestamp(),
      });
      setToast({
        message: 'Em breve — pagamento será ativado em breve. Intent registado.',
        type: 'info',
      });
    } catch (err) {
      console.error('[PricingModal]', err);
      setToast({
        message: 'Em breve — upgrades pagos estarão disponíveis em breve.',
        type: 'info',
      });
    } finally {
      setBusyId(null);
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
        className="relative w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-5 border-b border-zinc-800">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 mb-1">
              Planos
            </p>
            <h2 className="text-xl font-bold text-zinc-100 tracking-tight">
              Escolhe o teu ritmo
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Créditos alimentam cada geração com a IA. Faz upgrade quando precisares.
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

        <p className="px-6 pb-5 text-[11px] text-zinc-600 text-center">
          Pagamentos processados via Stripe / Mercado Pago · webhook em /api/billing/webhook
        </p>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
