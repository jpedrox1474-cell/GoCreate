import React, { useRef, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mic, ArrowRight, Zap, LogOut, Loader2 } from 'lucide-react';
import Logo from '../components/Logo';
import VideoBackground from '../components/VideoBackground';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { PENDING_PROMPT_KEY } from '../lib/mockData';

const PROMPT_STARTERS = [
  'Painel com métricas ao vivo',
  'Checkout com Pix e cartão',
  'Portal do cliente com login',
  'Landing de lançamento',
];

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
  const textareaRef = useRef(null);
  const logoVariant = isLight ? 'light' : 'dark';
  const videoVariant = isLight ? 'light' : 'dark';

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    if (!user) {
      sessionStorage.setItem(PENDING_PROMPT_KEY, text);
      navigate('/login', { state: { from: '/editor/new' } });
      return;
    }

    setLoading(true);
    sessionStorage.setItem(PENDING_PROMPT_KEY, text);
    navigate('/editor/new');
  }

  function applyStarter(text) {
    setInput(text);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function handleLogout() {
    await logout();
  }

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
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
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
          }`}
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
            disabled={loading}
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
              disabled={!input.trim() || loading}
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
              disabled={loading}
              onClick={() => {
                const SpeechRecognition =
                  typeof window !== 'undefined'
                    ? window.SpeechRecognition || window.webkitSpeechRecognition
                    : null;
                if (!SpeechRecognition) {
                  setInput((prev) => prev || 'Descreve o que queres criar por voz…');
                  textareaRef.current?.focus();
                  return;
                }
                try {
                  const recognition = new SpeechRecognition();
                  recognition.lang = 'pt-BR';
                  recognition.onresult = (event) => {
                    const transcript = event.results?.[0]?.[0]?.transcript;
                    if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
                  };
                  recognition.start();
                } catch {
                  textareaRef.current?.focus();
                }
              }}
              className={`p-2.5 rounded-lg transition-all disabled:opacity-40 ${
                isLight
                  ? 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
              title="Falar"
              aria-label="Microfone"
            >
              <Mic size={18} />
            </button>
          </div>
        </form>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 max-w-[42rem]">
          {PROMPT_STARTERS.map((label) => (
            <button
              key={label}
              type="button"
              disabled={loading}
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
    </div>
  );
}
