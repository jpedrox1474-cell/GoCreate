import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mic,
  ArrowRight,
  Zap,
  LogOut,
  Loader2,
  ChevronDown,
  LayoutTemplate,
  LayoutDashboard,
  ShoppingBag,
} from 'lucide-react';
import Logo from '../components/Logo';
import VideoBackground from '../components/VideoBackground';
import { useAuth } from '../context/AuthContext';
import { PENDING_PROMPT_KEY } from '../lib/mockData';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

const PROMPT_STARTERS = [
  'Painel com métricas ao vivo',
  'Checkout com Pix e cartão',
  'Portal do cliente com login',
  'Landing de lançamento',
];

const MODELOS = [
  {
    id: 'landing',
    label: 'Landing Pages',
    description: 'Hero, features e CTA de conversão',
    prompt: 'Cria uma landing page moderna com hero, features, pricing e CTA.',
    icon: LayoutTemplate,
  },
  {
    id: 'dashboard',
    label: 'Dashboards',
    description: 'KPIs, gráficos e tabelas ao vivo',
    prompt: 'Cria um dashboard analytics com KPIs, gráficos e tabela de dados recentes.',
    icon: LayoutDashboard,
  },
  {
    id: 'loja',
    label: 'Lojas Virtuais',
    description: 'Catálogo, carrinho e checkout',
    prompt: 'Cria uma loja virtual com catálogo de produtos, carrinho e checkout.',
    icon: ShoppingBag,
  },
];

/**
 * Landing pública — Dark Mode Premium.
 * Mic = push-to-talk: click start → click stop → texto no input.
 */
export default function Landing() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [modelosOpen, setModelosOpen] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [micError, setMicError] = useState('');

  const textareaRef = useRef(null);
  const modelosRef = useRef(null);

  const onCommit = useCallback((transcript) => {
    const text = (transcript || '').trim();
    setLiveTranscript('');
    if (!text) {
      setMicError((prev) => prev || 'Não capturou áudio. Tente de novo.');
      return;
    }
    setMicError('');
    setInput(text);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const {
    listening,
    transcript: sttTranscript,
    volume: micVolume,
    start: startStt,
    stop: stopStt,
    cancel: cancelStt,
    supported: sttSupported,
  } = useSpeechRecognition({
    onCommit,
    onInterim: setLiveTranscript,
    onError: (msg) => setMicError(msg),
    lang: 'pt-BR',
    autoCommitOnSilence: false,
  });

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  useEffect(() => {
    function onDocClick(e) {
      if (!modelosRef.current?.contains(e.target)) setModelosOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setModelosOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (listening && sttTranscript) setLiveTranscript(sttTranscript);
  }, [listening, sttTranscript]);

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

  function applyModelo(modelo) {
    setModelosOpen(false);
    setInput(modelo.prompt);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function handleLogout() {
    await logout();
  }

  async function handleMicClick() {
    if (loading) return;
    if (listening) {
      stopStt();
      return;
    }
    setLiveTranscript('');
    setMicError('');
    if (!sttSupported) {
      setMicError('Reconhecimento de voz indisponível neste navegador (use Chrome)');
      textareaRef.current?.focus();
      return;
    }
    await startStt();
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden font-display text-zinc-100 bg-zinc-950">
      <VideoBackground variant="dark" />

      <header className="relative z-20 flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-10 h-14 sm:h-16 border-b border-white/10 bg-zinc-950/40 backdrop-blur-md">
        <Logo to="/" variant="dark" />

        <nav className="hidden lg:flex items-center gap-7 text-[13px] font-medium text-zinc-400">
          <a href="#prompt" className="hover:text-zinc-100 transition-colors">
            Produto
          </a>

          <div
            ref={modelosRef}
            className="relative"
            onMouseEnter={() => setModelosOpen(true)}
            onMouseLeave={() => setModelosOpen(false)}
          >
            <button
              type="button"
              onClick={() => setModelosOpen((v) => !v)}
              className="inline-flex items-center gap-1 hover:text-zinc-100 transition-colors"
              aria-expanded={modelosOpen}
              aria-haspopup="menu"
            >
              Modelos
              <ChevronDown
                size={14}
                className={`opacity-70 transition-transform ${modelosOpen ? 'rotate-180' : ''}`}
              />
            </button>

            <div
              role="menu"
              className={`absolute left-1/2 -translate-x-1/2 top-full pt-2 transition-all duration-200 ${
                modelosOpen
                  ? 'opacity-100 visible translate-y-0'
                  : 'opacity-0 invisible -translate-y-1 pointer-events-none'
              }`}
            >
              <div className="w-72 rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-xl shadow-2xl shadow-black/50 p-1.5">
                {MODELOS.map((modelo) => {
                  const Icon = modelo.icon;
                  return (
                    <button
                      key={modelo.id}
                      type="button"
                      role="menuitem"
                      onClick={() => applyModelo(modelo)}
                      className="w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-all hover:bg-zinc-900 border border-transparent hover:border-zinc-800"
                    >
                      <span className="mt-0.5 w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-blue-400 shrink-0">
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-zinc-100">
                          {modelo.label}
                        </span>
                        <span className="block text-[11px] text-zinc-500 mt-0.5 leading-snug">
                          {modelo.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <a href="#prompt" className="hover:text-zinc-100 transition-colors">
            Preços
          </a>
          <Link to="/integrations" className="hover:text-zinc-100 transition-colors">
            Integrações
          </Link>
          <Link to="/automations" className="hover:text-zinc-100 transition-colors">
            Automations
          </Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {user ? (
            <>
              <Link
                to="/dashboard"
                className="px-3 py-1.5 text-[13px] font-medium transition-all text-zinc-300 hover:text-white"
              >
                Dashboard
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                title="Sair"
                className="inline-flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-lg border transition-all bg-zinc-900/80 hover:bg-zinc-900 border-zinc-700"
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
                className="px-3 py-1.5 text-[13px] font-medium transition-all text-zinc-300 hover:text-white"
              >
                Entrar
              </Link>
              <Link
                to="/register"
                className="px-4 py-1.5 text-[13px] font-semibold rounded-lg shadow-sm transition-all text-white bg-blue-600 hover:bg-blue-500"
              >
                Começar
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="relative z-10 flex items-center justify-center px-4 min-h-[calc(100vh-3.5rem)] sm:min-h-[calc(100vh-4rem)]">
        <div className="w-full max-w-[42rem] mx-auto flex flex-col items-center text-center">
          <div className="mb-5 inline-flex items-center gap-2 px-3 py-1 rounded-full border backdrop-blur-sm bg-zinc-900/70 border-zinc-700/80">
            <Zap size={12} className="text-blue-400" />
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Builder de apps com IA
            </span>
          </div>

          <h1 className="text-center text-[2.15rem] sm:text-5xl lg:text-[3.4rem] font-bold tracking-tight leading-[1.12] mb-4 sm:mb-5 text-zinc-50">
            Crie algo com a GoCreate
          </h1>
          <p className="text-center text-base sm:text-lg mb-8 sm:mb-10 max-w-xl leading-relaxed text-zinc-400">
            Descreve o produto. O GoCreate monta interface, fluxo e lógica — pronto a editar.
          </p>

          <form
            id="prompt"
            onSubmit={handleSubmit}
            className={`w-full backdrop-blur-md rounded-xl sm:rounded-2xl border px-3 sm:px-4 py-2.5 sm:py-2 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-1 transition-all focus-within:shadow-lg bg-zinc-900/80 shadow-[0_8px_40px_rgba(0,0,0,0.35)] border-zinc-700/90 focus-within:border-blue-500/50 ${
              listening ? 'ring-2 ring-red-500/40' : ''
            }`}
          >
            <div className="hidden sm:flex w-8 h-8 shrink-0 rounded-lg items-center justify-center bg-zinc-800 text-zinc-400">
              <Zap size={14} />
            </div>

            <textarea
              ref={textareaRef}
              value={listening && liveTranscript ? liveTranscript : input}
              onChange={(e) => {
                if (!listening) setInput(e.target.value);
              }}
              disabled={loading || listening}
              placeholder="Ex.: app de reservas com agenda e confirmação por WhatsApp…"
              rows={1}
              className="flex-1 w-full bg-transparent border-none resize-none outline-none text-[15px] placeholder:text-zinc-500 py-2.5 sm:py-2 px-1 min-h-[44px] max-h-[120px] leading-snug text-zinc-100 text-left"
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
                disabled={!input.trim() || loading || listening}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold text-white transition-all rounded-lg disabled:opacity-40 bg-blue-600 hover:bg-blue-500 disabled:hover:bg-blue-600"
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
                onClick={handleMicClick}
                className={`relative p-2.5 rounded-lg transition-all disabled:opacity-40 ${
                  listening
                    ? 'text-red-200 bg-red-500/25 landing-mic-listening'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
                title={listening ? 'Concluir gravação' : 'Falar (segurar com cliques)'}
                aria-label={listening ? 'Parar e usar texto' : 'Iniciar microfone'}
                aria-pressed={listening}
              >
                {listening && <span className="landing-mic-pulse" aria-hidden />}
                <Mic size={18} className="relative z-[1]" />
              </button>
            </div>
          </form>

          {(listening || micError) && (
            <div className="mt-4 w-full rounded-xl border backdrop-blur-md px-4 py-3.5 landing-mic-panel-in bg-zinc-900/85 border-zinc-700/80 text-left">
              {listening && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="landing-mic-dot" aria-hidden />
                    <span className="text-sm font-semibold text-red-300">A gravar…</span>
                    <button
                      type="button"
                      onClick={() => stopStt()}
                      className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-md transition-all text-white bg-red-600/80 hover:bg-red-500"
                    >
                      Concluir
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        cancelStt();
                        setLiveTranscript('');
                        setMicError('');
                      }}
                      className="text-xs font-medium px-2 py-1 rounded-md text-zinc-400 hover:bg-zinc-800"
                    >
                      Cancelar
                    </button>
                  </div>
                  <p className="text-sm leading-relaxed min-h-[1.25rem] text-zinc-300">
                    {liveTranscript || <span className="text-zinc-500">Fale o que quer criar…</span>}
                  </p>
                  <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-red-400 transition-[width] duration-75"
                      style={{ width: `${Math.round(Math.min(1, micVolume) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {micError && !listening && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-red-400">{micError}</p>
                  <button
                    type="button"
                    onClick={() => setMicError('')}
                    className="text-xs text-zinc-500"
                  >
                    Fechar
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 w-full">
            {PROMPT_STARTERS.map((label) => (
              <button
                key={label}
                type="button"
                disabled={loading || listening}
                onClick={() => applyStarter(label)}
                className="px-3 py-1.5 text-[12px] sm:text-[13px] font-medium rounded-lg transition-all disabled:opacity-40 backdrop-blur-sm border text-zinc-300 bg-zinc-900/70 hover:bg-zinc-900 border-zinc-700 hover:border-zinc-600"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
