import React, { useEffect, useState, useCallback, useRef } from 'react';
import { X } from 'lucide-react';

const IDLE_MESSAGE = 'Pressione espaço ou clique para falar...';
const LISTENING_MESSAGE = 'Ouvindo...';
const CONFIRM_CAPTION =
  'Confirme para gerar. Diga «confirmar» ou toque em Sim, execute.';
const DEFAULT_CHAT_REPLY = 'Estou aqui! O que gostaria de criar hoje?';

/** PT creation-intent keywords (case-insensitive). */
const CREATION_INTENT_RE =
  /\b(construa|construir|crie|criar|execute|executar|fa[cç]a|fazer|gere|gerar|monte|montar|desenvolva|desenvolver|prompt)\b/i;

/** Voice confirmation phrases while awaiting build confirm. */
const CONFIRM_VOICE_RE =
  /\b(confirmar?|confirma|confirmado|sim|execute|executar|pode|ok|okay|vai|gerar)\b/i;

const CANCEL_VOICE_RE = /\b(cancelar?|cancela|n[aã]o|parar|para)\b/i;

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

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
  // Capitalize first letter
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function stopTts() {
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  } catch {
    /* ignore */
  }
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

/**
 * Modo Jarvis — voice helper. Helps craft ideas; never builds until confirm.
 * States: idle → listening → chatting | awaiting_confirm
 * Props: open, onClose, onConfirmBuild(prompt)
 */
export default function VoiceAssistantModal({ open, onClose, onConfirmBuild }) {
  const [conversationState, setConversationState] = useState('idle'); // idle | listening | chatting | awaiting_confirm
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
  const buildPromptRef = useRef('');
  /** True while we have a crafted prompt waiting for confirm (survives listen toggles). */
  const pendingConfirmRef = useRef(false);
  const confirmBuildRef = useRef(null);

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
    stopTts();
    finishedRef.current = false;
    finalTranscriptRef.current = '';
    buildPromptRef.current = '';
    pendingConfirmRef.current = false;
    setLiveTranscript('');
    setCaption('');
    setBuildPrompt('');
    setStatusHint('');
    setState('idle');
  }, [clearChatIdleTimer, stopRecognition, setState]);

  const enterAwaitingConfirm = useCallback(
    (rawText) => {
      const prompt = craftBuildPrompt(rawText);
      buildPromptRef.current = prompt;
      pendingConfirmRef.current = true;
      setBuildPrompt(prompt);
      setCaption(CONFIRM_CAPTION);
      setLiveTranscript('');
      setState('awaiting_confirm');
      speakText(CONFIRM_CAPTION);
    },
    [setState]
  );

  const handleSimulatedVoiceInput = useCallback(
    (text) => {
      clearChatIdleTimer();
      stopRecognition();
      finishedRef.current = true;
      const raw = (text || '').trim();
      setLiveTranscript('');
      setStatusHint('');

      // While a crafted prompt awaits confirm (including mid-listen for voice confirm)
      if (pendingConfirmRef.current) {
        if (isCancelPhrase(raw)) {
          resetToIdle();
          return;
        }
        if (isConfirmPhrase(raw)) {
          confirmBuildRef.current?.();
          return;
        }
        if (hasCreationIntent(raw)) {
          enterAwaitingConfirm(raw);
          return;
        }
        const clarify = 'Não entendi. Diga «confirmar» para gerar, ou «cancelar».';
        setCaption(clarify);
        setState('awaiting_confirm');
        speakText(clarify);
        return;
      }

      if (hasCreationIntent(raw)) {
        enterAwaitingConfirm(raw);
        return;
      }

      setBuildPrompt('');
      buildPromptRef.current = '';
      pendingConfirmRef.current = false;
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
    [clearChatIdleTimer, stopRecognition, setState, resetToIdle, enterAwaitingConfirm]
  );

  const startListening = useCallback(() => {
    if (conversationStateRef.current === 'listening') return;
    clearChatIdleTimer();
    stopRecognition();
    stopTts();
    finishedRef.current = false;
    finalTranscriptRef.current = '';
    setLiveTranscript('');
    // Keep crafted prompt when re-listening for voice confirm
    if (pendingConfirmRef.current) {
      setCaption('Ouvindo confirmação… diga «confirmar»');
    } else {
      setCaption('');
      setBuildPrompt('');
      buildPromptRef.current = '';
    }
    setStatusHint('');
    setState('listening');

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setStatusHint('unsupported');
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
  }, [
    clearChatIdleTimer,
    clearListenSafety,
    stopRecognition,
    setState,
    handleSimulatedVoiceInput,
  ]);

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
      stopTts();
      setClosing(false);
      setLiveTranscript('');
      setCaption('');
      setBuildPrompt('');
      buildPromptRef.current = '';
      pendingConfirmRef.current = false;
      setStatusHint('');
      setDebugInput('');
      finalTranscriptRef.current = '';
      finishedRef.current = false;
      conversationStateRef.current = 'idle';
      setConversationState('idle');
      return undefined;
    }

    resetToIdle();
    // Warm TTS voices (Chrome loads async)
    try {
      window.speechSynthesis?.getVoices?.();
    } catch {
      /* ignore */
    }
    return () => {
      clearChatIdleTimer();
      stopRecognition();
      stopTts();
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

  const smoothClose = useCallback(
    (afterClose) => {
      clearChatIdleTimer();
      stopRecognition();
      stopTts();
      setClosing(true);
      setTimeout(() => {
        setClosing(false);
        afterClose?.();
      }, 280);
    },
    [clearChatIdleTimer, stopRecognition]
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
      handleSimulatedVoiceInput(text);
    },
    [debugInput, handleSimulatedVoiceInput]
  );

  if (!open) return null;

  const orbAnim =
    conversationState === 'listening'
      ? 'listening'
      : conversationState === 'awaiting_confirm'
        ? 'thinking'
        : 'speaking';

  const showRings =
    conversationState === 'chatting' || conversationState === 'awaiting_confirm';

  const statusText =
    statusHint === 'unsupported'
      ? 'Microfone indisponível neste navegador'
      : statusHint === 'denied'
        ? 'Permissão do microfone negada'
        : conversationState === 'idle'
          ? IDLE_MESSAGE
          : conversationState === 'listening'
            ? caption || LISTENING_MESSAGE
            : conversationState === 'chatting'
              ? caption
              : conversationState === 'awaiting_confirm'
                ? caption
                : IDLE_MESSAGE;

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
          {conversationState === 'listening' && (
            <>
              <span className="jarvis-ring jarvis-ring--1" aria-hidden />
              <span className="jarvis-ring jarvis-ring--2" aria-hidden />
            </>
          )}
          <div className={orbClass} aria-hidden />
        </button>

        <p
          className={`text-center text-sm font-medium tracking-wide mb-3 transition-opacity duration-300 ${
            conversationState === 'chatting' || conversationState === 'awaiting_confirm'
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

        {(conversationState === 'awaiting_confirm' ||
          (conversationState === 'listening' && !!buildPrompt)) &&
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

        {!!buildPrompt && conversationState !== 'listening' && (
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
              onClick={toggleListen}
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

        {!!buildPrompt && conversationState === 'listening' && (
          <button
            type="button"
            onClick={stopListeningEarly}
            className="jarvis-glass-btn px-6 py-3 rounded-xl text-sm font-medium text-zinc-300 hover:text-white transition-all jarvis-actions-in"
          >
            Parar de ouvir
          </button>
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
    </div>
  );
}
