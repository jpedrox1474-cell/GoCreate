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
  Undo2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCredits } from '../context/CreditsContext';
import Toast from '../components/Toast';
import CreditsBadge from '../components/CreditsBadge';
import UserMenu from '../components/UserMenu';
import Logo from '../components/Logo';
import WorkspacePanel from '../components/editor/WorkspacePanel';
import HistoryDrawer from '../components/editor/HistoryDrawer';
import ExportModal from '../components/editor/ExportModal';
import DeployModal from '../components/editor/DeployModal';
import SettingsModal from '../components/editor/SettingsModal';
import IntegrationsBanner from '../components/editor/IntegrationsBanner';
import SuggestedIntegrationsBanner from '../components/editor/SuggestedIntegrationsBanner';
import { createProject, getProject, listenToMessages, touchProject, listUserProjects, renameProject, deleteProject, deleteProjects, duplicateProject, saveMessage } from '../lib/projects';
import { scheduleAutomationCheck, rememberLastProjectId } from '../lib/automations';
import { streamChat, InsufficientCreditsError } from '../lib/chatApi';
import { uploadFile } from '../lib/uploadApi';
import {
  extractAiDisplay,
  parseArtifacts,
  CONTINUE_PROMPT,
  REQUEST_UI_PROMPT,
  pickRecoveryPrompt,
} from '../lib/artifactParser';
import { seedDetectedEntities } from '../lib/entities';
import { canEditProjectCode } from '../lib/plans';
import {
  resolveClientProjectRole,
  canEditProject,
  canViewProject,
  canManageProject,
} from '../lib/projectAccess';
import { listSharedProjects } from '../lib/meApi';
import { saveCheckpoint, undoLastCheckpoint, getLatestCheckpoint } from '../lib/checkpoints';
import {
  getProjectById,
  getMessagesForProject,
  PENDING_PROMPT_KEY,
  GENERATION_STATE_KEY,
} from '../lib/mockData';
import { useTheme } from '../context/ThemeContext';

function readGenerationSession() {
  try {
    const raw = sessionStorage.getItem(GENERATION_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeGenerationSession(payload) {
  try {
    sessionStorage.setItem(GENERATION_STATE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function clearGenerationSession() {
  try {
    sessionStorage.removeItem(GENERATION_STATE_KEY);
  } catch {
    /* ignore */
  }
}

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
  const [attachment, setAttachment] = useState(null); // { url, name, resourceType, mimeType }
  const [uploading, setUploading] = useState(false);
  const [chatMicListening, setChatMicListening] = useState(false);
  const [historySelectMode, setHistorySelectMode] = useState(false);
  const [historySelectedIds, setHistorySelectedIds] = useState(() => new Set());
  const [historyBulkDeleting, setHistoryBulkDeleting] = useState(false);
  const [agentRunning, setAgentRunning] = useState(null); // { type, message }
  const [streamHeartbeat, setStreamHeartbeat] = useState(null); // string | null
  const [resumeNotice, setResumeNotice] = useState(null); // string | null
  const [askFixPending, setAskFixPending] = useState(false);
  const [awaitingHistory, setAwaitingHistory] = useState(false);
  const [generationIncomplete, setGenerationIncomplete] = useState(false);
  const [generatedEntities, setGeneratedEntities] = useState([]);
  const [suggestedIntegrations, setSuggestedIntegrations] = useState([]);
  const continueAutoTriedRef = useRef(false);
  const lastRawRef = useRef('');
  const sendMessageTextRef = useRef(null);
  const localCodeEditsRef = useRef({});
  const codeBaselinesRef = useRef({});
  const codeSaveTimerRef = useRef(null);
  const [codeBaselines, setCodeBaselines] = useState({});
  const [dirtyCodeFiles, setDirtyCodeFiles] = useState(() => new Set());
  const [diffBaselines, setDiffBaselines] = useState({});
  const [canUndo, setCanUndo] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const pendingCheckpointRef = useRef(null);
  const generatedFilesRef = useRef({});
  const messagesRef = useRef([]);

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
  const chatMicActiveRef = useRef(false);
  const pendingUserTextRef = useRef(null);
  const optimisticClearTimerRef = useRef(null);
  const useLiveChat = HAS_API && firestoreId && !MOCK_IDS.has(routeId);
  const isBusy = isGenerating || Boolean(agentRunning) || askFixPending;

  useEffect(() => {
    attachmentRef.current = attachment;
  }, [attachment]);

  useEffect(() => {
    pendingUserTextRef.current = pendingUserText;
  }, [pendingUserText]);

  useEffect(() => {
    generatedFilesRef.current = generatedFiles;
  }, [generatedFiles]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Reload mid-generation: clear ghost incomplete states, show resume notice (stream can't resume).
  useEffect(() => {
    const stale = readGenerationSession();
    if (!stale) return;
    clearGenerationSession();
    if (stale.askFix) {
      setResumeNotice(
        'A correção pela IA foi interrompida ao recarregar. Pede novamente “Pedir para a IA consertar” se o erro continuar.'
      );
    } else {
      setResumeNotice(
        'A geração anterior foi interrompida ao recarregar. O histórico pode aparecer em breve — envia de novo se nada chegar.'
      );
    }
  }, []);

  // Clear optimistic bubbles once Firestore history catches up (or after timeout).
  useEffect(() => {
    if (!awaitingHistory || !pendingUserText) return undefined;
    const matched = messages.some(
      (m) => m.role === 'user' && m.text === pendingUserText
    );
    if (matched) {
      setPendingUserText(null);
      setStreamingText('');
      streamBufferRef.current = '';
      setAwaitingHistory(false);
      return undefined;
    }
    const t = setTimeout(() => {
      setPendingUserText(null);
      setStreamingText('');
      streamBufferRef.current = '';
      setAwaitingHistory(false);
    }, 3500);
    return () => clearTimeout(t);
  }, [messages, awaitingHistory, pendingUserText]);

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
  const projectRole = resolveClientProjectRole(projectMeta, user);
  const isReadOnly = projectMeta ? projectRole === 'viewer' : false;
  const canMutateProject = projectMeta ? canEditProject(projectRole) : true;
  const isProjectOwner = projectMeta ? canManageProject(projectRole) : true;
  const canEditCode = canEditProjectCode(user) && canMutateProject && !isReadOnly;
  const showQuickActions =
    !isGenerating &&
    !projectLoading &&
    !isReadOnly &&
    messages.length <= 1 &&
    !streamingText &&
    !pendingUserText;

  const mergeGeneratedFiles = useCallback((incoming) => {
    if (!incoming || !Object.keys(incoming).length) return;
    // Baselines = última versão da IA (antes de edições locais).
    setCodeBaselines((prev) => {
      const next = { ...prev };
      for (const [path, content] of Object.entries(incoming)) {
        if (localCodeEditsRef.current[path] == null) {
          next[path] = content;
          codeBaselinesRef.current[path] = content;
        }
      }
      return next;
    });
    setGeneratedFiles((prev) => {
      const next = { ...prev, ...incoming, ...localCodeEditsRef.current };
      return next;
    });
    setActiveFile((current) => {
      if (current && (incoming[current] !== undefined || localCodeEditsRef.current[current] !== undefined)) {
        return current;
      }
      const keys = Object.keys(incoming);
      return keys[0] || current;
    });
  }, []);

  const persistCodeEdit = useCallback(
    async (path) => {
      if (!firestoreId || !path) return;
      const latest = localCodeEditsRef.current[path];
      if (latest == null) return;
      const safe = String(latest).replace(/<\/file>/gi, '</\u200bfile>');
      const text =
        `Código atualizado manualmente (${path}).\n\n` +
        `<gocreate_artifact>\n` +
        `<file path="${path}">\n${safe}\n</file>\n` +
        `</gocreate_artifact>`;
      try {
        await saveMessage(firestoreId, { role: 'ai', text, uid: user?.uid || null });
        await touchProject(firestoreId);
        setDirtyCodeFiles((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      } catch (err) {
        console.error('[Editor] save code edit:', err);
        setToast({ message: 'Não foi possível guardar a edição do código.', type: 'error' });
      }
    },
    [firestoreId, user?.uid]
  );

  const handleChangeFile = useCallback(
    (path, content) => {
      if (!path || !canEditCode) return;
      localCodeEditsRef.current = { ...localCodeEditsRef.current, [path]: content };
      setGeneratedFiles((prev) => ({ ...prev, [path]: content }));
      setDirtyCodeFiles((prev) => {
        const next = new Set(prev);
        next.add(path);
        return next;
      });

      if (codeSaveTimerRef.current) clearTimeout(codeSaveTimerRef.current);
      codeSaveTimerRef.current = setTimeout(() => {
        persistCodeEdit(path);
      }, 900);
    },
    [canEditCode, persistCodeEdit]
  );

  const handleSaveFile = useCallback(
    (path) => {
      if (!path || !canEditCode) return;
      if (codeSaveTimerRef.current) {
        clearTimeout(codeSaveTimerRef.current);
        codeSaveTimerRef.current = null;
      }
      persistCodeEdit(path);
    },
    [canEditCode, persistCodeEdit]
  );

  const handleRevertFile = useCallback(
    (path) => {
      if (!path || !canEditCode) return;
      const baseline = codeBaselinesRef.current[path];
      if (baseline == null) return;
      localCodeEditsRef.current = { ...localCodeEditsRef.current, [path]: baseline };
      setGeneratedFiles((prev) => ({ ...prev, [path]: baseline }));
      setDirtyCodeFiles((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      if (codeSaveTimerRef.current) {
        clearTimeout(codeSaveTimerRef.current);
        codeSaveTimerRef.current = null;
      }
      persistCodeEdit(path);
      setToast({ message: `Ficheiro revertido: ${path}`, type: 'success' });
    },
    [canEditCode, persistCodeEdit]
  );

  const notifyAutomations = useCallback(
    (projectId) => {
      if (!projectId) return;
      scheduleAutomationCheck(projectId, {
        onStart: (info) => setAgentRunning(info),
        onToast: (payload) => setToast(payload),
        onComplete: () => setAgentRunning(null),
      });
    },
    []
  );

  const applyLoadedFiles = useCallback((files) => {
    if (!files || !Object.keys(files).length) return;
    setGeneratedFiles((prev) => ({ ...prev, ...files, ...localCodeEditsRef.current }));
    setCodeBaselines((prev) => {
      const next = { ...prev };
      for (const [path, content] of Object.entries(files)) {
        if (localCodeEditsRef.current[path] == null) {
          next[path] = content;
          codeBaselinesRef.current[path] = content;
        }
      }
      return next;
    });
    setActiveFile((cur) => cur || Object.keys(files)[0] || null);
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
              if (!cancelled) applyLoadedFiles(files);
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
        if (!meta) {
          setToast({ message: 'Projeto não encontrado.', type: 'error' });
          navigate('/dashboard', { replace: true });
          return;
        }
        const role = resolveClientProjectRole(meta, user);
        if (!canViewProject(role)) {
          setToast({ message: 'Sem permissão para abrir este projeto.', type: 'error' });
          navigate('/dashboard', { replace: true });
          return;
        }
        setProjectMeta(meta);
        setFirestoreId(id);
        rememberLastProjectId(id);
        localCodeEditsRef.current = {};
        codeBaselinesRef.current = {};
        setCodeBaselines({});
        setDirtyCodeFiles(new Set());
        if (codeSaveTimerRef.current) {
          clearTimeout(codeSaveTimerRef.current);
          codeSaveTimerRef.current = null;
        }
        setGeneratedFiles({});
        setActiveFile(null);
        setDiffBaselines({});
        setCanUndo(false);
        pendingCheckpointRef.current = null;

        Promise.all([
          listUserProjects(user.uid),
          user.getIdToken ? listSharedProjects(await user.getIdToken()).catch(() => []) : Promise.resolve([]),
        ])
          .then(([owned, shared]) => {
            if (cancelled) return;
            const ids = new Set(owned.map((p) => p.id));
            setHistoryProjects([
              ...owned,
              ...shared.filter((p) => !ids.has(p.id)).map((p) => ({ ...p, sharedRole: p.role })),
            ]);
          })
          .catch(() => {});

        getLatestCheckpoint(id)
          .then((cp) => {
            if (!cancelled && cp) {
              setCanUndo(true);
              if (cp.files && typeof cp.files === 'object') {
                setDiffBaselines(cp.files);
              }
            }
          })
          .catch(() => {});

        unsub = listenToMessages(id, (msgs) => {
          if (!cancelled) {
            const source = msgs.length ? msgs : getMessagesForProject('default');
            setMessages(
              sanitizeMessages(source, (files) => {
                applyLoadedFiles(files);
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
  }, [user, routeId, navigate, applyLoadedFiles]);

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
  }, [messages, isTyping, streamingText, pendingUserText, isGenerating, streamHeartbeat]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (mockTimerRef.current) clearTimeout(mockTimerRef.current);
      if (optimisticClearTimerRef.current) clearTimeout(optimisticClearTimerRef.current);
    };
  }, []);

  const applyEntities = useCallback(
    async (entities) => {
      if (!entities?.length) return;
      setGeneratedEntities(entities);
      if (!firestoreId) return;
      try {
        await seedDetectedEntities(firestoreId, entities);
      } catch (err) {
        console.warn('[Editor] seed entities:', err?.message);
      }
    },
    [firestoreId]
  );

  const applyAiRaw = useCallback(
    (raw) => {
      const { displayText, files, entities, incomplete } = extractAiDisplay(raw);
      mergeGeneratedFiles(files);
      if (entities?.length) {
        void applyEntities(entities);
      }
      return { displayText, files, entities, incomplete };
    },
    [mergeGeneratedFiles, applyEntities]
  );

  const finishGeneration = useCallback((opts = {}) => {
    const { clearOptimistic = true, waitForHistory = false } = opts;
    setIsGenerating(false);
    setIsTyping(false);
    setAskFixPending(false);
    setStreamHeartbeat(null);
    clearGenerationSession();
    if (optimisticClearTimerRef.current) {
      clearTimeout(optimisticClearTimerRef.current);
      optimisticClearTimerRef.current = null;
    }
    if (waitForHistory) {
      setAwaitingHistory(true);
      return;
    }
    if (!clearOptimistic) return;
    optimisticClearTimerRef.current = setTimeout(() => {
      setPendingUserText(null);
      setStreamingText('');
      streamBufferRef.current = '';
      optimisticClearTimerRef.current = null;
    }, 400);
  }, []);

  const sendMessageText = useCallback(
    async (userText, { askFix = false, isContinue = false, wiringPrompt = null } = {}) => {
      if (!userText?.trim() || isGenerating || !user) return;
      if (projectMeta && !canEditProject(resolveClientProjectRole(projectMeta, user))) {
        setToast({
          message: 'Modo visualizador — sem permissão para gerar ou alterar.',
          type: 'error',
        });
        return;
      }
      const trimmed = userText.trim();
      const currentAttachment = attachmentRef.current;
      setInput('');
      setAttachment(null);
      attachmentRef.current = null;
      setCreditsExhausted(false);
      setResumeNotice(null);
      setAskFixPending(Boolean(askFix));
      setGenerationIncomplete(false);
      if (!askFix && !isContinue) {
        continueAutoTriedRef.current = false;
      }
      setIsGenerating(true);
      setIsTyping(true);
      setPendingUserText(trimmed);
      setStreamingText('');
      setStreamHeartbeat(null);
      setAwaitingHistory(false);
      streamBufferRef.current = '';
      lastRawRef.current = '';
      if (textareaRef.current) textareaRef.current.style.height = 'auto';

      writeGenerationSession({
        projectId: firestoreId || routeId,
        prompt: trimmed.slice(0, 240),
        askFix: Boolean(askFix),
        startedAt: Date.now(),
      });

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
        setAwaitingHistory(false);
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

      // Snapshot pré-apply para checkpoint + diff (não em continue automático).
      if (!isContinue) {
        pendingCheckpointRef.current = {
          files: { ...generatedFilesRef.current },
          messageCount: messagesRef.current.length,
          prompt: trimmed,
        };
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
          attachmentResourceType: currentAttachment?.resourceType || null,
          attachmentMimeType: currentAttachment?.mimeType || null,
          wiringPrompt: wiringPrompt || null,
          idToken,
          signal: controller.signal,
          onSuggestedIntegrations: (ids) => {
            if (Array.isArray(ids) && ids.length) {
              setSuggestedIntegrations(ids);
            }
          },
          onHeartbeat: (msg) => {
            setStreamHeartbeat(msg);
            setStreamingText((prev) => prev || msg);
          },
          onChunk: (chunk) => {
            setIsTyping(false);
            setStreamHeartbeat(null);
            streamBufferRef.current += chunk;
            lastRawRef.current = streamBufferRef.current;
            const { cleanText, files, hadArtifacts, entities, incomplete } =
              parseArtifacts(streamBufferRef.current);
            if (Object.keys(files).length) mergeGeneratedFiles(files);
            if (entities?.length) void applyEntities(entities);
            const display =
              cleanText ||
              (Object.keys(files).length || hadArtifacts
                ? incomplete
                  ? 'Ainda a gerar…'
                  : 'A construir a interface…'
                : streamBufferRef.current.trim()
                  ? incomplete
                    ? 'Ainda a gerar…'
                    : 'A gerar…'
                  : '');
            setStreamingText(display);
          },
        });
        if (controller.signal.aborted) {
          finishGeneration();
          return;
        }

        const raw = result?.text || streamBufferRef.current || '';
        lastRawRef.current = raw;
        const parsed = applyAiRaw(raw);
        const fileCount = Object.keys(parsed.files || {}).length;
        const incomplete =
          Boolean(result?.incomplete) || Boolean(parsed.incomplete);

        if (parsed.displayText) setStreamingText(parsed.displayText);

        if (!raw.trim()) {
          setIsTyping(false);
          setGenerationIncomplete(true);
          pushLocalTurn(
            'A API respondeu sem conteúdo. Confirma que o backend tem GEMINI_API_KEY e tenta de novo.'
          );
          finishGeneration();
          return;
        }

        if (incomplete) {
          setGenerationIncomplete(true);
          // Keep any partial files — do not clear.
          const recovery = pickRecoveryPrompt(raw, fileCount);
          if (!continueAutoTriedRef.current && !askFix) {
            continueAutoTriedRef.current = true;
            setToast({
              message: 'Geração incompleta — a pedir o restante automaticamente…',
              type: 'info',
              duration: 3200,
            });
            finishGeneration({ clearOptimistic: false });
            setTimeout(() => {
              void sendMessageTextRef.current?.(recovery, { isContinue: true });
            }, 400);
            return;
          }
          setStreamingText(
            (parsed.displayText || 'A geração ficou incompleta.') +
              '\n\nPodes clicar em “Continuar geração” no preview ou enviar de novo.'
          );
          setResumeNotice(
            'Geração incompleta — a IA não enviou ficheiros completos. Clique Continuar.'
          );
          setToast({
            message: result?.timeoutMessage || 'Geração incompleta. Usa Continuar geração.',
            type: 'info',
            duration: 5200,
          });
          finishGeneration({ clearOptimistic: false });
          return;
        }

        // Apply bem-sucedido → persistir checkpoint + baselines de diff
        const snap = pendingCheckpointRef.current;
        if (snap && fileCount > 0) {
          setDiffBaselines(snap.files || {});
          void saveCheckpoint(firestoreId, {
            files: snap.files || {},
            messageCount: snap.messageCount,
            prompt: snap.prompt,
          })
            .then(() => setCanUndo(true))
            .catch((err) => console.warn('[Editor] checkpoint:', err?.message));
          pendingCheckpointRef.current = null;
        }

        setGenerationIncomplete(false);
        notifyAutomations(firestoreId);
        finishGeneration({ waitForHistory: true });
      } catch (err) {
        if (err?.name === 'AbortError' || controller.signal.aborted) {
          // Preserve partial files; mark incomplete if we got mid-stream XML.
          const partial = parseArtifacts(streamBufferRef.current);
          if (Object.keys(partial.files || {}).length) {
            mergeGeneratedFiles(partial.files);
          }
          if (partial.incomplete || !Object.keys(partial.files || {}).length) {
            setGenerationIncomplete(true);
          }
          setStreamingText((prev) => prev || 'Geração interrompida.');
          setToast({ message: 'Geração interrompida.', type: 'info', duration: 2800 });
          finishGeneration({ clearOptimistic: false });
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
          finishGeneration({ clearOptimistic: false });
          return;
        }
        console.error('[Editor] chat:', err);
        setIsTyping(false);
        const detail = err?.message || 'erro desconhecido';
        // Timeout with partial body may have been returned as Error before our partial-return path
        const partial = parseArtifacts(streamBufferRef.current);
        if (Object.keys(partial.files || {}).length) {
          mergeGeneratedFiles(partial.files);
          setGenerationIncomplete(true);
          setToast({
            message: `${detail} Ficheiros parciais mantidos — Continuar geração.`,
            type: 'info',
            duration: 5200,
          });
          finishGeneration({ clearOptimistic: false });
          return;
        }
        setToast({
          message: `Falha na geração: ${detail}`,
          type: 'error',
          duration: 5200,
        });
        setGenerationIncomplete(true);
        pushLocalTurn(
          `Não consegui gerar a app: ${detail}\n\nO teu pedido foi: «${trimmed.slice(0, 200)}${trimmed.length > 200 ? '…' : ''}». Corrigi a API e envia outra vez — não uso respostas de demonstração.`
        );
        finishGeneration({ clearOptimistic: false });
      } finally {
        // Safety net: never leave loaders spinning after the request settles.
        if (!controller.signal.aborted) {
          clearGenerationSession();
        }
      }
    },
    [
      user,
      isGenerating,
      firestoreId,
      routeId,
      messages,
      applyAiRaw,
      applyEntities,
      mergeGeneratedFiles,
      finishGeneration,
      openPricing,
      notifyAutomations,
    ]
  );

  sendMessageTextRef.current = sendMessageText;

  const handleUndoLastTurn = useCallback(async () => {
    if (!firestoreId || undoing || isBusy) return;
    if (
      !window.confirm(
        'Desfazer a última alteração da IA? Os ficheiros e as mensagens desse turno serão restaurados.'
      )
    ) {
      return;
    }
    setUndoing(true);
    try {
      const result = await undoLastCheckpoint(firestoreId);
      const restored = result.files || {};
      localCodeEditsRef.current = {};
      codeBaselinesRef.current = { ...restored };
      setCodeBaselines({ ...restored });
      setGeneratedFiles({ ...restored });
      setDiffBaselines({});
      setDirtyCodeFiles(new Set());
      setActiveFile((cur) => (cur && restored[cur] != null ? cur : Object.keys(restored)[0] || null));
      const nextCp = await getLatestCheckpoint(firestoreId);
      setCanUndo(Boolean(nextCp));
      setToast({
        message: 'Última alteração desfeita.',
        type: 'success',
      });
    } catch (err) {
      console.error('[Editor] undo:', err);
      setCanUndo(false);
      setToast({
        message: err?.message || 'Não foi possível desfazer.',
        type: 'error',
      });
    } finally {
      setUndoing(false);
    }
  }, [firestoreId, undoing, isBusy]);

  function handleStopGeneration() {
    abortRef.current?.abort();
    if (mockTimerRef.current) clearTimeout(mockTimerRef.current);
    setIsTyping(false);
    setIsGenerating(false);
    setAskFixPending(false);
    setStreamHeartbeat(null);
    setAwaitingHistory(false);
    setGenerationIncomplete(Boolean(streamBufferRef.current));
    clearGenerationSession();
    if (!streamingText) {
      setStreamingText('Geração interrompida.');
    }
    setToast({ message: 'Geração interrompida.', type: 'info', duration: 2800 });
    if (optimisticClearTimerRef.current) clearTimeout(optimisticClearTimerRef.current);
    optimisticClearTimerRef.current = setTimeout(() => {
      setPendingUserText(null);
      setStreamingText('');
      streamBufferRef.current = '';
      optimisticClearTimerRef.current = null;
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
        mimeType: result.mimeType || file.type || null,
      });
      setToast({
        message:
          result.resourceType === 'video'
            ? 'Clip pronto — a IA vai analisar o vídeo.'
            : result.resourceType === 'image'
              ? 'Imagem pronta — a IA vai analisar o conteúdo.'
              : 'Anexo pronto para enviar.',
        type: 'success',
      });
    } catch (err) {
      console.error('[Editor] upload:', err);
      const raw = String(err?.message || '');
      let message = raw || 'Falha no upload.';
      if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) {
        message = 'Falha de rede no upload. Verifica a ligação e tenta novamente.';
      } else if (/Unexpected end of form|MULTIPART/i.test(raw)) {
        message = 'Upload incompleto. Recarrega a página e tenta anexar de novo.';
      }
      setToast({ message, type: 'error' });
    } finally {
      setUploading(false);
    }
  }

  function stopChatMic() {
    chatMicActiveRef.current = false;
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

  /** Continuous push-to-talk: click to start, click again to stop and finalize into input. */
  function handleMicClick() {
    const mergeTranscript = (spoken) => {
      const base = chatMicBaseInputRef.current;
      if (!spoken) return base;
      return base ? `${base} ${spoken}` : spoken;
    };

    if (chatMicListening) {
      const finalText = chatFinalTranscriptRef.current.trim();
      if (finalText) setInput(mergeTranscript(finalText));
      stopChatMic();
      requestAnimationFrame(() => textareaRef.current?.focus());
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
    chatMicActiveRef.current = true;
    setChatMicListening(true);

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    chatRecognitionRef.current = recognition;

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
      const live = `${finalText} ${interim}`.trim();
      if (live) setInput(mergeTranscript(live));
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted') return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setToast({ message: 'Permissão do microfone negada.', type: 'error' });
        const finalText = chatFinalTranscriptRef.current.trim();
        if (finalText) setInput(mergeTranscript(finalText));
        stopChatMic();
        return;
      }
      // no-speech / network: keep session if user still wants continuous dictation
      if (!chatMicActiveRef.current) {
        const finalText = chatFinalTranscriptRef.current.trim();
        if (finalText) setInput(mergeTranscript(finalText));
        stopChatMic();
      }
    };

    recognition.onend = () => {
      if (chatMicActiveRef.current && chatRecognitionRef.current === recognition) {
        try {
          recognition.start();
          return;
        } catch {
          /* fall through to finalize */
        }
      }
      const finalText = chatFinalTranscriptRef.current.trim();
      if (finalText) setInput(mergeTranscript(finalText));
      chatRecognitionRef.current = null;
      chatMicActiveRef.current = false;
      setChatMicListening(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    };

    try {
      recognition.start();
    } catch {
      chatMicActiveRef.current = false;
      setChatMicListening(false);
      setToast({ message: 'Não foi possível iniciar o microfone.', type: 'error' });
    }
  }

  function handleAskFix(errorMsg) {
    if (isGenerating) {
      setToast({
        message: 'Já há uma geração em curso. Aguarda ou para com ■.',
        type: 'info',
        duration: 3200,
      });
      return;
    }
    const prompt = `Há um erro no preview. Por favor corrige o código.\n\nErro:\n${errorMsg}`;
    sendMessageText(prompt, { askFix: true });
  }

  function handleContinueGeneration() {
    if (isGenerating) {
      setToast({
        message: 'Já há uma geração em curso. Aguarda ou para com ■.',
        type: 'info',
        duration: 3200,
      });
      return;
    }
    const fileCount = Object.keys(generatedFiles).length;
    const recovery = pickRecoveryPrompt(lastRawRef.current || '', fileCount);
    setResumeNotice(null);
    setGenerationIncomplete(true);
    sendMessageText(fileCount > 0 ? CONTINUE_PROMPT : recovery || REQUEST_UI_PROMPT);
  }

  function handleRequestUi() {
    if (isGenerating) return;
    setResumeNotice(null);
    setGenerationIncomplete(false);
    sendMessageText(REQUEST_UI_PROMPT, { isContinue: true });
  }

  function handleNewChat() {
    abortRef.current?.abort();
    clearGenerationSession();
    setAskFixPending(false);
    setStreamHeartbeat(null);
    setAwaitingHistory(false);
    setAgentRunning(null);
    setResumeNotice(null);
    setGenerationIncomplete(false);
    setGeneratedEntities([]);
    continueAutoTriedRef.current = false;
    lastRawRef.current = '';
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
      setHistorySelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(project.id);
        return next;
      });
      setToast({ message: 'Projeto eliminado.', type: 'success' });
      if (firestoreId === project.id || routeId === project.id) {
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('[Editor] delete:', err);
      setToast({ message: 'Não foi possível eliminar.', type: 'error' });
    }
  }

  function enterHistorySelectMode(project) {
    setHistorySelectMode(true);
    setHistorySelectedIds(new Set([project.id]));
  }

  function exitHistorySelectMode() {
    setHistorySelectMode(false);
    setHistorySelectedIds(new Set());
  }

  function toggleHistorySelected(id) {
    setHistorySelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllHistoryProjects() {
    setHistorySelectedIds(new Set(historyProjects.map((p) => p.id)));
  }

  async function handleHistoryBulkDelete() {
    const ids = [...historySelectedIds];
    if (!ids.length || historyBulkDeleting) return;
    if (
      !window.confirm(
        `Eliminar ${ids.length} projeto${ids.length === 1 ? '' : 's'}? Esta ação não pode ser desfeita.`
      )
    ) {
      return;
    }
    setHistoryBulkDeleting(true);
    try {
      const result = await deleteProjects(ids);
      const deleted = new Set(result.deleted || []);
      setHistoryProjects((prev) => prev.filter((p) => !deleted.has(p.id)));
      setHistorySelectedIds(new Set());
      setHistorySelectMode(false);
      if (result.failed?.length) {
        setToast({
          message: `${deleted.size} eliminado(s); ${result.failed.length} falhou(aram).`,
          type: 'error',
        });
      } else {
        setToast({
          message: `${ids.length} projeto${ids.length === 1 ? '' : 's'} eliminado${ids.length === 1 ? '' : 's'}.`,
          type: 'success',
        });
      }
      if (firestoreId && deleted.has(firestoreId)) {
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('[Editor] bulk delete:', err);
      setToast({ message: 'Falha ao apagar selecionados.', type: 'error' });
      await refreshHistory();
    } finally {
      setHistoryBulkDeleting(false);
    }
  }

  return (
    <div className="gc-app-shell flex flex-col h-screen max-h-screen w-full overflow-hidden bg-zinc-950 text-zinc-300 font-sans selection:bg-indigo-500/30">
      {isBusy && (
        <div
          className="fixed top-0 left-0 right-0 z-[60] h-0.5 overflow-hidden pointer-events-none"
          aria-hidden
        >
          <div className="h-full w-1/3 bg-gradient-to-r from-blue-500 via-indigo-400 to-blue-500 animate-[gc-progress_1.4s_ease-in-out_infinite]" />
        </div>
      )}
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
          <CreditsBadge />
          <UserMenu variant="header" showName={false} className="hidden sm:block" />
          <button
            type="button"
            onClick={handleSaveProject}
            disabled={isReadOnly}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 rounded-md transition-all disabled:opacity-40"
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
            disabled={isReadOnly && !isProjectOwner}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 rounded-md transition-all disabled:opacity-40"
            title={isReadOnly ? 'Só leitura' : 'Configurações'}
          >
            <Settings size={16} />
          </button>
          <div className="w-px h-4 bg-zinc-800 mx-0.5 hidden sm:block" />
          {isReadOnly ? (
            <span className="px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-zinc-800 text-zinc-400 border border-zinc-700">
              Visualizador
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setDeployOpen(true)}
              className="flex items-center gap-2 px-3 sm:px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-all shadow-md shadow-blue-900/20"
            >
              <Play size={14} className="fill-white" />
              Deploy
            </button>
          )}
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
            selectMode={historySelectMode}
            selectedIds={historySelectedIds}
            onToggleSelect={toggleHistorySelected}
            onEnterSelectMode={enterHistorySelectMode}
            onExitSelectMode={exitHistorySelectMode}
            onSelectAll={selectAllHistoryProjects}
            onBulkDelete={handleHistoryBulkDelete}
            bulkDeleting={historyBulkDeleting}
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

          <IntegrationsBanner projectId={firestoreId} />
          <SuggestedIntegrationsBanner
            ids={suggestedIntegrations}
            projectId={firestoreId}
            onDismiss={() => setSuggestedIntegrations([])}
            onConnected={(id) => {
              setSuggestedIntegrations((prev) => prev.filter((x) => x !== id));
              setToast({
                message: `${id} ligado — a IA usará a integração no próximo prompt.`,
                type: 'success',
              });
            }}
          />

          {(resumeNotice || agentRunning) && (
            <div className="px-4 pt-3 space-y-2 shrink-0">
              {resumeNotice && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-950/40 px-3 py-2.5">
                  <p className="text-[11px] text-amber-100/90 leading-relaxed flex-1">{resumeNotice}</p>
                  {generationIncomplete && !isBusy && (
                    <button
                      type="button"
                      onClick={handleContinueGeneration}
                      className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md"
                    >
                      <Play size={10} />
                      Continuar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setResumeNotice(null)}
                    className="p-0.5 text-amber-400/70 hover:text-amber-200 shrink-0"
                    aria-label="Fechar aviso"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              {agentRunning && (
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-[11px] font-medium text-blue-200">
                  <Loader2 size={12} className="animate-spin text-blue-400" />
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400" />
                  </span>
                  {agentRunning.message || 'Agente em execução…'}
                </div>
              )}
            </div>
          )}

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
                      {/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(msg.attachmentUrl) ||
                      /\/image\/upload\//i.test(msg.attachmentUrl) ? (
                        <img
                          src={msg.attachmentUrl}
                          alt="Anexo"
                          className="max-h-36 w-full object-cover"
                        />
                      ) : /\.(mp4|webm|mov)(\?|$)/i.test(msg.attachmentUrl) ||
                        /\/video\/upload\//i.test(msg.attachmentUrl) ? (
                        <video
                          src={msg.attachmentUrl}
                          controls
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
                    {(isGenerating || awaitingHistory) && (
                      <span className="ml-auto flex gap-1.5 items-center">
                        <Loader2 size={11} className="text-blue-400 animate-spin" />
                        <span className="text-[10px] text-blue-400/80">
                          {streamHeartbeat || (awaitingHistory ? 'a guardar…' : 'a escrever')}
                        </span>
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap">{streamingText}</p>
                </div>
              </div>
            )}

            {isGenerating && !streamingText && (
              <div className="flex w-full justify-start">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3.5 text-sm flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div className="absolute inset-0 rounded-full bg-blue-600/25 blur-sm animate-pulse" />
                    <Loader2 size={16} className="relative text-blue-400 animate-spin" />
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-zinc-300 text-xs font-medium">
                      {askFixPending
                        ? 'IA a corrigir o código…'
                        : streamHeartbeat || (useLiveChat || HAS_API ? 'IA a gerar…' : 'IA a pensar…')}
                    </span>
                    <div className="flex items-center gap-1.5" aria-hidden>
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-duration:0.7s]" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-duration:0.7s]" style={{ animationDelay: '140ms' }} />
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-duration:0.7s]" style={{ animationDelay: '280ms' }} />
                    </div>
                  </div>
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
                    ) : attachment?.resourceType === 'video' ? (
                      <video
                        src={attachment.url}
                        muted
                        playsInline
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
                  disabled={isGenerating || projectLoading || isReadOnly}
                  placeholder={
                    projectLoading
                      ? 'A carregar…'
                      : isReadOnly
                        ? 'Modo visualizador — só leitura'
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
                        title={chatMicListening ? 'Concluir ditado' : 'Iniciar ditado'}
                        aria-label={chatMicListening ? 'Concluir ditado' : 'Iniciar ditado'}
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
            <div className="mt-2 flex justify-between items-center px-1 gap-2">
              <span className="text-[10px] text-zinc-600 font-medium flex items-center gap-1">
                <Wand2 size={10} /> {HAS_API ? 'Gemini / API' : 'Modo demo'}
              </span>
              <div className="flex items-center gap-2">
                {canUndo && !isBusy && (
                  <button
                    type="button"
                    disabled={undoing}
                    onClick={() => void handleUndoLastTurn()}
                    className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400/90 hover:text-amber-300 disabled:opacity-50 transition-colors"
                    title="Desfazer última alteração da IA"
                  >
                    {undoing ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <Undo2 size={10} />
                    )}
                    Desfazer última alteração
                  </button>
                )}
                <span className="text-[10px] text-zinc-600 font-medium">
                  {isGenerating ? 'Clica ■ para parar' : 'Shift + Enter'}
                </span>
              </div>
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
          isGenerating={isBusy}
          onAskFix={handleAskFix}
          onContinue={handleContinueGeneration}
          generationIncomplete={!isBusy && generationIncomplete}
          entitiesOnly={
            !isBusy &&
            !generationIncomplete &&
            Object.keys(generatedFiles).length === 0 &&
            generatedEntities.length > 0
          }
          onRequestUi={handleRequestUi}
          projectId={firestoreId}
          backendEnabled={Boolean(projectMeta?.backendEnabled)}
          projectAuth={projectMeta?.auth || null}
          authAccess={{
            mode: projectMeta?.authAccess?.mode === 'invited' ? 'invited' : 'owner_only',
            invitedEmails: Array.isArray(projectMeta?.authAccess?.invitedEmails)
              ? projectMeta.authAccess.invitedEmails
              : [],
            ownerId: projectMeta?.ownerId || user?.uid || null,
            ownerEmail: projectMeta?.ownerEmail || user?.email || null,
          }}
          canEditCode={canEditCode}
          onChangeFile={handleChangeFile}
          onSaveFile={handleSaveFile}
          onRevertFile={handleRevertFile}
          codeBaselines={codeBaselines}
          dirtyCodeFiles={dirtyCodeFiles}
          diffBaselines={diffBaselines}
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
        projectSlug={project.slug || null}
        files={generatedFiles}
        ownerId={user?.uid}
        ownerPlan={ownerPlan}
        backendEnabled={Boolean(project.backendEnabled)}
        onToast={setToast}
        onOpenSettings={() => setSettingsOpen(true)}
        onSlugUpdated={({ slug, publishedUrl }) => {
          handleProjectUpdated({
            ...project,
            slug,
            publishedUrl: publishedUrl || project.publishedUrl,
          });
        }}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        project={project}
        projectId={firestoreId}
        onProjectUpdated={handleProjectUpdated}
        onToast={setToast}
        onAddAuthToPages={(prompt) => {
          void sendMessageTextRef.current?.(prompt, { wiringPrompt: prompt });
        }}
        readOnly={!isProjectOwner && isReadOnly}
        canManageCollaborators={isProjectOwner}
      />

      <Toast
        message={toast?.message}
        type={toast?.type}
        duration={toast?.duration ?? 2800}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
