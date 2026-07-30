import React, { useEffect, useState, useCallback, useRef } from 'react';
import { X } from 'lucide-react';

const FALLBACK_PROMPT = 'Crie um Cardápio Digital com pagamento via PIX';

const STATUS = {
  listening: 'Ouvindo...',
  thinking: 'Pensando...',
  speaking: 'A IA está falando',
  unsupported: 'Microfone indisponível neste navegador',
  denied: 'Permissão do microfone negada',
};

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function buildCaption(transcript) {
  const text = (transcript || '').trim();
  if (!text) {
    return {
      caption: 'Não consegui ouvir bem. Posso criar um Cardápio Digital com PIX?',
      prompt: FALLBACK_PROMPT,
    };
  }
  return {
    caption: `Entendi: "${text}". Posso começar a construir?`,
    prompt: text,
  };
}

/**
 * Modo Jarvis — voice UI with Web Speech listening + orb phases.
 * Props: open, onClose, onConfirmBuild(prompt)
 */
export default function VoiceAssistantModal({ open, onClose, onConfirmBuild }) {
  const [phase, setPhase] = useState('listening'); // listening | thinking | speaking | unsupported | denied
  const [closing, setClosing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [caption, setCaption] = useState('');
  const [buildPrompt, setBuildPrompt] = useState(FALLBACK_PROMPT);
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const finishedRef = useRef(false);

  const stopRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (!rec) return;
    try {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const finishListening = useCallback((transcript) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    stopRecognition();
    setPhase('thinking');
    const result = buildCaption(transcript);
    setTimeout(() => {
      setCaption(result.caption);
      setBuildPrompt(result.prompt);
      setPhase('speaking');
    }, 900);
  }, [stopRecognition]);

  useEffect(() => {
    if (!open) {
      stopRecognition();
      setPhase('listening');
      setClosing(false);
      setLiveTranscript('');
      setCaption('');
      setBuildPrompt(FALLBACK_PROMPT);
      finalTranscriptRef.current = '';
      finishedRef.current = false;
      return undefined;
    }

    finishedRef.current = false;
    finalTranscriptRef.current = '';
    setLiveTranscript('');
    setCaption('');
    setBuildPrompt(FALLBACK_PROMPT);
    setClosing(false);
    setPhase('listening');

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setPhase('unsupported');
      const t = setTimeout(() => finishListening(''), 1600);
      return () => clearTimeout(t);
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let interim = '';
      let finalText = finalTranscriptRef.current;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) {
          finalText = `${finalText} ${piece}`.trim();
        } else {
          interim += piece;
        }
      }
      finalTranscriptRef.current = finalText;
      setLiveTranscript((finalText || interim).trim());
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setPhase('denied');
        finishListening('');
        return;
      }
      // no-speech / aborted / network → still proceed with whatever we have
      finishListening(finalTranscriptRef.current);
    };

    recognition.onend = () => {
      finishListening(finalTranscriptRef.current);
    };

    try {
      recognition.start();
    } catch {
      finishListening('');
    }

    // Safety net: don't listen forever
    const safety = setTimeout(() => finishListening(finalTranscriptRef.current), 12000);

    return () => {
      clearTimeout(safety);
      stopRecognition();
    };
  }, [open, finishListening, stopRecognition]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const smoothClose = useCallback((afterClose) => {
    stopRecognition();
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      afterClose?.();
    }, 280);
  }, [stopRecognition]);

  const handleClose = useCallback(() => {
    smoothClose(() => onClose?.());
  }, [smoothClose, onClose]);

  const handleConfirm = useCallback(() => {
    smoothClose(() => {
      onConfirmBuild?.(buildPrompt);
      onClose?.();
    });
  }, [smoothClose, onConfirmBuild, onClose, buildPrompt]);

  if (!open) return null;

  const statusKey =
    phase === 'unsupported' || phase === 'denied' ? phase : phase;
  const orbPhase =
    phase === 'unsupported' || phase === 'denied' ? 'listening' : phase;

  const orbClass = [
    'jarvis-orb',
    orbPhase === 'listening' && 'jarvis-orb--listening',
    orbPhase === 'thinking' && 'jarvis-orb--thinking',
    orbPhase === 'speaking' && 'jarvis-orb--speaking',
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
          {STATUS[statusKey] || STATUS.listening}
        </p>

        {phase === 'listening' && liveTranscript ? (
          <p className="text-center text-sm text-zinc-400 leading-relaxed mb-4 max-w-md">
            {liveTranscript}
          </p>
        ) : null}

        {phase === 'speaking' && (
          <p className="text-center text-base sm:text-lg text-zinc-100 leading-relaxed mb-8 jarvis-caption-in">
            {caption}
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
