import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
const PANEL_W = 300;
const PANEL_GAP = 8;
const VIEW_PAD = 8;
/** Approx height: header + 5 models + footer */
const PANEL_H_EST = 420;

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
 * Portal em document.body (fixed) para não ser cortado por overflow-hidden do composer.
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
  const [coords, setCoords] = useState({ top: 0, left: 0, placement: 'above' });
  const btnRef = useRef(null);
  const panelRef = useRef(null);
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

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuW = Math.min(PANEL_W, window.innerWidth - VIEW_PAD * 2);
    const measuredH = panelRef.current?.offsetHeight || PANEL_H_EST;

    let left = align === 'right' ? r.right - menuW : r.left;
    left = Math.max(VIEW_PAD, Math.min(left, window.innerWidth - menuW - VIEW_PAD));

    const spaceAbove = r.top - VIEW_PAD;
    const spaceBelow = window.innerHeight - r.bottom - VIEW_PAD;
    const preferAbove = spaceAbove >= measuredH || spaceAbove >= spaceBelow;

    let top;
    let placement;
    if (preferAbove) {
      top = Math.max(VIEW_PAD, r.top - measuredH - PANEL_GAP);
      placement = 'above';
    } else {
      top = Math.min(r.bottom + PANEL_GAP, window.innerHeight - measuredH - VIEW_PAD);
      top = Math.max(VIEW_PAD, top);
      placement = 'below';
    }

    setCoords({ top, left, placement, width: menuW });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    // Re-measure after paint so real panel height flips correctly
    const raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;

    const onDoc = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };

    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, place]);

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

  const panel =
    open &&
    createPortal(
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Escolher modelo"
        style={{
          top: coords.top,
          left: coords.left,
          width: coords.width || PANEL_W,
        }}
        className="fixed z-[100] rounded-xl border border-zinc-700/90 bg-zinc-950 shadow-2xl shadow-black/50 overflow-hidden"
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

        <ul className="max-h-[min(280px,50vh)] overflow-y-auto py-1.5 custom-scrollbar">
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
      </div>,
      document.body
    );

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        ref={btnRef}
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
      {panel}
    </div>
  );
}
