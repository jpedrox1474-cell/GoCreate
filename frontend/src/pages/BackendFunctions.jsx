import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Code2,
  Loader2,
  Plus,
  Play,
  Trash2,
  Save,
  Power,
  Clock,
  Webhook,
  Zap,
  ScrollText,
  Copy,
  Check,
} from 'lucide-react';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { listUserProjects } from '../lib/projects';
import {
  listBackendFunctions,
  getBackendFunction,
  saveBackendFunction,
  deleteBackendFunction,
  runBackendFunction,
  listBackendFunctionLogs,
  tickCronFunctions,
  httpInvokeUrl,
  DEFAULT_HANDLER_CODE,
} from '../lib/functionsApi';

const TRIGGERS = [
  { id: 'http', label: 'HTTP', icon: Webhook },
  { id: 'event', label: 'Evento', icon: Zap },
  { id: 'cron', label: 'Cron', icon: Clock },
];

export default function BackendFunctions() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [functions, setFunctions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('http');
  const [code, setCode] = useState(DEFAULT_HANDLER_CODE);
  const [enabled, setEnabled] = useState(true);
  const [eventEntity, setEventEntity] = useState('');
  const [eventAction, setEventAction] = useState('create');
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [description, setDescription] = useState('');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [copied, setCopied] = useState(false);
  const [runOut, setRunOut] = useState(null);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) || null,
    [projects, projectId]
  );

  const loadProjects = useCallback(async () => {
    if (!user?.uid) return;
    const list = await listUserProjects(user.uid);
    setProjects(list);
    const fromQuery = searchParams.get('projectId');
    const pick =
      (fromQuery && list.find((p) => p.id === fromQuery)?.id) || list[0]?.id || null;
    setProjectId(pick);
  }, [user?.uid, searchParams]);

  const refresh = useCallback(async (pid) => {
    if (!user || !pid) {
      setFunctions([]);
      return;
    }
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const list = await listBackendFunctions({ idToken, projectId: pid });
      setFunctions(list);
    } catch (err) {
      setToast({ message: err?.message || 'Falha ao carregar funções.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProjects().catch(() =>
      setToast({ message: 'Não foi possível carregar projetos.', type: 'error' })
    );
  }, [loadProjects]);

  useEffect(() => {
    if (projectId) {
      setSearchParams({ projectId }, { replace: true });
      refresh(projectId);
      setSelected(null);
      setRunOut(null);
      setLogs([]);
    }
  }, [projectId, refresh, setSearchParams]);

  async function openFn(fn) {
    if (!user || !projectId) return;
    setBusy(true);
    setRunOut(null);
    try {
      const idToken = await user.getIdToken();
      const full = await getBackendFunction({ idToken, projectId, name: fn.name });
      setSelected(full);
      setName(full.name);
      setTrigger(full.trigger || 'http');
      setCode(full.code || DEFAULT_HANDLER_CODE);
      setEnabled(full.enabled !== false);
      setDescription(full.description || '');
      setEventEntity(full.event?.entity || '');
      setEventAction(full.event?.action || 'create');
      setIntervalMinutes(full.cron?.intervalMinutes || 60);
      const lg = await listBackendFunctionLogs({ idToken, projectId, name: full.name });
      setLogs(lg);
    } catch (err) {
      setToast({ message: err?.message || 'Falha ao abrir.', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function startNew() {
    setSelected(null);
    setName('');
    setTrigger('http');
    setCode(DEFAULT_HANDLER_CODE);
    setEnabled(true);
    setDescription('');
    setEventEntity('');
    setEventAction('create');
    setIntervalMinutes(60);
    setLogs([]);
    setRunOut(null);
  }

  async function handleSave() {
    if (!user || !projectId || !name.trim()) {
      setToast({ message: 'Indica um nome (ex: hello_world).', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      const body = {
        name: name.trim(),
        trigger,
        code,
        enabled,
        description,
        event: trigger === 'event' ? { entity: eventEntity, action: eventAction } : null,
        cron: trigger === 'cron' ? { intervalMinutes } : null,
      };
      const saved = await saveBackendFunction({
        idToken,
        projectId,
        name: name.trim(),
        body,
      });
      setSelected(saved);
      setToast({ message: 'Função guardada.', type: 'success' });
      await refresh(projectId);
    } catch (err) {
      setToast({ message: err?.message || 'Falha ao guardar.', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleRun() {
    if (!user || !projectId || !name.trim()) return;
    setBusy(true);
    setRunOut(null);
    try {
      const idToken = await user.getIdToken();
      // Save first so run uses latest code
      await saveBackendFunction({
        idToken,
        projectId,
        name: name.trim(),
        body: {
          name: name.trim(),
          trigger,
          code,
          enabled,
          description,
          event: trigger === 'event' ? { entity: eventEntity, action: eventAction } : null,
          cron: trigger === 'cron' ? { intervalMinutes } : null,
        },
      });
      const out = await runBackendFunction({
        idToken,
        projectId,
        name: name.trim(),
        payload: { source: 'editor' },
      });
      setRunOut(out);
      setToast({ message: `OK · ${out.durationMs}ms`, type: 'success' });
      const lg = await listBackendFunctionLogs({ idToken, projectId, name: name.trim() });
      setLogs(lg);
      await refresh(projectId);
    } catch (err) {
      setRunOut({ error: err.message, logs: err.logs });
      setToast({ message: err?.message || 'Erro na execução.', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!user || !projectId || !name.trim()) return;
    if (!window.confirm(`Apagar função ${name}?`)) return;
    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      await deleteBackendFunction({ idToken, projectId, name: name.trim() });
      startNew();
      await refresh(projectId);
      setToast({ message: 'Função apagada.', type: 'success' });
    } catch (err) {
      setToast({ message: err?.message || 'Falha ao apagar.', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleCronTick() {
    if (!user || !projectId) return;
    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      const data = await tickCronFunctions({ idToken, projectId });
      setToast({
        message: `Cron: ${data.ran || 0} função(ões) processada(s).`,
        type: 'success',
      });
      await refresh(projectId);
    } catch (err) {
      setToast({ message: err?.message || 'Falha no cron.', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function copyInvoke() {
    if (!projectId || !name.trim()) return;
    const url = httpInvokeUrl(projectId, name.trim());
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setToast({ message: 'Não foi possível copiar.', type: 'error' });
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center">
            <Code2 size={18} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Funções Backend</h1>
            <p className="text-sm text-zinc-500">
              HTTP, eventos de entidade e cron — requer Backend ativo no projeto
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={projectId || ''}
            onChange={(e) => setProjectId(e.target.value || null)}
            className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-200 outline-none focus:border-blue-600 max-w-[220px]"
          >
            {!projects.length && <option value="">Sem projetos</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={startNew}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white"
          >
            <Plus size={14} /> Nova
          </button>
        </div>
      </div>

      {selectedProject && !selectedProject.backendEnabled && (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200/90">
          Backend desativado neste projeto.{' '}
          <Link
            to={`/editor/${projectId}`}
            className="font-semibold text-amber-100 underline underline-offset-2"
          >
            Abre o editor → Settings → ativar Funções de Backend
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 min-h-[28rem]">
        <aside className="rounded-xl border border-zinc-800 bg-zinc-950/50 overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-zinc-500">Funções</span>
            <button
              type="button"
              disabled={busy || !projectId}
              onClick={() => void handleCronTick()}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
              title="Correr crons em atraso"
            >
              Tick cron
            </button>
          </div>
          {loading ? (
            <div className="p-6 flex justify-center text-zinc-500">
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : !functions.length ? (
            <p className="p-4 text-xs text-zinc-500">Ainda sem funções.</p>
          ) : (
            <ul className="max-h-[28rem] overflow-y-auto custom-scrollbar">
              {functions.map((fn) => (
                <li key={fn.id}>
                  <button
                    type="button"
                    onClick={() => void openFn(fn)}
                    className={`w-full text-left px-3 py-2.5 border-b border-zinc-800/60 hover:bg-zinc-900/60 ${
                      selected?.name === fn.name ? 'bg-zinc-900/80' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-200 font-mono truncate">{fn.name}</span>
                      {fn.enabled === false && (
                        <Power size={10} className="text-zinc-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {fn.trigger}
                      {fn.lastStatus ? ` · ${fn.lastStatus}` : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">Nome</label>
              <input
                value={name}
                onChange={(e) =>
                  setName(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, '_')
                      .slice(0, 48)
                  )
                }
                disabled={Boolean(selected)}
                placeholder="hello_world"
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-200 outline-none focus:border-blue-600 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">Trigger</label>
              <div className="flex gap-1">
                {TRIGGERS.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTrigger(t.id)}
                      className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg border text-[11px] font-medium transition-colors ${
                        trigger === t.id
                          ? 'bg-blue-600/15 border-blue-500/40 text-blue-400'
                          : 'border-zinc-800 text-zinc-500 hover:border-zinc-700'
                      }`}
                    >
                      <Icon size={12} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {trigger === 'event' && (
            <div className="grid grid-cols-2 gap-2">
              <input
                value={eventEntity}
                onChange={(e) => setEventEntity(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="entidade (ex: orders)"
                className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-200 outline-none focus:border-blue-600"
              />
              <select
                value={eventAction}
                onChange={(e) => setEventAction(e.target.value)}
                className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-200 outline-none focus:border-blue-600"
              >
                <option value="create">create</option>
                <option value="update">update</option>
                <option value="delete">delete</option>
                <option value="write">write (qualquer)</option>
              </select>
            </div>
          )}

          {trigger === 'cron' && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="text-[11px] text-zinc-500">A cada</span>
              <input
                type="number"
                min={5}
                max={1440}
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Number(e.target.value) || 60)}
                className="w-20 px-2 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-sm font-mono outline-none focus:border-blue-600"
              />
              <span className="text-[11px] text-zinc-500">minutos</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">Descrição</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional"
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-200 outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">
              Código — <span className="font-mono">async function handler(ctx)</span>
            </label>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              rows={14}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-[12px] font-mono text-zinc-200 outline-none focus:border-blue-600 custom-scrollbar leading-relaxed"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-xs text-zinc-400 mr-auto">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="rounded border-zinc-700"
              />
              Ativa
            </label>
            <button
              type="button"
              disabled={busy || !projectId}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-xs font-medium text-zinc-200 hover:border-zinc-500 disabled:opacity-40"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Guardar
            </button>
            <button
              type="button"
              disabled={busy || !projectId || !name.trim()}
              onClick={() => void handleRun()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white disabled:opacity-40"
            >
              <Play size={12} /> Executar
            </button>
            {trigger === 'http' && name.trim() && projectId && (
              <button
                type="button"
                onClick={() => void copyInvoke()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:border-zinc-500"
              >
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                URL webhook
              </button>
            )}
            {selected && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDelete()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-900/50 text-xs text-red-300 hover:border-red-500/50 disabled:opacity-40"
              >
                <Trash2 size={12} /> Apagar
              </button>
            )}
          </div>

          {trigger === 'http' && name.trim() && projectId && (
            <p className="text-[10px] text-zinc-600 font-mono break-all">
              POST {httpInvokeUrl(projectId, name.trim())}
            </p>
          )}

          {runOut && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
              <p className="text-[11px] font-semibold text-zinc-400 mb-1">Resultado</p>
              <pre className="text-[11px] font-mono text-zinc-300 whitespace-pre-wrap break-all max-h-40 overflow-y-auto custom-scrollbar">
                {JSON.stringify(runOut, null, 2)}
              </pre>
            </div>
          )}

          {logs.length > 0 && (
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <div className="px-3 py-1.5 border-b border-zinc-800 flex items-center gap-1.5 text-[11px] text-zinc-500">
                <ScrollText size={12} /> Logs recentes
              </div>
              <ul className="max-h-40 overflow-y-auto custom-scrollbar text-[11px] font-mono">
                {logs.map((l) => (
                  <li
                    key={l.id}
                    className="px-3 py-1.5 border-b border-zinc-800/50 flex gap-2 text-zinc-400"
                  >
                    <span
                      className={
                        l.status === 'ok' ? 'text-emerald-400' : 'text-red-400'
                      }
                    >
                      {l.status}
                    </span>
                    <span className="text-zinc-600">{l.durationMs}ms</span>
                    <span className="truncate text-zinc-500">
                      {l.error || l.resultPreview || (l.logs || []).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
