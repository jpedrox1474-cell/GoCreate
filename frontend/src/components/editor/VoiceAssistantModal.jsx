import React, { useEffect, useState, useCallback, useRef } from 'react';
import { X } from 'lucide-react';

const IDLE_MESSAGE = 'Pressione espaço ou clique para falar...';
const LISTENING_MESSAGE = 'Ouvindo...';
const READY_CAPTION = 'Entendi o projeto. Posso iniciar a construção do código?';
const DEFAULT_CHAT_REPLY = 'Estou aqui! O que gostaria de criar hoje?';

/** PT creation-intent keywords (case-insensitive). */
const CREATION_INTENT_RE =
  /\b(construa|construir|crie|criar|execute|executar|fa[cç]a|fazer|gere|gerar|monte|montar|desenvolva|desenvolver)\b/i;

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function hasCreationIntent(text) {
  return CREATION_INTENT_RE.test((text || '').trim());
}

function chatReplyFor(text) {
  const t = (text || '').trim().toLowerCase();
  if (/ouvindo|me ouve|escuta|hello|oi\b|ol[aá]\b|jarvis/.test(t)) {
    return 'Sim, estou ouvindo! Em que posso ajudar?';
  }
  if (t.length > 0) {
    return DEFAULT_CHAT_REPLY;
  }
  return 'Não consegui ouvir bem. Pode repetir?';
}

function summarizeBuildPrompt(text) {
  const cleaned = (text || '').trim();
  return cleaned || 'Crie um projeto web moderno conforme a conversa.';
}

/**
 * Modo Jarvis — voice UI with conversationState machine.
 * States: idle → listening → chatting | ready_to_build
 * Props: open, onClose, onConfirmBuild(prompt)
 */
export default function VoiceAssistantModal({ open, onClose, onConfirmBuild }) {
  const [conversationState, setConversationState] = useState('idle'); // idle | listening | chatting | ready_to_build
  const [statusHint, setStatusHint] = useState(''); // unsupported | denied | ''
  const [closing, setClosing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [caption, setCaption] = useState('');
  const [buildPrompt, setBuildPrompt] = useState('');
  const [debugInput, setDebugInput] = useState('');

  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const finishedRef = useRef(false);
  const chatIdleTimerRef = useRef(null);
  const listenSafetyRef = useRef(null);
  const conversationStateRef = useRef('idle');

  const setState = useCallback((next) => {
    conversationStateRef.current = next;
    setConversationState(next);
  }, []);

  const clearChatIdleTimer = useCallback(() => {
    if (chatIdleTimerRef.current) {
      clearTimeout(chatIdleTimerRef.current);
      chatIdleTimerRef.current = null;
    }
  }, []);

  const clearListenSafety = useCallback(() => {
    if (listenSafetyRef.current) {
      clearTimeout(listenSafetyRef.current);
      listenSafetyRef.current = null;
    }
  }, []);

  const stopRecognition = useCallback(() => {
    clearListenSafety();
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
  }, [clearListenSafety]);

  const resetToIdle = useCallback(() => {
    clearChatIdleTimer();
    stopRecognition();
    finishedRef.current = false;
    finalTranscriptRef.current = '';
    setLiveTranscript('');
    setCaption('');
    setBuildPrompt('');
    setStatusHint('');
    setState('idle');
  }, [clearChatIdleTimer, stopRecognition, setState]);

  const handleSimulatedVoiceInput = useCallback((text) => {
    clearChatIdleTimer();
    stopRecognition();
    finishedRef.current = true;
    const raw = (text || '').trim();
    setLiveTranscript('');
    setStatusHint('');

    if (hasCreationIntent(raw)) {
      const prompt = summarizeBuildPrompt(raw);
      setBuildPrompt(prompt);
      setCaption(READY_CAPTION);
      setState('ready_to_build');
      return;
    }

    setBuildPrompt('');
    setCaption(chatReplyFor(raw));
    setState('chatting');
    chatIdleTimerRef.current = setTimeout(() => {
      chatIdleTimerRef.current = null;
      if (conversationStateRef.current === 'chatting') {
        setCaption('');
        setState('idle');
      }
    }, 3000);
  }, [clearChatIdleTimer, stopRecognition, setState]);

  const startListening = useCallback(() => {
    if (conversationStateRef.current === 'listening') return;
    clearChatIdleTimer();
    stopRecognition();
    finishedRef.current = false;
    finalTranscriptRef.current = '';
    setLiveTranscript('');
    setCaption('');
    setBuildPrompt('');
    setStatusHint('');
    setState('listening');

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setStatusHint('unsupported');
      // Keep listening UI briefly, then fall back to empty input handler
      setTimeout(() => {
        if (conversationStateRef.current === 'listening') {
          handleSimulatedVoiceInput('');
        }
      }, 1200);
      return;
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
        setStatusHint('denied');
        handleSimulatedVoiceInput(finalTranscriptRef.current);
        return;
      }
      handleSimulatedVoiceInput(finalTranscriptRef.current);
    };

    recognition.onend = () => {
      if (finishedRef.current) return;
      handleSimulatedVoiceInput(finalTranscriptRef.current);
    };

    try {
      recognition.start();
    } catch {
      handleSimulatedVoiceInput('');
      return;
    }

    clearListenSafety();
    listenSafetyRef.current = setTimeout(() => {
      listenSafetyRef.current = null;
      if (!finishedRef.current && conversationStateRef.current === 'listening') {
        handleSimulatedVoiceInput(finalTranscriptRef.current);
      }
    }, 12000);
  }, [clearChatIdleTimer, clearListenSafety, stopRecognition, setState, handleSimulatedVoiceInput]);

  const stopListeningEarly = useCallback(() => {
    if (conversationStateRef.current !== 'listening') return;
    const transcript = finalTranscriptRef.current;
    stopRecognition();
    handleSimulatedVoiceInput(transcript);
  }, [stopRecognition, handleSimulatedVoiceInput]);

  const toggleListen = useCallback(() => {
    if (conversationStateRef.current === 'listening') {
      stopListeningEarly();
      return;
    }
    startListening();
  }, [startListening, stopListeningEarly]);

  // Open / close lifecycle
  useEffect(() => {
    if (!open) {
      clearChatIdleTimer();
      stopRecognition();
      setClosing(false);
      setLiveTranscript('');
      setCaption('');
      setBuildPrompt('');
      setStatusHint('');
      setDebugInput('');
      finalTranscriptRef.current = '';
      finishedRef.current = false;
      conversationStateRef.current = 'idle';
      setConversationState('idle');
      return undefined;
    }

    resetToIdle();
    return () => {
      clearChatIdleTimer();
      stopRecognition();
    };
  }, [open, resetToIdle, clearChatIdleTimer, stopRecognition]);

  // Space to toggle listen; Escape to close
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      if (e.key === ' ' || e.code === 'Space') {
        const tag = (e.target?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
        e.preventDefault();
        toggleListen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, toggleListen]);

  const smoothClose = useCallback((afterClose) => {
    clearChatIdleTimer();
    stopRecognition();
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      afterClose?.();
    }, 280);
  }, [clearChatIdleTimer, stopRecognition]);

  const handleClose = useCallback(() => {
    smoothClose(() => onClose?.());
  }, [smoothClose, onClose]);

  const handleCancelBuild = useCallback(() => {
    resetToIdle();
  }, [resetToIdle]);

  const handleConfirm = useCallback(() => {
    const prompt = buildPrompt;
    smoothClose(() => {
      onConfirmBuild?.(prompt);
      onClose?.();
    });
  }, [smoothClose, onConfirmBuild, onClose, buildPrompt]);

  const handleDebugSubmit = useCallback((phrase) => {
    const text = (phrase ?? debugInput).trim();
    if (!text) return;
    setDebugInput('');
    handleSimulatedVoiceInput(text);
  }, [debugInput, handleSimulatedVoiceInput]);

  if (!open) return null;

  // Map conversationState → existing orb CSS classes (identity preserved)
  const orbAnim =
    conversationState === 'listening'
      ? 'listening'
      : conversationState === 'ready_to_build'
        ? 'thinking'
        : 'speaking'; // idle + chatting → soft pulse

  const showRings = conversationState === 'chatting' || conversationState === 'ready_to_build';

  const statusText =
    statusHint === 'unsupported'
      ? 'Microfone indisponível neste navegador'
      : statusHint === 'denied'
        ? 'Permissão do microfone negada'
        : conversationState === 'idle'
          ? IDLE_MESSAGE
          : conversationState === 'listening'
            ? LISTENING_MESSAGE
            : conversationState === 'chatting'
              ? caption
              : conversationState === 'ready_to_build'
                ? caption
                : IDLE_MESSAGE;

  const orbClass = [
    'jarvis-orb',
    orbAnim === 'listening' && 'jarvis-orb--listening',
    orbAnim === 'thinking' && 'jarvis-orb--thinking',
    orbAnim === 'speaking' && 'jarvis-orb--speaking',
    conversationState === 'idle' && 'cursor-pointer',
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
        <button
          type="button"
          onClick={toggleListen}
          className="relative flex items-center justify-center mb-10 bg-transparent border-0 p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 rounded-full"
          aria-label={conversationState === 'listening' ? 'Parar de ouvir' : 'Começar a falar'}
        >
          {showRings && (
            <>
              <span className="jarvis-ring jarvis-ring--1" aria-hidden />
              <span className="jarvis-ring jarvis-ring--2" aria-hidden />
              <span className="jarvis-ring jarvis-ring--3" aria-hidden />
            </>
          )}
          <div className={orbClass} aria-hidden />
        </button>

        <p
          className={`text-center text-sm font-medium tracking-wide mb-3 transition-opacity duration-300 ${
            conversationState === 'chatting' || conversationState === 'ready_to_build'
              ? 'text-zinc-100 text-base sm:text-lg leading-relaxed jarvis-caption-in'
              : 'text-zinc-300'
          }`}
        >
          {statusText}
        </p>

        {conversationState === 'listening' && liveTranscript ? (
          <p className="text-center text-sm text-zinc-400 leading-relaxed mb-4 max-w-md">
            {liveTranscript}
          </p>
        ) : null}

        {conversationState === 'ready_to_build' && buildPrompt ? (
          <p className="text-center text-xs text-zinc-500 leading-relaxed mb-6 max-w-md">
            Projeto: {buildPrompt}
          </p>
        ) : null}

        {conversationState === 'ready_to_build' && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto jarvis-actions-in">
            <button
              type="button"
              onClick={handleConfirm}
              className="jarvis-glass-btn jarvis-glass-btn--primary px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all"
            >
              Sim, execute
            </button>
            <button
              type="button"
              onClick={handleCancelBuild}
              className="jarvis-glass-btn px-6 py-3 rounded-xl text-sm font-medium text-zinc-300 hover:text-white transition-all"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Temporary debug footer */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-full max-w-md px-4">
        <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-md p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Debug (temporário)</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleDebugSubmit('Estão me ouvindo?')}
              className="jarvis-glass-btn px-3 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white"
            >
              Estão me ouvindo?
            </button>
            <button
              type="button"
              onClick={() => handleDebugSubmit('Crie um site para mim')}
              className="jarvis-glass-btn px-3 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white"
            >
              Crie um site para mim
            </button>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleDebugSubmit();
            }}
          >
            <input
              type="text"
              value={debugInput}
              onChange={(e) => setDebugInput(e.target.value)}
              placeholder="Simular frase..."
              className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-400/40"
            />
            <button
              type="submit"
              className="jarvis-glass-btn jarvis-glass-btn--primary px-3 py-1.5 rounded-lg text-xs text-white shrink-0"
            >
              Enviar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
