import React from 'react';
import { Zap, Infinity as InfinityIcon } from 'lucide-react';
import { useCredits } from '../context/CreditsContext';
import { formatCreditsLabel } from '../lib/plans';

/** Pill de créditos — clica para abrir PricingModal. Owner: Ilimitado. */
export default function CreditsBadge({ className = '' }) {
  const { credits, loading, lowCredits, openPricing, unlimited } = useCredits();

  const label = formatCreditsLabel({ credits, unlimited, loading });

  return (
    <button
      type="button"
      onClick={() => openPricing()}
      title={unlimited ? 'Plano Owner — créditos ilimitados' : 'Ver planos e créditos'}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-all ${
        unlimited
          ? 'border-emerald-600/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40'
          : lowCredits
            ? 'border-amber-600/50 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50'
            : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-blue-500/40 hover:text-zinc-100'
      } ${className}`}
    >
      {unlimited ? (
        <InfinityIcon size={12} className="text-emerald-400" />
      ) : (
        <Zap
          size={12}
          className={lowCredits ? 'text-amber-400 fill-amber-400/30' : 'text-blue-400'}
        />
      )}
      <span className={unlimited ? '' : lowCredits ? 'text-amber-300' : ''}>
        {unlimited ? '∞ Ilimitado' : `${label} Créditos`}
      </span>
    </button>
  );
}
