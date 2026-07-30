import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { X, Mic } from 'lucide-react';
import {
  useSpeechRecognition,
  stopTts,
  speechErrorMessage,
} from '../../hooks/useSpeechRecognition';

const IDLE_MESSAGE = 'Toque no orbe ou em Falar para começar';
const LISTENING_MESSAGE = 'Ouvindo… fale agora';
const CONFIRM_CAPTION =
  'Confirme para gerar. Diga «confirmar» ou toque em Sim, execute.';

/** PT creation-intent keywords (case-insensitive). */
const CREATION_INTENT_RE =
  /\b(construa|construir|crie|criar|execute|executar|fa[cç]a|fazer|gere|gerar|monte|montar|desenvolva|desenvolver|prompt)\b/i;

/** Voice confirmation phrases while awaiting build confirm. */
const CONFIRM_VOICE_RE =
  /\b(confirmar?|confirma|confirmado|sim|execute|executar|pode|ok|okay|vai|gerar)\b/i;

const CANCEL_VOICE_RE = /\b(cancelar?|cancela|n[aã]o|parar|para)\b/i;

function hasCreationIntent(text) {
  return CREATION_INTENT_RE.test((text || '').trim());
}

function isConfirmPhrase(text) {
  return CONFIRM_VOICE_RE.test((text || '').trim());
}

function isCancelPhrase(text) {
  return CANCEL_VOICE_RE.test((text || '').trim());
}

function chatReplyFor(text) {
  const t = (text || '').trim().toLowerCase();
  if (/ouvindo|me ouve|escuta|hello|oi\b|ol[aá]\b|jarvis/.test(t)) {
    return 'Sim, estou ouvindo! Em que posso ajudar?';
  }
  if (t.length > 0) {
    return 'Entendi. Pode detalhar mais, ou diga «crie…» quando quiser que eu monte o prompt.';
  }
  return 'Não consegui ouvir bem. Pode repetir?';
}

/** Strip leading command verbs so the prompt reads as a clean brief. */
function craftBuildPrompt(text) {
  let cleaned = (text || '').trim();
  cleaned = cleaned
    .replace(
      /^(por favor[, ]*)?(jarvis[, ]*)?(pode[, ]*)?(me[, ]*)?(construa|construir|crie|criar|execute|executar|fa[cç]a|fazer|gere|gerar|monte|montar|desenvolva|desenvolver)\s+(um|uma|o|a|pra mim|para mim)?\s*/i,
      ''
    )
    .trim();
  if (!cleaned) {
    return 'Crie um projeto web moderno conforme a conversa.';
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Browser TTS (pt-BR) for voice-to-voice replies. */
function speakText(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const phrase = String(text || '').trim();
  if (!phrase) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(phrase);
    utter.lang = 'pt-BR';
    utter.rate = 1.05;
    utter.pitch = 1;
    const voices = window.speechSynthesis.getVoices?.() || [];
    const pt =
      voices.find((v) => /pt-BR/i.test(v.lang)) ||
      voices.find((v) => /^pt/i.test(v.lang));
    if (pt) utter.voice = pt;
    window.speechSynthesis.speak(utter);
  } catch {
    /* TTS optional */
  }
}

function useShowDebug() {
  return useMemo(() => {
    if (import.meta.env.DEV) return true;
    try {
      return new URLSearchParams(window.location.search).has('debug');
    } catch {
      return false;
    }
  }, []);
}

/**
 * Modo Jarvis — voice helper. Helps craft ideas; never builds until confirm.
 * States: idle → listening → chatting | awaiting_confirm
 * Props: open, onClose, onConfirmBuild(prompt)
 */
export default function VoiceAssistantModal({ open, onClose, onConfirmBuild }) {
  const [conversationState, setConversationState] = useState('idle');
  const [statusHint, setStatusHint] = useState('');
  const [closing, setClosing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [caption, setCaption] = useState('');
  const [buildPrompt, setBuildPrompt] = useState('');
  const [debugInput, setDebugInput] = useState('');
  const [listenError, setListenError] = useState('');

  const chatIdleTimerRef = useRef(null);
  const autoListenTimerRef = useRef(null);
  const conversationStateRef = useRef('idle');
  const buildPromptRef = useRef('');
  const pendingConfirmRef = useRef(false);
  const confirmBuildRef = useRef(null);
  const showDebug = useShowDebug();

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

  const clearAutoListen = useCallback(() => {
    if (autoListenTimerRef.current) {
      clearTimeout(autoListenTimerRef.current);
      autoListenTimerRef.current = null;
    }
  }, []);

  const handleVoiceCommit = useCallback(
    (text) => {
      clearChatIdleTimer();
      const raw = (text || '').trim();
      setLiveTranscript('');
      setListenError('');

      if (pendingConfirmRef.current) {
        if (isCancelPhrase(raw)) {
          clearChatIdleTimer();
          stopTts();
          buildPromptRef.current = '';
          pendingConfirmRef.current = false;
          setLiveTranscript('');
          setCaption('');
          setBuildPrompt('');
          setStatusHint('');
          setListenError('');
          setState('idle');
          return;
        }
        if (isConfirmPhrase(raw)) {
          confirmBuildRef.current?.();
          return;
        }
        if (hasCreationIntent(raw)) {
          const prompt = craftBuildPrompt(raw);
          buildPromptRef.current = prompt;
          pendingConfirmRef.current = true;
          setBuildPrompt(prompt);
          setCaption(CONFIRM_CAPTION);
          setLiveTranscript('');
          setState('awaiting_confirm');
          speakText(CONFIRM_CAPTION);
          return;
        }
        const clarify = 'Não entendi. Diga «confirmar» para gerar, ou «cancelar».';
        setCaption(clarify);
        setState('awaiting_confirm');
        speakText(clarify);
        return;
      }

      if (hasCreationIntent(raw)) {
        const prompt = craftBuildPrompt(raw);
        buildPromptRef.current = prompt;
        pendingConfirmRef.current = true;
        setBuildPrompt(prompt);
        setCaption(CONFIRM_CAPTION);
        setLiveTranscript('');
        setState('awaiting_confirm');
        speakText(CONFIRM_CAPTION);
        return;
      }

      setBuildPrompt('');
      buildPromptRef.current = '';
      pendingConfirmRef.current = false;
      // Empty commit after auto-start silence → soft idle, not error chatter
      if (!raw) {
        setCaption('');
        setState('idle');
        return;
      }
      const reply = chatReplyFor(raw);
      setCaption(reply);
      setState('chatting');
      speakText(reply);
      chatIdleTimerRef.current = setTimeout(() => {
        chatIdleTimerRef.current = null;
        if (conversationStateRef.current === 'chatting') {
          setCaption('');
          setState('idle');
        }
      }, 5500);
    },
    [clearChatIdleTimer, setState]
  );

  const {
    listening,
    transcript,
    volume,
    error: sttError,
    start: startStt,
    stop: stopStt,
    cancel: cancelStt,
    supported,
  } = useSpeechRecognition({
    onCommit: handleVoiceCommit,
    onInterim: setLiveTranscript,
    onError: (msg) => {
      setListenError(msg);
      if (msg.includes('negada') || msg.includes('indisponível')) {
        setStatusHint(msg.includes('negada') ? 'denied' : 'unsupported');
      }
    },
    lang: 'pt-BR',
    autoCommitOnSilence: true,
    silenceMs: 1600,
  });

  const resetToIdle = useCallback(() => {
    clearChatIdleTimer();
    clearAutoListen();
    cancelStt();
    stopTts();
    buildPromptRef.current = '';
    pendingConfirmRef.current = false;
    setLiveTranscript('');
    setCaption('');
    setBuildPrompt('');
    setStatusHint('');
    setListenError('');
    setState('idle');
  }, [clearChatIdleTimer, clearAutoListen, cancelStt, setState]);

  const startListening = useCallback(() => {
    if (conversationStateRef.current === 'listening' || listening) return;
    clearChatIdleTimer();
    clearAutoListen();
    stopTts();
    setLiveTranscript('');
    setListenError('');
    if (pendingConfirmRef.current) {
      setCaption('Ouvindo confirmação… diga «confirmar»');
    } else {
      setCaption('');
      setBuildPrompt('');
      buildPromptRef.current = '';
    }
    setStatusHint('');
    setState('listening');
    void startStt();
  }, [
    listening,
    clearChatIdleTimer,
    clearAutoListen,
    setState,
    startStt,
  ]);

  const stopListeningEarly = useCallback(() => {
    if (conversationStateRef.current !== 'listening' && !listening) return;
    stopStt();
  }, [listening, stopStt]);

  const toggleListen = useCallback(() => {
    if (conversationStateRef.current === 'listening' || listening) {
      stopListeningEarly();
      return;
    }
    startListening();
  }, [listening, startListening, stopListeningEarly]);

  // Sync listening flag from hook → conversation state if STT dies unexpectedly
  useEffect(() => {
    if (!open) return;
    if (!listening && conversationStateRef.current === 'listening') {
      // commit handler will move state; if cancelled without commit, park idle
    }
  }, [listening, open]);

  // Keep live transcript from hook while listening
  useEffect(() => {
    if (listening && transcript) setLiveTranscript(transcript);
  }, [listening, transcript]);

  // Open / close lifecycle — auto-start listening after a short beat
  useEffect(() => {
    if (!open) {
      clearChatIdleTimer();
      clearAutoListen();
      cancelStt();
      stopTts();
      setClosing(false);
      setLiveTranscript('');
      setCaption('');
      setBuildPrompt('');
      buildPromptRef.current = '';
      pendingConfirmRef.current = false;
      setStatusHint('');
      setListenError('');
      setDebugInput('');
      conversationStateRef.current = 'idle';
      setConversationState('idle');
      return undefined;
    }

    clearChatIdleTimer();
    cancelStt();
    stopTts();
    buildPromptRef.current = '';
    pendingConfirmRef.current = false;
    setLiveTranscript('');
    setCaption('');
    setBuildPrompt('');
    setStatusHint('');
    setListenError('');
    setState('idle');

    try {
      window.speechSynthesis?.getVoices?.();
    } catch {
      /* ignore */
    }

    // Auto-enter listening so speaking works without an extra click
    autoListenTimerRef.current = setTimeout(() => {
      autoListenTimerRef.current = null;
      if (!open) return;
      startListening();
    }, 400);

    return () => {
      clearChatIdleTimer();
      clearAutoListen();
      cancelStt();
      stopTts();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open toggle
  }, [open]);

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

  const smoothClose = useCallback(
    (afterClose) => {
      clearChatIdleTimer();
      clearAutoListen();
      cancelStt();
      stopTts();
      setClosing(true);
      setTimeout(() => {
        setClosing(false);
        afterClose?.();
      }, 280);
    },
    [clearChatIdleTimer, clearAutoListen, cancelStt]
  );

  const handleClose = useCallback(() => {
    smoothClose(() => onClose?.());
  }, [smoothClose, onClose]);

  const handleCancelBuild = useCallback(() => {
    resetToIdle();
  }, [resetToIdle]);

  const handleConfirm = useCallback(() => {
    const prompt = buildPromptRef.current || buildPrompt;
    pendingConfirmRef.current = false;
    smoothClose(() => {
      onConfirmBuild?.(prompt);
      onClose?.();
    });
  }, [smoothClose, onConfirmBuild, onClose, buildPrompt]);

  confirmBuildRef.current = handleConfirm;

  const handleDebugSubmit = useCallback(
    (phrase) => {
      const text = (phrase ?? debugInput).trim();
      if (!text) return;
      setDebugInput('');
      cancelStt();
      setState(pendingConfirmRef.current ? 'awaiting_confirm' : 'idle');
      handleVoiceCommit(text);
    },
    [debugInput, cancelStt, setState, handleVoiceCommit]
  );

  if (!open) return null;

  const isListening = conversationState === 'listening' || listening;

  const orbAnim = isListening
    ? 'listening'
    : conversationState === 'awaiting_confirm'
      ? 'thinking'
      : 'speaking';

  const showRings =
    conversationState === 'chatting' ||
    conversationState === 'awaiting_confirm' ||
    isListening;

  const errorBanner = listenError || sttError || '';

  const statusText =
    statusHint === 'unsupported' || (!supported && conversationState === 'idle')
      ? speechErrorMessage('unsupported')
      : statusHint === 'denied'
        ? 'Permissão do microfone negada'
        : isListening
          ? caption || LISTENING_MESSAGE
          : conversationState === 'chatting'
            ? caption
            : conversationState === 'awaiting_confirm'
              ? caption
              : IDLE_MESSAGE;

  const volumeGlow = isListening ? 0.45 + volume * 0.55 : 0.45;

  const orbClass = [
    'jarvis-orb',
    orbAnim === 'listening' && 'jarvis-orb--listening',
    orbAnim === 'thinking' && 'jarvis-orb--thinking',
    orbAnim === 'speaking' && 'jarvis-orb--speaking',
    (conversationState === 'idle' || conversationState === 'awaiting_confirm') &&
      'cursor-pointer',
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
          className="relative flex items-center justify-center mb-6 bg-transparent border-0 p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 rounded-full"
          aria-label={isListening ? 'Parar de ouvir' : 'Começar a falar'}
        >
          {showRings && (
            <>
              <span
                className="jarvis-ring jarvis-ring--1"
                style={
                  isListening
                    ? { transform: `scale(${1.2 + volume * 1.2})`, opacity: 0.35 + volume * 0.45 }
                    : undefined
                }
                aria-hidden
              />
              <span className="jarvis-ring jarvis-ring--2" aria-hidden />
              {conversationState !== 'listening' && (
                <span className="jarvis-ring jarvis-ring--3" aria-hidden />
              )}
            </>
          )}
          <div
            className={orbClass}
            style={
              isListening
                ? {
                    ['--jarvis-vol']: Math.min(1, volume).toFixed(3),
                    boxShadow: `0 0 ${40 + volume * 40}px rgba(99, 102, 241, ${volumeGlow}), 0 0 ${80 + volume * 60}px rgba(59, 130, 246, ${0.25 + volume * 0.35}), inset 0 0 30px rgba(255, 255, 255, 0.15)`,
                  }
                : undefined
            }
            aria-hidden
          />
        </button>

        {!isListening && conversationState === 'idle' && (
          <button
            type="button"
            onClick={startListening}
            className="jarvis-glass-btn jarvis-glass-btn--primary mb-5 inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl text-base font-semibold text-white transition-all jarvis-actions-in"
          >
            <Mic size={18} />
            Falar
          </button>
        )}

        {isListening && (
          <button
            type="button"
            onClick={stopListeningEarly}
            className="jarvis-glass-btn mb-5 px-6 py-2.5 rounded-xl text-sm font-medium text-zinc-200 hover:text-white transition-all"
          >
            Pronto — processar
          </button>
        )}

        <p
          className={`text-center text-sm font-medium tracking-wide mb-3 transition-opacity duration-300 ${
            conversationState === 'chatting' || conversationState === 'awaiting_confirm'
              ? 'text-zinc-100 text-base sm:text-lg leading-relaxed jarvis-caption-in'
              : isListening
                ? 'text-indigo-200 text-base sm:text-lg'
                : 'text-zinc-300'
          }`}
        >
          {statusText}
        </p>

        {errorBanner ? (
          <p className="text-center text-xs text-amber-300/90 mb-3 max-w-sm leading-relaxed">
            {errorBanner}
          </p>
        ) : null}

        {isListening ? (
          <div className="w-full mb-4 min-h-[3rem]">
            {liveTranscript ? (
              <p className="text-center text-base sm:text-lg text-zinc-100 leading-relaxed max-w-md mx-auto font-medium jarvis-caption-in">
                {liveTranscript}
              </p>
            ) : (
              <p className="text-center text-sm text-zinc-500">
                Aguardando sua voz… o orbe reage ao volume do microfone
              </p>
            )}
            {/* Mic level bar — visual proof getUserMedia works */}
            <div className="mt-4 mx-auto w-40 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-400 transition-[width] duration-75"
                style={{ width: `${Math.round(Math.min(1, volume) * 100)}%` }}
              />
            </div>
          </div>
        ) : null}

        {(conversationState === 'awaiting_confirm' ||
          (isListening && !!buildPrompt)) &&
        buildPrompt ? (
          <div className="w-full mb-6 jarvis-caption-in">
            <p className="text-center text-xs uppercase tracking-wider text-indigo-300/80 mb-2">
              Vou criar este prompt
            </p>
            <p className="text-center text-sm text-zinc-200 leading-relaxed max-w-md mx-auto rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              {buildPrompt}
            </p>
          </div>
        ) : null}

        {!!buildPrompt && !isListening && (
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
              onClick={startListening}
              className="jarvis-glass-btn px-6 py-3 rounded-xl text-sm font-medium text-zinc-300 hover:text-white transition-all"
            >
              Confirmar por áudio
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

      {showDebug ? (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-full max-w-md px-4">
          <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-md p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              Debug (?debug=1)
            </p>
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
              <button
                type="button"
                onClick={() => handleDebugSubmit('confirmar')}
                className="jarvis-glass-btn px-3 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white"
              >
                confirmar
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
      ) : null}
    </div>
  );
}
