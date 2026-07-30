import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mic, ArrowRight, Zap, LogOut, Loader2, Check, RotateCcw, X } from 'lucide-react';
import Logo from '../components/Logo';
import VideoBackground from '../components/VideoBackground';
import VoiceAssistantModal from '../components/editor/VoiceAssistantModal';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { PENDING_PROMPT_KEY } from '../lib/mockData';

const PROMPT_STARTERS = [
  'Painel com métricas ao vivo',
  'Checkout com Pix e cartão',
  'Portal do cliente com login',
  'Landing de lançamento',
];

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Landing pública — estilo clean light com vídeo + overlay.
 * Adaptada a partir do Landing dark existente (preserva prompt-first + starters).
 */
export default function Landing() {
  const { user, logout } = useAuth();
  const { isLight } = useTheme();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [jarvisOpen, setJarvisOpen] = useState(false);
  /** idle | listening | review */
  const [micPhase, setMicPhase] = useState('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [capturedText, setCapturedText] = useState('');
  const [micError, setMicError] = useState('');

  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const finishedRef = useRef(false);
  const logoVariant = isLight ? 'light' : 'dark';
  const videoVariant = isLight ? 'light' : 'dark';

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

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

  useEffect(() => () => stopRecognition(), [stopRecognition]);

  function submitPrompt(text) {
    const trimmed = (text || '').trim();
    if (!trimmed || loading) return;

    if (!user) {
      sessionStorage.setItem(PENDING_PROMPT_KEY, trimmed);
      navigate('/login', { state: { from: '/editor/new' } });
      return;
    }

    setLoading(true);
    sessionStorage.setItem(PENDING_PROMPT_KEY, trimmed);
    navigate('/editor/new');
  }

  function handleSubmit(e) {
    e.preventDefault();
    submitPrompt(input);
  }

  function applyStarter(text) {
    setInput(text);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function handleLogout() {
    await logout();
  }

  function finishListening(transcript) {
    stopRecognition();
    finishedRef.current = true;
    const text = (transcript || '').trim();
    setLiveTranscript('');
    if (!text) {
      setMicPhase('idle');
      setCapturedText('');
      if (!micError) {
        setMicError('Não capturou áudio. Tente de novo.');
      }
      return;
    }
    setCapturedText(text);
    setMicError('');
    setMicPhase('review');
  }

  function startMicListening() {
    if (loading || micPhase === 'listening') return;
    stopRecognition();
    finishedRef.current = false;
    finalTranscriptRef.current = '';
    setLiveTranscript('');
    setCapturedText('');
    setMicError('');
    setMicPhase('listening');

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setMicError('Microfone indisponível neste navegador.');
      setMicPhase('idle');
      setInput((prev) => prev || 'Descreve o que queres criar por voz…');
      textareaRef.current?.focus();
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
        setMicError('Permissão do microfone negada.');
      }
      finishListening(finalTranscriptRef.current);
    };

    recognition.onend = () => {
      if (finishedRef.current) return;
      finishListening(finalTranscriptRef.current);
    };

    try {
      recognition.start();
    } catch {
      setMicError('Não foi possível iniciar o microfone.');
      setMicPhase('idle');
    }
  }

  function stopMicEarly() {
    if (micPhase !== 'listening') return;
    finishListening(finalTranscriptRef.current);
  }

  function handleMicClick() {
    if (micPhase === 'listening') {
      stopMicEarly();
      return;
    }
    startMicListening();
  }

  function handleConfirmVoice() {
    const text = capturedText.trim();
    if (!text) return;
    setInput(text);
    setMicPhase('idle');
    setCapturedText('');
    setLiveTranscript('');
    // Defer so input state is applied, then same flow as Gerar
    requestAnimationFrame(() => submitPrompt(text));
  }

  function handleCancelVoice() {
    stopRecognition();
    setMicPhase('idle');
    setCapturedText('');
    setLiveTranscript('');
    setMicError('');
  }

  function handleJarvisConfirmBuild(prompt) {
    setJarvisOpen(false);
    if (prompt?.trim()) {
      setInput(prompt.trim());
      submitPrompt(prompt.trim());
    }
  }

  const listening = micPhase === 'listening';
  const reviewing = micPhase === 'review';

  return (
    <div
      className={`relative min-h-screen w-full overflow-hidden font-display ${
        isLight ? 'text-zinc-900' : 'text-zinc-100'
      }`}
    >
      <VideoBackground variant={videoVariant} />

      <header
        className={`relative z-10 flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-10 h-14 sm:h-16 border-b backdrop-blur-md ${
          isLight
            ? 'border-zinc-900/5 bg-white/40'
            : 'border-white/10 bg-zinc-950/40'
        }`}
      >
        <Logo to="/" variant={logoVariant} />

        <nav
          className={`hidden lg:flex items-center gap-7 text-[13px] font-medium ${
            isLight ? 'text-zinc-600' : 'text-zinc-400'
          }`}
        >
          <a href="#prompt" className={isLight ? 'hover:text-zinc-900' : 'hover:text-zinc-100'}>
            Produto
          </a>
          <a href="#prompt" className={isLight ? 'hover:text-zinc-900' : 'hover:text-zinc-100'}>
            Modelos
          </a>
          <a href="#prompt" className={isLight ? 'hover:text-zinc-900' : 'hover:text-zinc-100'}>
            Preços
          </a>
          <button
            type="button"
            onClick={() => setJarvisOpen(true)}
            className={`inline-flex items-center gap-2 transition-all ${
              isLight ? 'hover:text-zinc-900 text-indigo-600' : 'hover:text-zinc-100 text-indigo-300'
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 shrink-0"
              aria-hidden
            />
            Modo Jarvis
          </button>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setJarvisOpen(true)}
            className={`lg:hidden inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium rounded-lg border transition-all ${
              isLight
                ? 'text-indigo-700 border-indigo-200 bg-indigo-50/80'
                : 'text-indigo-200 border-indigo-500/30 bg-indigo-500/10'
            }`}
            title="Modo Jarvis"
          >
            <span
              className="w-2 h-2 rounded-full bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 shrink-0"
              aria-hidden
            />
            Jarvis
          </button>
          {user ? (
            <>
              <Link
                to="/dashboard"
                className={`px-3 py-1.5 text-[13px] font-medium transition-all ${
                  isLight
                    ? 'text-zinc-700 hover:text-zinc-900'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                Dashboard
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                title="Sair"
                className={`inline-flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-lg border transition-all ${
                  isLight
                    ? 'bg-white/80 hover:bg-white border-zinc-200'
                    : 'bg-zinc-900/80 hover:bg-zinc-900 border-zinc-700'
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-[11px] font-bold text-white">
                  {(user.email || 'U')[0].toUpperCase()}
                </div>
                <LogOut size={14} className="text-zinc-500" />
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className={`px-3 py-1.5 text-[13px] font-medium transition-all ${
                  isLight
                    ? 'text-zinc-700 hover:text-zinc-900'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                Entrar
              </Link>
              <Link
                to="/register"
                className={`px-4 py-1.5 text-[13px] font-semibold rounded-lg shadow-sm transition-all ${
                  isLight
                    ? 'text-white bg-zinc-900 hover:bg-zinc-800'
                    : 'text-white bg-blue-600 hover:bg-blue-500'
                }`}
              >
                Começar
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="relative z-10 flex flex-col items-center justify-center px-4 pt-14 sm:pt-20 pb-20 min-h-[calc(100vh-4rem)]">
        <div
          className={`mb-5 inline-flex items-center gap-2 px-3 py-1 rounded-full border backdrop-blur-sm ${
            isLight
              ? 'bg-white/70 border-zinc-200/80'
              : 'bg-zinc-900/70 border-zinc-700/80'
          }`}
        >
          <Zap size={12} className={isLight ? 'text-zinc-700' : 'text-blue-400'} />
          <span
            className={`text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] ${
              isLight ? 'text-zinc-600' : 'text-zinc-400'
            }`}
          >
            Builder de apps com IA
          </span>
        </div>

        <h1
          className={`text-center text-[2.15rem] sm:text-5xl lg:text-[3.4rem] font-bold tracking-tight leading-[1.12] mb-4 sm:mb-5 max-w-3xl ${
            isLight ? 'text-zinc-900' : 'text-zinc-50'
          }`}
        >
          Crie algo com a GoCreate
        </h1>
        <p
          className={`text-center text-base sm:text-lg mb-8 sm:mb-10 max-w-xl leading-relaxed ${
            isLight ? 'text-zinc-600' : 'text-zinc-400'
          }`}
        >
          Descreve o produto. O GoCreate monta interface, fluxo e lógica — pronto a editar.
        </p>

        <form
          id="prompt"
          onSubmit={handleSubmit}
          className={`w-full max-w-[42rem] backdrop-blur-md rounded-xl sm:rounded-2xl border px-3 sm:px-4 py-2.5 sm:py-2 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-1 transition-all focus-within:shadow-lg ${
            isLight
              ? 'bg-white/80 shadow-[0_8px_40px_rgba(0,0,0,0.08)] border-zinc-200/90 focus-within:border-zinc-400'
              : 'bg-zinc-900/80 shadow-[0_8px_40px_rgba(0,0,0,0.35)] border-zinc-700/90 focus-within:border-blue-500/50'
          } ${listening ? (isLight ? 'ring-2 ring-indigo-400/40' : 'ring-2 ring-indigo-500/40') : ''}`}
        >
          <div
            className={`hidden sm:flex w-8 h-8 shrink-0 rounded-lg items-center justify-center ${
              isLight ? 'bg-zinc-100 text-zinc-500' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            <Zap size={14} />
          </div>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading || listening}
            placeholder="Ex.: app de reservas com agenda e confirmação por WhatsApp…"
            rows={1}
            className={`flex-1 w-full bg-transparent border-none resize-none outline-none text-[15px] placeholder:text-zinc-400 py-2.5 sm:py-2 px-1 min-h-[44px] max-h-[120px] leading-snug ${
              isLight ? 'text-zinc-900' : 'text-zinc-100'
            }`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />

          <div className="flex items-center justify-end gap-1 sm:gap-0.5 shrink-0 pb-0.5 sm:pb-0">
            <button
              type="submit"
              disabled={!input.trim() || loading || listening || reviewing}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold text-white transition-all rounded-lg disabled:opacity-40 ${
                isLight
                  ? 'bg-zinc-900 hover:bg-zinc-800 disabled:hover:bg-zinc-900'
                  : 'bg-blue-600 hover:bg-blue-500 disabled:hover:bg-blue-600'
              }`}
            >
              {loading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <>
                  Gerar
                  <ArrowRight size={14} className="opacity-80" />
                </>
              )}
            </button>
            <button
              type="button"
              disabled={loading || reviewing}
              onClick={handleMicClick}
              className={`relative p-2.5 rounded-lg transition-all disabled:opacity-40 ${
                listening
                  ? isLight
                    ? 'text-indigo-700 bg-indigo-100 landing-mic-listening'
                    : 'text-indigo-200 bg-indigo-500/25 landing-mic-listening'
                  : isLight
                    ? 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
              title={listening ? 'Parar de ouvir' : 'Falar'}
              aria-label={listening ? 'Parar microfone' : 'Microfone'}
              aria-pressed={listening}
            >
              {listening && (
                <span className="landing-mic-pulse" aria-hidden />
              )}
              <Mic size={18} className="relative z-[1]" />
            </button>
          </div>
        </form>

        {/* Listening / review voice panel */}
        {(listening || reviewing || micError) && (
          <div
            className={`mt-4 w-full max-w-[42rem] rounded-xl border backdrop-blur-md px-4 py-3.5 landing-mic-panel-in ${
              isLight
                ? 'bg-white/85 border-zinc-200 shadow-sm'
                : 'bg-zinc-900/85 border-zinc-700/80'
            }`}
          >
            {listening && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="landing-mic-dot" aria-hidden />
                  <span
                    className={`text-sm font-semibold ${
                      isLight ? 'text-indigo-700' : 'text-indigo-300'
                    }`}
                  >
                    Ouvindo...
                  </span>
                  <button
                    type="button"
                    onClick={stopMicEarly}
                    className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-md transition-all ${
                      isLight
                        ? 'text-zinc-600 hover:bg-zinc-100'
                        : 'text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    Parar
                  </button>
                </div>
                <p
                  className={`text-sm leading-relaxed min-h-[1.25rem] ${
                    isLight ? 'text-zinc-700' : 'text-zinc-300'
                  }`}
                >
                  {liveTranscript || (
                    <span className={isLight ? 'text-zinc-400' : 'text-zinc-500'}>
                      Fale o que quer criar…
                    </span>
                  )}
                </p>
              </div>
            )}

            {reviewing && (
              <div className="flex flex-col gap-3">
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wider ${
                    isLight ? 'text-zinc-500' : 'text-zinc-500'
                  }`}
                >
                  Texto capturado
                </p>
                <p
                  className={`text-sm leading-relaxed ${
                    isLight ? 'text-zinc-800' : 'text-zinc-200'
                  }`}
                >
                  {capturedText}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmVoice}
                    disabled={loading}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold text-white rounded-lg transition-all disabled:opacity-40 ${
                      isLight
                        ? 'bg-zinc-900 hover:bg-zinc-800'
                        : 'bg-blue-600 hover:bg-blue-500'
                    }`}
                  >
                    <Check size={14} />
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={startMicListening}
                    disabled={loading}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-lg border transition-all disabled:opacity-40 ${
                      isLight
                        ? 'text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                        : 'text-zinc-300 border-zinc-700 hover:bg-zinc-800'
                    }`}
                  >
                    <RotateCcw size={14} />
                    Gravar de novo
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelVoice}
                    disabled={loading}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-lg transition-all disabled:opacity-40 ${
                      isLight
                        ? 'text-zinc-500 hover:text-zinc-800'
                        : 'text-zinc-500 hover:text-zinc-200'
                    }`}
                  >
                    <X size={14} />
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {micError && !listening && !reviewing && (
              <div className="flex items-center justify-between gap-2">
                <p className={`text-sm ${isLight ? 'text-red-600' : 'text-red-400'}`}>{micError}</p>
                <button
                  type="button"
                  onClick={() => setMicError('')}
                  className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}
                >
                  Fechar
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 max-w-[42rem]">
          {PROMPT_STARTERS.map((label) => (
            <button
              key={label}
              type="button"
              disabled={loading || listening}
              onClick={() => applyStarter(label)}
              className={`px-3 py-1.5 text-[12px] sm:text-[13px] font-medium rounded-lg transition-all disabled:opacity-40 backdrop-blur-sm border ${
                isLight
                  ? 'text-zinc-600 bg-white/70 hover:bg-white border-zinc-200 hover:border-zinc-300'
                  : 'text-zinc-300 bg-zinc-900/70 hover:bg-zinc-900 border-zinc-700 hover:border-zinc-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </main>

      <VoiceAssistantModal
        open={jarvisOpen}
        onClose={() => setJarvisOpen(false)}
        onConfirmBuild={handleJarvisConfirmBuild}
      />
    </div>
  );
}
