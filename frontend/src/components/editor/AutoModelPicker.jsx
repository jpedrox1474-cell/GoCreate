import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Settings2, Check, Crown, Sparkles, Zap, Cpu, Github } from 'lucide-react';
import {
  AI_MODELS,
  getPreferredAiProvider,
  setPreferredAiProvider,
  getAiModelMeta,
} from '../../lib/aiModels';
import { useAuth } from '../../context/AuthContext';
import { useCredits } from '../../context/CreditsContext';
import { canUsePremium } from '../../lib/plans';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function ProviderIcon({ id, className = '' }) {
  const cn = `shrink-0 ${className}`;
  if (id === 'auto') return <Settings2 size={15} className={cn} />;
  if (id === 'gemini') return <Sparkles size={15} className={cn} />;
  if (id === 'groq') return <Zap size={15} className={cn} />;
  if (id === 'openrouter') return <Cpu size={15} className={cn} />;
  if (id === 'github') return <Github size={15} className={cn} />;
  return <Settings2 size={15} className={cn} />;
}

/**
 * Botão estilo Cursor: engrenagem + "Auto" → popover "Escolher modelo".
 * Dark Mode Premium (zinc + blue), sem roxo Cursor.
 */
export default function AutoModelPicker({
  value,
  onChange,
  className = '',
  align = 'left',
  compact = false,
}) {
  const { user } = useAuth();
  const { openPricing, plan, role } = useCredits();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(() => value || getPreferredAiProvider());
  const [available, setAvailable] = useState(() => new Set(['auto']));
  const rootRef = useRef(null);
  const premiumOk = canUsePremium({ plan, role, email: user?.email });

  useEffect(() => {
    if (value != null) setSelected(value);
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/chat/providers`);
        if (!res.ok) throw new Error('fail');
        const data = await res.json();
        const list = Array.isArray(data?.providers) ? data.providers : [];
        if (!cancelled) setAvailable(new Set(['auto', ...list]));
      } catch {
        if (!cancelled) setAvailable(new Set(['auto', 'gemini', 'groq', 'openrouter', 'github']));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const meta = getAiModelMeta(selected);

  const pick = useCallback(
    (id) => {
      const model = AI_MODELS.find((m) => m.id === id);
      if (!model) return;
      if (model.premium && !premiumOk) {
        openPricing?.('Modelos premium estão nos planos pagos.');
        return;
      }
      if (id !== 'auto' && available.size > 1 && !available.has(id)) {
        return;
      }
      const next = setPreferredAiProvider(id);
      setSelected(next);
      onChange?.(next);
      setOpen(false);
    },
    [available, onChange, openPricing, premiumOk]
  );

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-lg border transition-all ${
          compact
            ? 'px-2 py-1 text-[11px]'
            : 'px-2.5 py-1.5 text-xs'
        } ${
          open
            ? 'border-blue-500/50 bg-zinc-800 text-zinc-100'
            : 'border-zinc-700/80 bg-zinc-900/80 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100'
        }`}
        title="Escolher modelo de IA"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Settings2 size={compact ? 12 : 13} className="text-zinc-400" />
        <span className="font-medium">{meta.label}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Escolher modelo"
          className={`absolute z-50 bottom-[calc(100%+8px)] w-[min(100vw-2rem,300px)] rounded-xl border border-zinc-700/90 bg-zinc-950 shadow-2xl shadow-black/50 overflow-hidden ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="px-3.5 pt-3.5 pb-2 border-b border-zinc-800/80">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-100">Escolher modelo</h3>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold border border-blue-500/40 text-blue-300 bg-blue-600/10">
                GoCreate+
              </span>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              Escolha o modelo certo para o seu app
            </p>
          </div>

          <ul className="max-h-[280px] overflow-y-auto py-1.5 custom-scrollbar">
            {AI_MODELS.map((m) => {
              const isSelected = selected === m.id;
              const keyMissing = m.id !== 'auto' && available.size > 1 && !available.has(m.id);
              const locked = m.premium && !premiumOk;
              const disabled = keyMissing;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => pick(m.id)}
                    className={`w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors disabled:opacity-40 ${
                      isSelected
                        ? 'bg-blue-600/15 text-zinc-100'
                        : 'hover:bg-zinc-900 text-zinc-300'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg border ${
                        isSelected
                          ? 'border-blue-500/40 bg-blue-600/20 text-blue-300'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                      }`}
                    >
                      <ProviderIcon id={m.icon} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{m.label}</span>
                        {(locked || m.premium) && (
                          <Crown size={12} className="text-amber-400 shrink-0" />
                        )}
                        {isSelected && <Check size={14} className="text-blue-400 ml-auto shrink-0" />}
                      </span>
                      <span className="block text-[11px] text-zinc-500 mt-0.5 leading-snug">
                        {keyMissing
                          ? 'Provider sem chave no servidor'
                          : m.note || m.description}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="p-2.5 border-t border-zinc-800/80 space-y-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openPricing?.();
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold py-2.5 transition-colors"
            >
              Ver planos
            </button>
            <div className="flex items-center justify-between px-1">
              <Link
                to="/settings"
                onClick={() => setOpen(false)}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Preferências
              </Link>
              <Link
                to="/plans"
                onClick={() => setOpen(false)}
                className="text-[11px] text-blue-400/90 hover:text-blue-300 transition-colors"
              >
                Comparar planos
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
