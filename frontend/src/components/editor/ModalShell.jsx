import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function ModalShell({ open, onClose, title, children, wide, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative my-auto w-full ${wide ? 'max-w-lg' : 'max-w-md'} max-h-[min(90vh,900px)] flex flex-col gc-themed bg-zinc-900 border border-zinc-800/80 rounded-xl shadow-2xl overflow-hidden`}
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-zinc-800/80 bg-zinc-900 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-500 transition-all hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X size={16} />
          </button>
        </div>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4 text-zinc-300">
          {children}
        </div>
        {footer ? (
          <div className="sticky bottom-0 z-10 shrink-0 border-t border-zinc-800/80 bg-zinc-900 px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
