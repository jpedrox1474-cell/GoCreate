import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  Send,
  Mic,
  Plus,
  Zap,
  Download,
  Menu,
  Paperclip,
  Settings,
  Save,
  ArrowLeft,
  Wand2,
  Play,
  ChevronRight,
  Square,
  LayoutTemplate,
  BarChart3,
  CreditCard,
  Smartphone,
  PanelLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCredits } from '../context/CreditsContext';
import Toast from '../components/Toast';
import CreditsBadge from '../components/CreditsBadge';
import Logo from '../components/Logo';
import WorkspacePanel from '../components/editor/WorkspacePanel';
import HistoryDrawer from '../components/editor/HistoryDrawer';
import ExportModal from '../components/editor/ExportModal';
import DeployModal from '../components/editor/DeployModal';
import SettingsModal from '../components/editor/SettingsModal';
import { createProject, getProject, listenToMessages, touchProject, listUserProjects } from '../lib/projects';
import { streamChat, InsufficientCreditsError } from '../lib/chatApi';
import { extractAiDisplay, parseArtifacts } from '../lib/artifactParser';
import {
  getProjectById,
  getMessagesForProject,
  PENDING_PROMPT_KEY,
} from '../lib/mockData';

// Empty VITE_API_URL = same-origin /api/* (Firebase Hosting → gocreateApi).
// Only force demo replies with VITE_USE_MOCK_CHAT=true (local UI demos).
const USE_MOCK_CHAT = import.meta.env.VITE_USE_MOCK_CHAT === 'true';
const HAS_API = !USE_MOCK_CHAT;
const MOCK_IDS = new Set(['landing-saas', 'dashboard-analytics', 'checkout-pix']);

const QUICK_ACTIONS = [
  { label: 'Criar Landing Page', prompt: 'Cria uma landing page moderna para um SaaS de produtividade, com hero, features, pricing e CTA.', icon: LayoutTemplate },
  { label: 'Criar Dashboard', prompt: 'Cria um dashboard analytics com KPIs, gráficos e tabela de dados recentes.', icon: BarChart3 },
  { label: 'Criar Checkout', prompt: 'Cria um fluxo de checkout com Pix QR Code e formulário de cartão.', icon: CreditCard },
  { label: 'Criar App UI', prompt: 'Cria um ecrã mobile de app com navegação inferior e lista de cards.', icon: Smartphone },
];

function sanitizeMessages(msgs, mergeFiles) {
  const cleaned = [];
  const collected = {};
  for (const m of msgs || []) {
    if (m.role === 'ai') {
      const { displayText, files } = extractAiDisplay(m.text);
      Object.assign(collected, files);
      cleaned.push({ ...m, text: displayText });
    } else {
      cleaned.push(m);
    }
  }
  if (typeof mergeFiles === 'function' && Object.keys(collected).length) {
    mergeFiles(collected);
  }
  return cleaned;
}

export default function Editor() {
  const { projectId: routeId } = useParams();
  const { user } = useAuth();
  const { openPricing } = useCredits();
  const navigate = useNavigate();

  const [firestoreId, setFirestoreId] = useState(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [generatedFiles, setGeneratedFiles] = useState({});
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeTab, setActiveTab] = useState('preview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [previewMode, setPreviewMode] = useState('desktop');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [pendingUserText, setPendingUserText] = useState(null);
  const [activeFile, setActiveFile] = useState(null);
  const [toast, setToast] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectMeta, setProjectMeta] = useState(null);
  const [historyProjects, setHistoryProjects] = useState([]);
  const [creditsExhausted, setCreditsExhausted] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const pendingSentRef = useRef(false);
  const streamBufferRef = useRef('');
  const abortRef = useRef(null);
  const mockTimerRef = useRef(null);
  const useLiveChat = HAS_API && firestoreId && !MOCK_IDS.has(routeId);

  const project = projectMeta || getProjectById(routeId || 'new');
  const showQuickActions =
    !isGenerating &&
    !projectLoading &&
    messages.length <= 1 &&
    !streamingText &&
    !pendingUserText;

  const mergeGeneratedFiles = useCallback((incoming) => {
    if (!incoming || !Object.keys(incoming).length) return;
    setGeneratedFiles((prev) => {
      const next = { ...prev, ...incoming };
      return next;
    });
    setActiveFile((current) => {
      if (current && incoming[current] !== undefined) return current;
      const keys = Object.keys(incoming);
      return keys[0] || current;
    });
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    let unsub = () => {};
    let cancelled = false;
    setProjectLoading(true);
    pendingSentRef.current = false;

    async function init() {
      if (routeId && MOCK_IDS.has(routeId)) {
        if (!cancelled) {
          setFirestoreId(null);
          setProjectMeta(getProjectById(routeId));
          setGeneratedFiles({});
          setActiveFile(null);
          setMessages(
            sanitizeMessages(getMessagesForProject(routeId), (files) => {
              if (!cancelled) {
                setGeneratedFiles((prev) => ({ ...prev, ...files }));
                setActiveFile((cur) => cur || Object.keys(files)[0] || null);
              }
            })
          );
          setProjectLoading(false);
        }
        return;
      }

      try {
        if (routeId === 'new' || !routeId) {
          const id = await createProject(user.uid, { name: 'Novo Projeto' });
          if (cancelled) return;
          navigate(`/editor/${id}`, { replace: true });
          return;
        }

        const id = routeId;
        const meta = await getProject(id);
        if (cancelled) return;
        setProjectMeta(meta || getProjectById(id));
        setFirestoreId(id);
        setGeneratedFiles({});
        setActiveFile(null);

        listUserProjects(user.uid)
          .then((list) => {
            if (!cancelled) setHistoryProjects(list);
          })
          .catch(() => {});

        unsub = listenToMessages(id, (msgs) => {
          if (!cancelled) {
            const source = msgs.length ? msgs : getMessagesForProject('default');
            setMessages(
              sanitizeMessages(source, (files) => {
                setGeneratedFiles((prev) => ({ ...prev, ...files }));
                setActiveFile((cur) => cur || Object.keys(files)[0] || null);
              })
            );
            setProjectLoading(false);
          }
        });
      } catch (err) {
        console.error('[Editor] projeto:', err);
        if (!cancelled) {
          setFirestoreId(null);
          setMessages(
            sanitizeMessages(getMessagesForProject(routeId || 'default'), (files) => {
              setGeneratedFiles((prev) => ({ ...prev, ...files }));
              setActiveFile((cur) => cur || Object.keys(files)[0] || null);
            })
          );
          setProjectLoading(false);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
      unsub();
    };
  }, [user, routeId, navigate]);

  useEffect(() => {
    const keys = Object.keys(generatedFiles);
    if (!keys.length) {
      if (activeFile) setActiveFile(null);
      return;
    }
    if (!activeFile || !generatedFiles[activeFile]) {
      setActiveFile(keys[0]);
    }
  }, [generatedFiles, activeFile]);

  useEffect(() => {
    if (!user || projectLoading || pendingSentRef.current) return;
    const pending = sessionStorage.getItem(PENDING_PROMPT_KEY);
    if (!pending) return;
    pendingSentRef.current = true;
    sessionStorage.removeItem(PENDING_PROMPT_KEY);
    setInput(pending);
    setTimeout(() => sendMessageText(pending), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, projectLoading, firestoreId]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, streamingText, pendingUserText]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (mockTimerRef.current) clearTimeout(mockTimerRef.current);
    };
  }, []);

  const applyAiRaw = useCallback(
    (raw) => {
      const { displayText, files } = extractAiDisplay(raw);
      mergeGeneratedFiles(files);
      return displayText;
    },
    [mergeGeneratedFiles]
  );

  const finishGeneration = useCallback(() => {
    setIsGenerating(false);
    setIsTyping(false);
    setTimeout(() => {
      setPendingUserText(null);
      setStreamingText('');
      streamBufferRef.current = '';
    }, 400);
  }, []);

  const sendMessageText = useCallback(
    async (userText) => {
      if (!userText?.trim() || isGenerating || !user) return;
      const trimmed = userText.trim();
      setInput('');
      setCreditsExhausted(false);
      setIsGenerating(true);
      setIsTyping(true);
      setPendingUserText(trimmed);
      setStreamingText('');
      streamBufferRef.current = '';
      if (textareaRef.current) textareaRef.current.style.height = 'auto';

      const controller = new AbortController();
      abortRef.current = controller;

      const pushLocalTurn = (aiText) => {
        setMessages((prev) => [
          ...prev,
          { id: `u-${Date.now()}`, role: 'user', text: trimmed },
          { id: `a-${Date.now()}`, role: 'ai', text: aiText },
        ]);
        setStreamingText('');
        setPendingUserText(null);
      };

      // Demo-only mock projects — never invent replies for real projects.
      if (USE_MOCK_CHAT || (routeId && MOCK_IDS.has(routeId))) {
        pushLocalTurn(
          'Este projeto é só demonstração. Abre um projeto novo no Dashboard para a IA gerar código de verdade a partir do teu prompt.'
        );
        finishGeneration();
        return;
      }

      if (!firestoreId) {
        setIsTyping(false);
        pushLocalTurn(
          'Projeto ainda não está pronto. Recarrega a página ou cria um projeto novo no Dashboard e tenta outra vez.'
        );
        finishGeneration();
        return;
      }

      const historyForApi = [
        ...messages.map((m) => ({ role: m.role, text: m.text })),
        { role: 'user', text: trimmed },
      ];
      try {
        const idToken = await user.getIdToken();
        const result = await streamChat({
          projectId: firestoreId,
          messages: historyForApi,
          idToken,
          signal: controller.signal,
          onChunk: (chunk) => {
            setIsTyping(false);
            streamBufferRef.current += chunk;
            const { cleanText, files, hadArtifacts } = parseArtifacts(streamBufferRef.current);
            if (Object.keys(files).length) mergeGeneratedFiles(files);
            const display =
              cleanText ||
              (Object.keys(files).length || hadArtifacts
                ? 'Interface gerada com sucesso. Verifique o painel ao lado.'
                : '');
            setStreamingText(display);
          },
        });
        if (controller.signal.aborted) {
          finishGeneration();
          return;
        }
        if (result?.text) applyAiRaw(result.text);
        else if (!streamBufferRef.current.trim()) {
          setIsTyping(false);
          pushLocalTurn(
            'A API respondeu sem conteúdo. Confirma que o backend tem GEMINI_API_KEY e tenta de novo.'
          );
        }
      } catch (err) {
        if (err?.name === 'AbortError' || controller.signal.aborted) {
          setStreamingText((prev) => prev || 'Geração interrompida.');
          finishGeneration();
          return;
        }
        // 403 créditos — UI dedicada, NÃO bubble de IA / mock
        if (err instanceof InsufficientCreditsError || err?.status === 403 || err?.name === 'InsufficientCreditsError') {
          setIsTyping(false);
          setPendingUserText(null);
          setStreamingText('');
          streamBufferRef.current = '';
          setCreditsExhausted(true);
          openPricing();
          finishGeneration();
          return;
        }
        console.error('[Editor] chat:', err);
        setIsTyping(false);
        const detail = err?.message || 'erro desconhecido';
        pushLocalTurn(
          `Não consegui gerar a app: ${detail}\n\nO teu pedido foi: «${trimmed.slice(0, 200)}${trimmed.length > 200 ? '…' : ''}». Corrigi a API e envia outra vez — não uso respostas de demonstração.`
        );
      } finally {
        if (!controller.signal.aborted) finishGeneration();
      }
    },
    [
      user,
      isGenerating,
      firestoreId,
      routeId,
      messages,
      applyAiRaw,
      mergeGeneratedFiles,
      finishGeneration,
      openPricing,
    ]
  );

  function handleStopGeneration() {
    abortRef.current?.abort();
    if (mockTimerRef.current) clearTimeout(mockTimerRef.current);
    setIsTyping(false);
    setIsGenerating(false);
    if (!streamingText) {
      setStreamingText('Geração interrompida.');
    }
    setTimeout(() => {
      setPendingUserText(null);
      setStreamingText('');
      streamBufferRef.current = '';
    }, 600);
  }

  function handleSendMessage(e) {
    e.preventDefault();
    sendMessageText(input);
  }

  function handleAskFix(errorMsg) {
    const prompt = `Há um erro no preview. Por favor corrige o código.\n\nErro:\n${errorMsg}`;
    sendMessageText(prompt);
  }

  function handleNewChat() {
    abortRef.current?.abort();
    if (routeId && MOCK_IDS.has(routeId)) {
      setMessages(sanitizeMessages(getMessagesForProject(routeId || 'default'), mergeGeneratedFiles));
      setInput('');
      setGeneratedFiles({});
      setActiveFile(null);
      setStreamingText('');
      setPendingUserText(null);
      setIsGenerating(false);
      setIsTyping(false);
      return;
    }
    navigate('/editor/new');
  }

  async function handleSaveProject() {
    if (firestoreId) {
      await touchProject(firestoreId);
    }
    setToast({ message: 'Projeto guardado.', type: 'success' });
  }

  function handleProjectUpdated(next) {
    setProjectMeta((prev) => ({ ...(prev || {}), ...next }));
    setHistoryProjects((prev) => {
      if (!firestoreId) return prev;
      const exists = prev.some((p) => p.id === firestoreId);
      if (!exists) return prev;
      return prev.map((p) => (p.id === firestoreId ? { ...p, ...next } : p));
    });
  }

  async function refreshHistory() {
    if (!user?.uid) return;
    try {
      const list = await listUserProjects(user.uid);
      setHistoryProjects(list);
    } catch {
      // ignore
    }
  }

  return (
    <div className="gc-app-shell flex flex-col h-screen w-full bg-zinc-950 text-zinc-300 font-sans selection:bg-indigo-500/30">
      <header className="flex items-center justify-between px-3 sm:px-4 h-14 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-md transition-all lg:hidden"
          >
            <Menu size={18} />
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="hidden lg:inline-flex p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-md transition-all"
            title={historyOpen ? 'Recolher histórico' : 'Abrir histórico'}
          >
            <PanelLeft size={16} />
          </button>

          <Logo to="/dashboard" variant="dark" size="sm" />

          <div className="h-4 w-px bg-zinc-800 mx-1 hidden sm:block" />

          <Link
            to="/dashboard"
            className="hidden sm:inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-all"
          >
            <ArrowLeft size={12} />
            Projetos
          </Link>

          <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900/50 rounded-md border border-zinc-800/50 min-w-0">
            <span className="text-sm text-zinc-300 font-medium truncate max-w-[120px] sm:max-w-[180px]">
              {project.name}
            </span>
            <ChevronRight size={14} className="text-zinc-500 shrink-0" />
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <CreditsBadge />
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              className="hidden sm:block w-7 h-7 rounded-full object-cover border border-zinc-700"
            />
          ) : (
            <div className="hidden sm:flex w-7 h-7 rounded-full bg-blue-600 items-center justify-center text-[10px] font-bold text-white">
              {(user?.displayName || user?.email || 'U')[0].toUpperCase()}
            </div>
          )}
          <button
            type="button"
            onClick={handleSaveProject}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 rounded-md transition-all"
          >
            <Save size={14} />
            Salvar
          </button>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 rounded-md transition-all"
          >
            <Download size={14} />
            Exportar
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 rounded-md transition-all"
            title="Configurações"
          >
            <Settings size={16} />
          </button>
          <div className="w-px h-4 bg-zinc-800 mx-0.5 hidden sm:block" />
          <button
            type="button"
            onClick={() => setDeployOpen(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-all shadow-md shadow-blue-900/20"
          >
            <Play size={14} className="fill-white" />
            Deploy
          </button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        <div className="hidden lg:flex h-full">
          <HistoryDrawer
            open={historyOpen}
            onToggle={() => setHistoryOpen((v) => !v)}
            currentProjectId={routeId}
            onNewChat={() => {
              handleNewChat();
              refreshHistory();
            }}
            projects={historyProjects}
          />
        </div>

        <section
          className={`
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            absolute lg:relative z-20 h-full w-[340px] sm:w-[380px] border-r border-zinc-800 bg-zinc-950 flex flex-col transition-transform duration-300 ease-in-out shadow-2xl lg:shadow-none
          `}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
            <h2 className="text-sm font-semibold text-zinc-200">GoCreate Assistant</h2>
            <button
              type="button"
              onClick={handleNewChat}
              className="p-1 text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-800/50 transition-all"
              title="Novo chat"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar bg-gradient-to-b from-zinc-950 to-zinc-950">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`
                    max-w-[85%] p-3.5 text-sm leading-relaxed shadow-sm
                    ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm shadow-blue-900/20'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-2xl rounded-tl-sm'
                    }
                  `}
                >
                  {msg.role === 'ai' && (
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded bg-blue-500/20 flex items-center justify-center">
                        <Zap size={12} className="text-blue-400" />
                      </div>
                      <span className="text-xs font-medium text-zinc-500">GoCreate AI</span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            ))}

            {pendingUserText && (
              <div className="flex w-full justify-end">
                <div className="max-w-[85%] p-3.5 text-sm leading-relaxed bg-blue-600 text-white rounded-2xl rounded-tr-sm">
                  <p className="whitespace-pre-wrap">{pendingUserText}</p>
                </div>
              </div>
            )}

            {streamingText && (
              <div className="flex w-full justify-start">
                <div className="max-w-[85%] p-3.5 text-sm leading-relaxed bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-2xl rounded-tl-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded bg-blue-500/20 flex items-center justify-center">
                      <Zap size={12} className="text-blue-400" />
                    </div>
                    <span className="text-xs font-medium text-zinc-500">GoCreate AI</span>
                    {isGenerating && (
                      <span className="ml-auto flex gap-1 items-center">
                        <span className="w-1 h-1 bg-blue-400 rounded-full animate-pulse" />
                        <span className="text-[10px] text-blue-400/80">a escrever</span>
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap">{streamingText}</p>
                </div>
              </div>
            )}

            {isTyping && !streamingText && (
              <div className="flex w-full justify-start">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3.5 text-sm flex items-center gap-3">
                  <div className="flex items-center gap-1.5" aria-label="AI a gerar">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-duration:0.7s]" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-duration:0.7s]" style={{ animationDelay: '140ms' }} />
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-duration:0.7s]" style={{ animationDelay: '280ms' }} />
                  </div>
                  <span className="text-zinc-500 text-xs font-medium">
                    {useLiveChat || HAS_API ? 'IA a gerar…' : 'IA a pensar…'}
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} className="h-1" />
          </div>

          <div className="p-4 bg-zinc-950 border-t border-zinc-800/50">
            {creditsExhausted && (
              <div className="mb-3 rounded-xl border border-amber-700/40 bg-amber-950/30 p-3.5">
                <p className="text-sm text-amber-100 font-medium mb-1">
                  Ops! Seus créditos acabaram. Faça um upgrade para continuar criando.
                </p>
                <p className="text-xs text-amber-200/70 mb-3">
                  Cada geração consome 1 crédito. Escolhe um plano para continuar.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCreditsExhausted(false);
                    openPricing();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all"
                >
                  <Zap size={13} />
                  Ver Planos
                </button>
              </div>
            )}
            {showQuickActions && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {QUICK_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => sendMessageText(action.prompt)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 bg-zinc-900 border border-zinc-800/80 hover:border-blue-500/40 hover:text-zinc-100 rounded-full transition-all"
                    >
                      <Icon size={12} className="text-blue-400" />
                      {action.label}
                    </button>
                  );
                })}
              </div>
            )}

            <form
              onSubmit={handleSendMessage}
              className={`
                relative flex items-end bg-zinc-900 border rounded-xl overflow-hidden transition-all
                ${isGenerating ? 'border-blue-500/30' : 'border-zinc-700 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/50'}
              `}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isGenerating || projectLoading}
                placeholder={
                  projectLoading
                    ? 'A carregar…'
                    : isGenerating
                      ? 'A gerar…'
                      : 'Pede alterações, novas secções…'
                }
                className="w-full bg-transparent border-none py-3.5 pl-4 pr-28 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none resize-none max-h-[150px] custom-scrollbar"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-0.5 bg-zinc-900 pl-2">
                {isGenerating ? (
                  <button
                    type="button"
                    onClick={handleStopGeneration}
                    className="p-1.5 rounded-md bg-red-600/90 hover:bg-red-500 text-white transition-all flex items-center justify-center shadow-md"
                    title="Parar geração"
                  >
                    <Square size={14} className="fill-current" />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setToast({ message: 'Anexos em breve.', type: 'info' })}
                      className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded-md hover:bg-zinc-800 transition-all"
                      title="Anexar"
                    >
                      <Paperclip size={16} />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded-md hover:bg-zinc-800 transition-all"
                      title="Falar"
                    >
                      <Mic size={16} />
                    </button>
                    <button
                      type="submit"
                      disabled={!input.trim() || projectLoading}
                      className={`
                        p-1.5 rounded-md transition-all flex items-center justify-center
                        ${
                          input.trim()
                            ? 'bg-blue-600 text-white shadow-md hover:bg-blue-500'
                            : 'bg-zinc-800 text-zinc-600'
                        }
                      `}
                    >
                      <Send size={16} />
                    </button>
                  </>
                )}
              </div>
            </form>
            <div className="mt-2 flex justify-between items-center px-1">
              <span className="text-[10px] text-zinc-600 font-medium flex items-center gap-1">
                <Wand2 size={10} /> {HAS_API ? 'Gemini / API' : 'Modo demo'}
              </span>
              <span className="text-[10px] text-zinc-600 font-medium">
                {isGenerating ? 'Clica ■ para parar' : 'Shift + Enter'}
              </span>
            </div>
          </div>
        </section>

        {isSidebarOpen && (
          <div
            className="absolute inset-0 bg-black/50 z-10 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <WorkspacePanel
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          previewMode={previewMode}
          setPreviewMode={setPreviewMode}
          files={generatedFiles}
          activeFile={activeFile}
          setActiveFile={setActiveFile}
          isGenerating={isGenerating}
          onAskFix={handleAskFix}
        />
      </main>

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        files={generatedFiles}
        projectName={project.name}
        onToast={setToast}
      />
      <DeployModal
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
        projectName={project.name}
        projectId={firestoreId}
        files={generatedFiles}
        ownerId={user?.uid}
        onToast={setToast}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        project={project}
        projectId={firestoreId}
        onProjectUpdated={handleProjectUpdated}
        onToast={setToast}
      />

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
