import React from 'react';
import { Zap } from 'lucide-react';
import { useCredits } from '../context/CreditsContext';

/** Pill de créditos — clica para abrir PricingModal. Alerta se &lt; 10. */
export default function CreditsBadge({ className = '' }) {
  const { credits, loading, lowCredits, openPricing } = useCredits();

  return (
    <button
      type="button"
      onClick={openPricing}
      title="Ver planos e créditos"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-all ${
        lowCredits
          ? 'border-amber-600/50 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50'
          : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-blue-500/40 hover:text-zinc-100'
      } ${className}`}
    >
      <Zap
        size={12}
        className={lowCredits ? 'text-amber-400 fill-amber-400/30' : 'text-blue-400'}
      />
      <span className={lowCredits ? 'text-amber-300' : ''}>
        {loading ? '…' : credits} Créditos
      </span>
    </button>
  );
}
