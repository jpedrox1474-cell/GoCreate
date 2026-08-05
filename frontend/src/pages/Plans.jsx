import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Crown, Sparkles, Zap, ArrowLeft, Loader2 } from 'lucide-react';
import { PLANS } from '../lib/plans';
import { useAuth } from '../context/AuthContext';
import { useCredits } from '../context/CreditsContext';
import { useTheme } from '../context/ThemeContext';
import Logo from '../components/Logo';
import VideoBackground from '../components/VideoBackground';
import UserMenu from '../components/UserMenu';

/**
 * Página pública /plans — comparação de planos (pedido do vídeo Base44).
 * CTAs pagos abrem o Payment Brick Mercado Pago direto (sem modal de planos).
 * Respeita tema claro/escuro (gc-app-shell + tokens light).
 */
export default function Plans() {
  const { user } = useAuth();
  const { plan, openCheckout } = useCredits();
  const { isLight } = useTheme();
  const [busyId, setBusyId] = useState(null);

  function handlePaidCta(productId) {
    if (!user) {
      window.location.href = '/login';
      return;
    }
    setBusyId(productId);
    openCheckout(productId);
    setTimeout(() => setBusyId(null), 800);
  }

  return (
    <div className={`gc-app-shell relative min-h-screen ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
      {!isLight && <VideoBackground />}
      <div
        className={`relative z-10 min-h-screen ${
          isLight ? 'bg-zinc-50' : 'bg-zinc-950/70'
        }`}
      >
        <header
          className={`flex items-center justify-between px-4 sm:px-6 h-14 border-b ${
            isLight ? 'border-zinc-200 bg-white/80 backdrop-blur-md' : 'border-zinc-800/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <Logo to="/" variant={isLight ? 'light' : 'dark'} size="sm" />
            <Link
              to={user ? '/dashboard' : '/'}
              className={`hidden sm:inline-flex items-center gap-1 text-xs ${
                isLight ? 'text-zinc-500 hover:text-zinc-800' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <ArrowLeft size={12} />
              Voltar
            </Link>
          </div>
          {user ? (
            <UserMenu variant="header" />
          ) : (
            <Link
              to="/login"
              className={`text-xs font-medium ${
                isLight ? 'text-blue-600 hover:text-blue-500' : 'text-blue-400 hover:text-blue-300'
              }`}
            >
              Entrar
            </Link>
          )}
        </header>

        <main className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
          <div className="text-center mb-10">
            <p
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-3 ${
                isLight ? 'text-blue-600' : 'text-blue-300/90'
              }`}
            >
              <Sparkles size={12} /> Planos GoCreate
            </p>
            <h1
              className={`text-3xl sm:text-4xl font-semibold tracking-tight ${
                isLight ? 'text-zinc-900' : 'text-zinc-50'
              }`}
            >
              Escolhe o plano certo
            </h1>
            <p
              className={`mt-3 text-sm sm:text-base max-w-xl mx-auto ${
                isLight ? 'text-zinc-600' : 'text-zinc-400'
              }`}
            >
              Créditos, badge, GitHub, domínio, colaboradores e recursos premium — comparação clara no estilo Base44.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3 md:items-stretch">
            {PLANS.map((p) => {
              const current =
                (plan || 'free') === p.id || (p.id === 'pro' && plan === 'enterprise_master');
              const isPaid = p.amount > 0;
              const disabled = (current && p.id !== 'turbo') || busyId === p.id;

              return (
                <div
                  key={p.id}
                  className={`relative rounded-2xl border p-5 sm:p-6 flex flex-col h-full min-h-[420px] ${
                    p.highlight
                      ? isLight
                        ? 'border-blue-500/60 bg-white shadow-lg shadow-blue-100/80'
                        : 'border-blue-500/50 bg-zinc-900/90 shadow-lg shadow-blue-950/30'
                      : isLight
                        ? 'border-zinc-200 bg-white'
                        : 'border-zinc-800 bg-zinc-950/80'
                  }`}
                >
                  {p.highlight && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-900/40">
                      Popular
                    </span>
                  )}

                  <div className="flex items-center justify-between mb-1 min-h-[28px]">
                    <h2
                      className={`text-lg font-semibold ${isLight ? 'text-zinc-900' : 'text-zinc-100'}`}
                    >
                      {p.name}
                    </h2>
                    {p.highlight && <Crown size={16} className="text-amber-400 shrink-0" />}
                  </div>

                  <p
                    className={`text-2xl font-bold leading-tight ${
                      isLight ? 'text-zinc-900' : 'text-zinc-50'
                    }`}
                  >
                    {p.priceLabel}
                    <span
                      className={`text-sm font-normal ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}
                    >
                      {p.period}
                    </span>
                  </p>
                  <p className="text-xs text-zinc-500 mt-1.5 min-h-[16px]">
                    {p.credits} créditos
                    {p.type === 'subscription' ? (p.id === 'free' ? '/dia' : '/mês') : ' únicos'}
                  </p>

                  <ul className="mt-5 space-y-2.5 flex-1">
                    {p.features.map((f) => (
                      <li
                        key={f}
                        className={`flex items-start gap-2 text-sm leading-snug ${
                          isLight ? 'text-zinc-600' : 'text-zinc-400'
                        }`}
                      >
                        <Check
                          size={14}
                          className={`mt-0.5 shrink-0 ${isLight ? 'text-blue-600' : 'text-blue-400'}`}
                        />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (!isPaid) return;
                      handlePaidCta(p.id);
                    }}
                    className={`mt-6 w-full py-2.5 rounded-lg text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 ${
                      current && p.id !== 'turbo'
                        ? isLight
                          ? 'bg-zinc-100 text-zinc-500 cursor-default'
                          : 'bg-zinc-800 text-zinc-500 cursor-default'
                        : p.highlight
                          ? 'bg-blue-600 hover:bg-blue-500 text-white'
                          : isLight
                            ? 'bg-zinc-900 hover:bg-zinc-800 text-white'
                            : 'bg-zinc-100 hover:bg-white text-zinc-950'
                    }`}
                  >
                    {busyId === p.id ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        A abrir Mercado Pago…
                      </>
                    ) : current && p.id !== 'turbo' ? (
                      'Plano atual'
                    ) : (
                      p.cta
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          <p
            className={`mt-8 text-center text-xs flex items-center justify-center gap-1 ${
              isLight ? 'text-zinc-500' : 'text-zinc-600'
            }`}
          >
            <Zap size={11} /> Pagamentos via Mercado Pago (Pix, cartão e mais).
          </p>
        </main>
      </div>
    </div>
  );
}
