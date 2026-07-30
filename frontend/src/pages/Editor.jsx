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
  X,
  Loader2,
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
import VoiceAssistantModal from '../components/editor/VoiceAssistantModal';
import IntegrationsBanner from '../components/editor/IntegrationsBanner';
import { createProject, getProject, listenToMessages, touchProject, listUserProjects, renameProject, deleteProject, duplicateProject } from '../lib/projects';
import { scheduleAutomationCheck, rememberLastProjectId } from '../lib/automations';
import { streamChat, InsufficientCreditsError } from '../lib/chatApi';
import { uploadFile } from '../lib/uploadApi';
import { extractAiDisplay, parseArtifacts } from '../lib/artifactParser';
import {
  getProjectById,
  getMessagesForProject,
  PENDING_PROMPT_KEY,
} from '../lib/mockData';
import { useTheme } from '../context/ThemeContext';

function EditorLogo() {
  const { isLight } = useTheme();
  return <Logo to="/dashboard" variant={isLight ? 'light' : 'dark'} size="sm" />;
}

// Empty VITE_API_URL = same-origin /api/* (Firebase Hosting → gocreateApi).
// Only force demo replies with VITE_USE_MOCK_CHAT=true (local UI demos).
const USE_MOCK_CHAT = import.meta.env.VITE_USE_MOCK_CHAT === 'true';
const HAS_API = !USE_MOCK_CHAT;
const MOCK_IDS = new Set(['landing-saas', 'dashboard-analytics', 'checkout-pix']);

const QUICK_ACTIONS = [
  { label: 'Criar Landing Page', prompt: 'Cria uma landing page moderna para um SaaS de produtividade, com hero, features, pricing e CTA.', icon: LayoutTemplate },
  { label: 'Criar Dashboard', prompt: 'Cria um dashboard analytics com KPIs, gráficos e tabela de dados recentes.', icon: BarChart3 },
  { label: 'Criar Checkout', prompt: 'Cria um fluxo de checkout com Pix QR Code e formulário de cartão. Usa window.GoCreatePayments.createPix e createCheckout para pagamentos reais via Mercado Pago.', icon: CreditCard },
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
  const { openPricing, plan: ownerPlan } = useCredits();
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
  const [attachment, setAttachment] = useState(null); // { url, name, resourceType }
  const [uploading, setUploading] = useState(false);
  const [jarvisOpen, setJarvisOpen] = useState(false);
  const [chatMicListening, setChatMicListening] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const pendingSentRef = useRef(false);
  const streamBufferRef = useRef('');
  const abortRef = useRef(null);
  const mockTimerRef = useRef(null);
  const attachmentRef = useRef(null);
  const chatRecognitionRef = useRef(null);
  const chatFinalTranscriptRef = useRef('');
  const chatMicBaseInputRef = useRef('');
  const useLiveChat = HAS_API && firestoreId && !MOCK_IDS.has(routeId);

  useEffect(() => {
    attachmentRef.current = attachment;
  }, [attachment]);

  useEffect(() => {
    return () => {
      const rec = chatRecognitionRef.current;
      chatRecognitionRef.current = null;
      if (!rec) return;
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

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

  const notifyAutomations = useCallback(
    (projectId) => {
      if (!projectId) return;
      scheduleAutomationCheck(projectId, {
        onToast: (payload) => setToast(payload),
      });
    },
    []
  );

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
        rememberLastProjectId(id);
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
      const currentAttachment = attachmentRef.current;
      setInput('');
      setAttachment(null);
      attachmentRef.current = null;
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
          {
            id: `u-${Date.now()}`,
            role: 'user',
            text: trimmed,
            attachmentUrl: currentAttachment?.url || null,
          },
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
          attachmentUrl: currentAttachment?.url || null,
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
        if (result?.text) {
          applyAiRaw(result.text);
          notifyAutomations(firestoreId);
        } else if (!streamBufferRef.current.trim()) {
          setIsTyping(false);
          pushLocalTurn(
            'A API respondeu sem conteúdo. Confirma que o backend tem GEMINI_API_KEY e tenta de novo.'
          );
        } else {
          notifyAutomations(firestoreId);
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
      notifyAutomations,
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

  async function handleAttachFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    if (file.size > 25 * 1024 * 1024) {
      setToast({ message: 'Arquivo demasiado grande (máx. 25MB).', type: 'error' });
      return;
    }
    setUploading(true);
    try {
      const idToken = await user.getIdToken();
      const result = await uploadFile({ file, idToken });
      setAttachment({
        url: result.url,
        name: result.originalName || file.name,
        resourceType: result.resourceType || 'raw',
      });
      setToast({ message: 'Anexo pronto para enviar.', type: 'success' });
    } catch (err) {
      console.error('[Editor] upload:', err);
      setToast({ message: err?.message || 'Falha no upload.', type: 'error' });
    } finally {
      setUploading(false);
    }
  }

  function stopChatMic() {
    const rec = chatRecognitionRef.current;
    chatRecognitionRef.current = null;
    setChatMicListening(false);
    if (!rec) return;
    try {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.stop();
    } catch {
      /* already stopped */
    }
  }

  /** Chat mic = normal speech-to-text into the input. Does NOT open Jarvis. */
  function handleMicClick() {
    if (chatMicListening) {
      stopChatMic();
      return;
    }
    if (projectLoading || isGenerating) return;

    const SpeechRecognition =
      typeof window !== 'undefined'
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;
    if (!SpeechRecognition) {
      setToast({
        message: 'Microfone indisponível neste navegador.',
        type: 'error',
      });
      return;
    }

    stopChatMic();
    chatFinalTranscriptRef.current = '';
    chatMicBaseInputRef.current = input.trim();
    setChatMicListening(true);

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    chatRecognitionRef.current = recognition;

    const mergeTranscript = (spoken) => {
      const base = chatMicBaseInputRef.current;
      if (!spoken) return base;
      return base ? `${base} ${spoken}` : spoken;
    };

    recognition.onresult = (event) => {
      let interim = '';
      let finalText = chatFinalTranscriptRef.current;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) {
          finalText = `${finalText} ${piece}`.trim();
        } else {
          interim += piece;
        }
      }
      chatFinalTranscriptRef.current = finalText;
      const live = (finalText || interim).trim();
      if (live) setInput(mergeTranscript(live));
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setToast({ message: 'Permissão do microfone negada.', type: 'error' });
      }
      const finalText = chatFinalTranscriptRef.current.trim();
      if (finalText) setInput(mergeTranscript(finalText));
      stopChatMic();
    };

    recognition.onend = () => {
      const finalText = chatFinalTranscriptRef.current.trim();
      if (finalText) setInput(mergeTranscript(finalText));
      chatRecognitionRef.current = null;
      setChatMicListening(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    };

    try {
      recognition.start();
    } catch {
      setChatMicListening(false);
      setToast({ message: 'Não foi possível iniciar o microfone.', type: 'error' });
    }
  }

  function handleJarvisConfirmBuild(prompt) {
    setJarvisOpen(false);
    if (prompt?.trim()) {
      sendMessageText(prompt.trim());
    }
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
      notifyAutomations(firestoreId);
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

  async function handleRenameHistoryProject(project) {
    const next = window.prompt('Novo nome do projeto', project.name);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === project.name) return;
    try {
      await renameProject(project.id, trimmed);
      setHistoryProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, name: trimmed } : p))
      );
      if (projectMeta?.id === project.id || firestoreId === project.id) {
        setProjectMeta((prev) => (prev ? { ...prev, name: trimmed } : prev));
      }
      setToast({ message: 'Projeto renomeado.', type: 'success' });
    } catch (err) {
      console.error('[Editor] rename:', err);
      setToast({ message: 'Não foi possível renomear.', type: 'error' });
    }
  }

  async function handleDuplicateHistoryProject(project) {
    if (!user?.uid) return;
    try {
      const id = await duplicateProject(user.uid, project);
      setToast({ message: 'Projeto duplicado.', type: 'success' });
      await refreshHistory();
      navigate(`/editor/${id}`);
    } catch (err) {
      console.error('[Editor] duplicate:', err);
      setToast({ message: 'Não foi possível duplicar.', type: 'error' });
    }
  }

  async function handleDeleteHistoryProject(project) {
    if (!window.confirm(`Eliminar “${project.name}”? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteProject(project.id);
      setHistoryProjects((prev) => prev.filter((p) => p.id !== project.id));
      setToast({ message: 'Projeto eliminado.', type: 'success' });
      if (firestoreId === project.id || routeId === project.id) {
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('[Editor] delete:', err);
      setToast({ message: 'Não foi possível eliminar.', type: 'error' });
    }
  }

  return (
    <div className="gc-app-shell flex flex-col h-screen max-h-screen w-full overflow-hidden bg-zinc-950 text-zinc-300 font-sans selection:bg-indigo-500/30">
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

          <EditorLogo />

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
          <button
            type="button"
            onClick={() => setJarvisOpen(true)}
            disabled={projectLoading || isGenerating}
            className="inline-flex items-center gap-2 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-indigo-200/90 hover:text-white rounded-md transition-all border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-40"
            title="Modo Jarvis — assistente por voz (confirma antes de gerar)"
          >
            <span
              className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 shadow-sm shadow-indigo-500/40 shrink-0"
              aria-hidden
            />
            <span className="hidden sm:inline">Modo Jarvis</span>
            <span className="sm:hidden">Jarvis</span>
          </button>
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

      <main className="flex flex-1 min-h-0 overflow-hidden relative">
        <div className="hidden lg:flex h-full min-h-0 shrink-0">
          <HistoryDrawer
            open={historyOpen}
            onToggle={() => setHistoryOpen((v) => !v)}
            currentProjectId={routeId}
            onNewChat={() => {
              handleNewChat();
              refreshHistory();
            }}
            projects={historyProjects}
            onRenameProject={handleRenameHistoryProject}
            onDuplicateProject={handleDuplicateHistoryProject}
            onDeleteProject={handleDeleteHistoryProject}
          />
        </div>

        <section
          className={`
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            absolute lg:relative z-20 h-full min-h-0 w-[340px] sm:w-[380px] border-r border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden transition-transform duration-300 ease-in-out shadow-2xl lg:shadow-none
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

          <IntegrationsBanner user={user} projectId={firestoreId} files={generatedFiles} />

          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5 custom-scrollbar bg-zinc-950">
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
                  {msg.attachmentUrl && (
                    <a
                      href={msg.attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block mb-2 rounded-lg overflow-hidden border border-white/20 bg-black/20"
                    >
                      {/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(msg.attachmentUrl) ? (
                        <img
                          src={msg.attachmentUrl}
                          alt="Anexo"
                          className="max-h-36 w-full object-cover"
                        />
                      ) : (
                        <span className="block px-3 py-2 text-xs underline opacity-90 truncate">
                          {msg.attachmentUrl}
                        </span>
                      )}
                    </a>
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

          <div className="p-4 bg-zinc-950 border-t border-zinc-800/50 shrink-0">
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
                relative flex flex-col bg-zinc-900 border rounded-xl overflow-hidden transition-all
                ${isGenerating ? 'border-blue-500/30' : 'border-zinc-700 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/50'}
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,video/*,.pdf,.doc,.docx,.txt,.md,.json"
                onChange={handleAttachFile}
              />
              {(attachment || uploading) && (
                <div className="flex items-center gap-2 px-3 pt-3">
                  <div className="inline-flex items-center gap-2 max-w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-[11px] text-zinc-300">
                    {uploading ? (
                      <Loader2 size={12} className="animate-spin text-blue-400 shrink-0" />
                    ) : attachment?.resourceType === 'image' ? (
                      <img
                        src={attachment.url}
                        alt=""
                        className="w-6 h-6 rounded object-cover shrink-0"
                      />
                    ) : (
                      <Paperclip size={12} className="text-blue-400 shrink-0" />
                    )}
                    <span className="truncate">
                      {uploading ? 'A enviar…' : attachment?.name || 'Anexo'}
                    </span>
                    {attachment && !uploading && (
                      <button
                        type="button"
                        onClick={() => setAttachment(null)}
                        className="p-0.5 text-zinc-500 hover:text-zinc-200"
                        title="Remover anexo"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div className="relative flex items-end">
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
                        disabled={uploading || projectLoading}
                        onClick={() => fileInputRef.current?.click()}
                        className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded-md hover:bg-zinc-800 transition-all disabled:opacity-40"
                        title="Anexar ficheiro"
                      >
                        {uploading ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Paperclip size={16} />
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={projectLoading || isGenerating}
                        onClick={handleMicClick}
                        className={`p-1.5 rounded-md hover:bg-zinc-800 transition-all disabled:opacity-40 ${
                          chatMicListening
                            ? 'text-red-400 bg-red-500/10 animate-pulse'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                        title={
                          chatMicListening
                            ? 'Parar ditado (mensagem normal)'
                            : 'Ditar mensagem (voz → texto no chat)'
                        }
                        aria-label={chatMicListening ? 'Parar microfone' : 'Microfone do chat'}
                        aria-pressed={chatMicListening}
                      >
                        <Mic size={16} />
                      </button>
                      <button
                        type="submit"
                        disabled={!input.trim() || projectLoading || uploading}
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
          projectId={firestoreId}
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
        ownerPlan={ownerPlan}
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
      <VoiceAssistantModal
        open={jarvisOpen}
        onClose={() => setJarvisOpen(false)}
        onConfirmBuild={handleJarvisConfirmBuild}
      />

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
