import React, { useCallback, useRef, useState } from 'react';
import ModalShell from './ModalShell';

/**
 * Confirmação no estilo GoCreate (ModalShell), substitui window.confirm.
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Confirmar',
  message,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  destructive = true,
  busy = false,
}) {
  return (
    <ModalShell
      open={open}
      onClose={busy ? undefined : onClose}
      title={title}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-all disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`px-3 py-1.5 text-xs font-semibold text-white rounded-lg transition-all disabled:opacity-40 ${
              destructive
                ? 'bg-red-600 hover:bg-red-500 shadow-md shadow-red-900/20'
                : 'bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-900/20'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{message}</p>
    </ModalShell>
  );
}

/**
 * Hook: const [askConfirm, confirmDialog] = useConfirm();
 * if (!(await askConfirm({ title, message }))) return;
 */
export function useConfirm() {
  const [cfg, setCfg] = useState(null);
  const resolveRef = useRef(null);

  const askConfirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setCfg({
        title: options.title || 'Confirmar',
        message: options.message || 'Tens a certeza?',
        confirmLabel: options.confirmLabel || 'Eliminar',
        cancelLabel: options.cancelLabel || 'Cancelar',
        destructive: options.destructive !== false,
      });
    });
  }, []);

  const finish = useCallback((result) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setCfg(null);
    resolve?.(result);
  }, []);

  const confirmDialog = (
    <ConfirmDialog
      open={Boolean(cfg)}
      title={cfg?.title}
      message={cfg?.message}
      confirmLabel={cfg?.confirmLabel}
      cancelLabel={cfg?.cancelLabel}
      destructive={cfg?.destructive !== false}
      onClose={() => finish(false)}
      onConfirm={() => finish(true)}
    />
  );

  return [askConfirm, confirmDialog];
}
