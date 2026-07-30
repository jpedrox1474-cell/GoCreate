import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function ModalShell({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${wide ? 'max-w-lg' : 'max-w-md'} bg-zinc-900 border border-zinc-800/80 rounded-xl shadow-2xl overflow-hidden`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-all"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4 text-zinc-300">{children}</div>
      </div>
    </div>
  );
}
