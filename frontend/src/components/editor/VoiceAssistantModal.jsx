import React, { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';

const CAPTION =
  'Entendi! Vou criar um Cardápio Digital com pagamento via PIX. Posso começar a construir?';
const BUILD_PROMPT = 'Crie um Cardápio Digital com pagamento via PIX';

const STATUS = {
  listening: 'Ouvindo...',
  thinking: 'Pensando...',
  speaking: 'A IA está falando',
};

/**
 * Modo Jarvis — MVP voice-to-voice UI with simulated listen → think → speak flow.
 * Props: open, onClose, onConfirmBuild(prompt)
 */
export default function VoiceAssistantModal({ open, onClose, onConfirmBuild }) {
  const [phase, setPhase] = useState('listening'); // listening | thinking | speaking
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!open) {
      setPhase('listening');
      setClosing(false);
      return undefined;
    }

    setPhase('listening');
    setClosing(false);

    const t1 = setTimeout(() => setPhase('thinking'), 3000);
    const t2 = setTimeout(() => setPhase('speaking'), 5000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const smoothClose = useCallback(
    (afterClose) => {
      setClosing(true);
      setTimeout(() => {
        setClosing(false);
        afterClose?.();
      }, 280);
    },
    []
  );

  const handleClose = useCallback(() => {
    smoothClose(() => onClose?.());
  }, [smoothClose, onClose]);

  const handleConfirm = useCallback(() => {
    smoothClose(() => {
      onConfirmBuild?.(BUILD_PROMPT);
      onClose?.();
    });
  }, [smoothClose, onConfirmBuild, onClose]);

  if (!open) return null;

  const orbClass = [
    'jarvis-orb',
    phase === 'listening' && 'jarvis-orb--listening',
    phase === 'thinking' && 'jarvis-orb--thinking',
    phase === 'speaking' && 'jarvis-orb--speaking',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center transition-opacity duration-300 ${
        closing ? 'opacity-0' : 'opacity-100'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Modo Jarvis"
    >
      <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md" onClick={handleClose} />

      <button
        type="button"
        onClick={handleClose}
        className="absolute top-5 right-5 z-10 p-2.5 rounded-full text-zinc-400 hover:text-zinc-100 bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur-md transition-all"
        aria-label="Fechar"
      >
        <X size={20} />
      </button>

      <div className="relative z-10 flex flex-col items-center px-6 max-w-lg w-full">
        <div className="relative flex items-center justify-center mb-10">
          {phase === 'speaking' && (
            <>
              <span className="jarvis-ring jarvis-ring--1" aria-hidden />
              <span className="jarvis-ring jarvis-ring--2" aria-hidden />
              <span className="jarvis-ring jarvis-ring--3" aria-hidden />
            </>
          )}
          <div className={orbClass} aria-hidden />
        </div>

        <p className="text-sm font-medium tracking-wide text-zinc-300 mb-3 transition-opacity duration-300">
          {STATUS[phase]}
        </p>

        {phase === 'speaking' && (
          <p className="text-center text-base sm:text-lg text-zinc-100 leading-relaxed mb-8 jarvis-caption-in">
            {CAPTION}
          </p>
        )}

        {phase === 'speaking' && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto jarvis-actions-in">
            <button
              type="button"
              onClick={handleConfirm}
              className="jarvis-glass-btn jarvis-glass-btn--primary px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all"
            >
              Sim, construir
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="jarvis-glass-btn px-6 py-3 rounded-xl text-sm font-medium text-zinc-300 hover:text-white transition-all"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
