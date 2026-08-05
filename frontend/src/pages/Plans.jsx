import React from 'react';
import { Link } from 'react-router-dom';
import { Check, Crown, Sparkles, Zap, ArrowLeft } from 'lucide-react';
import { PLANS } from '../lib/plans';
import { useAuth } from '../context/AuthContext';
import { useCredits } from '../context/CreditsContext';
import Logo from '../components/Logo';
import VideoBackground from '../components/VideoBackground';
import UserMenu from '../components/UserMenu';

/**
 * Página pública /plans — comparação de planos (pedido do vídeo Base44).
 */
export default function Plans() {
  const { user } = useAuth();
  const { plan, openPricing } = useCredits();

  return (
    <div className="relative min-h-screen text-zinc-300">
      <VideoBackground />
      <div className="relative z-10 min-h-screen bg-zinc-950/70">
        <header className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <Logo to="/" variant="dark" size="sm" />
            <Link
              to={user ? '/dashboard' : '/'}
              className="hidden sm:inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
            >
              <ArrowLeft size={12} />
              Voltar
            </Link>
          </div>
          {user ? <UserMenu variant="header" /> : (
            <Link to="/login" className="text-xs font-medium text-blue-400 hover:text-blue-300">
              Entrar
            </Link>
          )}
        </header>

        <main className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
          <div className="text-center mb-10">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-blue-300/90 mb-3">
              <Sparkles size={12} /> Planos GoCreate
            </p>
            <h1 className="text-3xl sm:text-4xl font-semibold text-zinc-50 tracking-tight">
              Escolhe o plano certo
            </h1>
            <p className="mt-3 text-sm sm:text-base text-zinc-400 max-w-xl mx-auto">
              Comparação clara: créditos, badge, GitHub, domínios e recursos premium — como no Base44, no layout GoCreate.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {PLANS.map((p) => {
              const current = (plan || 'free') === p.id || (p.id === 'pro' && plan === 'enterprise_master');
              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border p-5 flex flex-col ${
                    p.highlight
                      ? 'border-blue-500/50 bg-zinc-900/90 shadow-lg shadow-blue-950/30'
                      : 'border-zinc-800 bg-zinc-950/80'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-lg font-semibold text-zinc-100">{p.name}</h2>
                    {p.highlight && <Crown size={16} className="text-amber-400" />}
                  </div>
                  <p className="text-2xl font-bold text-zinc-50">
                    {p.priceLabel}
                    <span className="text-sm font-normal text-zinc-500">{p.period}</span>
                  </p>
                  <ul className="mt-4 space-y-2 flex-1">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-zinc-400">
                        <Check size={14} className="text-blue-400 mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    disabled={current && p.id !== 'turbo'}
                    onClick={() => {
                      if (!user) {
                        window.location.href = '/login';
                        return;
                      }
                      openPricing();
                    }}
                    className={`mt-5 w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      current && p.id !== 'turbo'
                        ? 'bg-zinc-800 text-zinc-500 cursor-default'
                        : p.highlight
                          ? 'bg-blue-600 hover:bg-blue-500 text-white'
                          : 'bg-zinc-100 hover:bg-white text-zinc-950'
                    }`}
                  >
                    {current && p.id !== 'turbo' ? 'Plano atual' : p.cta}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="mt-8 text-center text-xs text-zinc-600 flex items-center justify-center gap-1">
            <Zap size={11} /> Pagamentos via Mercado Pago (Pix, cartão e mais).
          </p>
        </main>
      </div>
    </div>
  );
}
