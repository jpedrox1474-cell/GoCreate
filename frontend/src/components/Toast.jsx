import React, { useEffect } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

export default function Toast({ message, type = 'info', onClose, duration = 2800 }) {
  useEffect(() => {
    if (!message || !duration || duration < 0) return undefined;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [message, duration, onClose]);

  if (!message) return null;

  const Icon = ICONS[type] || Info;

  return (
    <div className="fixed bottom-6 right-6 z-[100] animate-in">
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 shadow-2xl shadow-black/40 max-w-sm">
        <Icon
          size={18}
          className={
            type === 'success' ? 'text-emerald-400' : type === 'error' ? 'text-red-400' : 'text-blue-400'
          }
        />
        <p className="text-sm flex-1">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-zinc-500 hover:text-zinc-200 rounded transition-all"
          aria-label="Fechar"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
