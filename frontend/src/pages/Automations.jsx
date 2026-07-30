import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bot,
  Bug,
  Shield,
  FileText,
  FlaskConical,
  Plus,
  Loader2,
  History,
  ChevronRight,
  Power,
  Sparkles,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import Toast from '../components/Toast';
import ModalShell from '../components/editor/ModalShell';
import { useAuth } from '../context/AuthContext';
import { listUserProjects } from '../lib/projects';
import {
  AUTOMATION_TEMPLATES,
  listAutomations,
  addAutomation,
  toggleAutomation,
  listRuns,
  metricsFromRuns,
  formatRunTime,
  getRememberedProjectId,
  rememberLastProjectId,
} from '../lib/automations';

const TEMPLATE_ICONS = {
  bug_hunter: Bug,
  security_scan: Shield,
  doc_generator: FileText,
  test_coverage: FlaskConical,
};

const TYPE_LABELS = {
  bug_hunter: 'Bug Hunter',
  security_scan: 'Security Scan',
  doc_generator: 'Doc Generator',
  test_coverage: 'Test Coverage',
};

export default function Automations() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [automations, setAutomations] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const loadProjects = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const list = await listUserProjects(user.uid);
      setProjects(list);
      const fromQuery = searchParams.get('projectId');
      const remembered = getRememberedProjectId();
      const pick =
        (fromQuery && list.find((p) => p.id === fromQuery)?.id) ||
        (remembered && list.find((p) => p.id === remembered)?.id) ||
        list[0]?.id ||
        null;
      setProjectId(pick);
      if (pick) rememberLastProjectId(pick);
    } catch (err) {
      console.error('[Automations] projects:', err);
      setToast({ message: 'Não foi possível carregar projetos.', type: 'error' });
    }
  }, [user?.uid, searchParams]);

  const refresh = useCallback(async (pid) => {
    if (!pid) {
      setAutomations([]);
      setRuns([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [autos, runList] = await Promise.all([listAutomations(pid), listRuns(pid, { max: 50 })]);
      setAutomations(autos);
      setRuns(runList);
    } catch (err) {
      console.error('[Automations] refresh:', err);
      setToast({ message: err.message || 'Erro ao carregar automações.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (projectId) refresh(projectId);
  }, [projectId, refresh]);

  const metrics = useMemo(() => {
    const { successful7d, failed7d } = metricsFromRuns(runs);
    return {
      total: automations.length,
      successful7d,
      failed7d,
    };
  }, [automations, runs]);

  const activeCount = useMemo(
    () => automations.filter((a) => a.status === 'active').length,
    [automations]
  );

  const existingTypes = useMemo(() => new Set(automations.map((a) => a.type)), [automations]);

  function handleSelectProject(id) {
    setProjectId(id || null);
    if (id) {
      rememberLastProjectId(id);
      setSearchParams({ projectId: id }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }

  async function handleAddTemplate(template) {
    if (!projectId) {
      setToast({ message: 'Seleciona um projeto primeiro.', type: 'error' });
      return;
    }
    if (existingTypes.has(template.type)) {
      setToast({ message: 'Esta automação já existe neste projeto.', type: 'info' });
      return;
    }
    setBusy(template.type);
    try {
      await addAutomation(projectId, {
        type: template.type,
        title: template.title,
        description: template.description,
        status: 'active',
      });
      setToast({ message: `${template.title} adicionada.`, type: 'success' });
      await refresh(projectId);
    } catch (err) {
      console.error('[Automations] add:', err);
      setToast({ message: err.message || 'Falha ao adicionar.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function handleToggle(auto) {
    if (!projectId) return;
    const next = auto.status === 'active' ? 'inactive' : 'active';
    setBusy(auto.id);
    try {
      await toggleAutomation(projectId, auto.id, next);
      setAutomations((prev) =>
        prev.map((a) => (a.id === auto.id ? { ...a, status: next } : a))
      );
    } catch (err) {
      setToast({ message: err.message || 'Falha ao atualizar.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  const showEmpty = !loading && activeCount === 0 && automations.length === 0;

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-6xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-400/90 mb-2 flex items-center gap-1.5">
            <Bot size={12} /> Background agents
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 tracking-tight mb-1">
            Automations
          </h1>
          <p className="text-sm text-zinc-500 max-w-xl">
            Background AI agents that monitor, test, and hunt bugs while you build — like an
            autonomous co-pilot for every project.
          </p>
        </div>

        <div className="shrink-0">
          <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Projeto</label>
          <select
            value={projectId || ''}
            onChange={(e) => handleSelectProject(e.target.value || null)}
            className="w-full sm:w-64 bg-zinc-900 border border-zinc-800/80 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/40"
          >
            {!projects.length && <option value="">Sem projetos</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <MetricCard label="Total Automations" value={metrics.total} />
        <MetricCard label="Successful · 7d" value={metrics.successful7d} accent="emerald" />
        <MetricCard label="Failed · 7d" value={metrics.failed7d} accent="rose" />
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-black px-4 py-4 text-left hover:border-zinc-700 hover:bg-zinc-950 transition-all group"
        >
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1">
              Activity
            </p>
            <p className="text-sm font-semibold text-zinc-100 group-hover:text-blue-400 transition-colors flex items-center gap-1">
              Run History
              <ChevronRight size={14} className="opacity-60 group-hover:translate-x-0.5 transition-transform" />
            </p>
          </div>
          <History size={18} className="text-zinc-600 group-hover:text-blue-400 transition-colors" />
        </button>
      </div>

      {!projectId && !loading && (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-6 py-10 text-center mb-8">
          <Bot size={28} className="mx-auto text-zinc-600 mb-3" />
          <p className="text-sm text-zinc-400 mb-4">Cria um projeto para ativar automações.</p>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all"
          >
            Ir ao Dashboard
          </Link>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-zinc-500 text-sm">
          <Loader2 size={16} className="animate-spin" /> A carregar…
        </div>
      )}

      {!loading && projectId && (
        <>
          {/* Existing automations or empty */}
          {showEmpty ? (
            <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 px-6 py-14 text-center mb-10">
              <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
                <Sparkles size={22} className="text-indigo-400" />
              </div>
              <h2 className="text-lg font-semibold text-zinc-100 mb-1">No Automations Yet</h2>
              <p className="text-sm text-zinc-500 mb-5 max-w-md mx-auto">
                Add a popular template below to start background monitoring for this project.
              </p>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('automation-templates');
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-md shadow-blue-900/20 transition-all"
              >
                <Plus size={16} />
                New Automation
              </button>
            </div>
          ) : (
            <section className="mb-10">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-zinc-200">Active on this project</h2>
                <span className="text-[11px] text-zinc-500 tabular-nums">
                  {activeCount} active · {automations.length} total
                </span>
              </div>
              <ul className="space-y-2">
                {automations.map((auto) => {
                  const Icon = TEMPLATE_ICONS[auto.type] || Bot;
                  const on = auto.status === 'active';
                  return (
                    <li
                      key={auto.id}
                      className="flex items-start gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900 px-4 py-3.5"
                    >
                      <span className="mt-0.5 w-9 h-9 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-blue-400 shrink-0">
                        <Icon size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-zinc-100">{auto.title}</p>
                          <span
                            className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                              on
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                                : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                            }`}
                          >
                            {on ? 'active' : 'inactive'}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                          {auto.description}
                        </p>
                        {auto.lastRun && (
                          <p className="text-[11px] text-zinc-600 mt-1.5">
                            Last run · {formatRunTime(auto.lastRun)}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={busy === auto.id}
                        onClick={() => handleToggle(auto)}
                        className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          on
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15'
                            : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                        }`}
                        title={on ? 'Desativar' : 'Ativar'}
                      >
                        {busy === auto.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Power size={12} />
                        )}
                        {on ? 'On' : 'Off'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Templates */}
          <section id="automation-templates">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-zinc-200">Popular Templates</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                One-click agents. Add to the selected project — they run after code generation.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {AUTOMATION_TEMPLATES.map((tpl) => {
                const Icon = TEMPLATE_ICONS[tpl.type] || Bot;
                const added = existingTypes.has(tpl.type);
                return (
                  <div
                    key={tpl.type}
                    className="flex flex-col rounded-xl border border-zinc-800/80 bg-zinc-900 p-4 hover:border-zinc-700/90 transition-all"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <span className="w-9 h-9 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-indigo-400 shrink-0">
                        <Icon size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-100">{tpl.title}</p>
                        <p className="text-[11px] text-zinc-600 mt-0.5">
                          {TYPE_LABELS[tpl.type] || tpl.type}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed flex-1 mb-4">
                      {tpl.description}
                    </p>
                    <button
                      type="button"
                      disabled={added || busy === tpl.type || !projectId}
                      onClick={() => handleAddTemplate(tpl)}
                      className={`inline-flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                        added
                          ? 'bg-zinc-800/80 text-zinc-500 cursor-default'
                          : 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-900/20'
                      }`}
                    >
                      {busy === tpl.type ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : added ? (
                        <>
                          <CheckCircle2 size={13} /> Added
                        </>
                      ) : (
                        <>
                          <Plus size={13} /> Add
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      <ModalShell
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Run History"
        wide
      >
        {!runs.length ? (
          <p className="text-sm text-zinc-500 text-center py-6">Ainda sem execuções.</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto custom-scrollbar space-y-2 -mx-1 px-1">
            {runs.map((run) => (
              <li
                key={run.id}
                className="flex items-center gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/80 px-3 py-2.5"
              >
                {run.status === 'failed' ? (
                  <XCircle size={16} className="text-rose-400 shrink-0" />
                ) : (
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-zinc-200 truncate">
                    {TYPE_LABELS[run.type] || run.type}
                  </p>
                  <p className="text-[11px] text-zinc-600">{formatRunTime(run.createdAt)}</p>
                </div>
                <span
                  className={`text-[10px] font-medium uppercase tracking-wide ${
                    run.status === 'failed' ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {run.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ModalShell>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}

function MetricCard({ label, value, accent }) {
  const valueClass =
    accent === 'emerald'
      ? 'text-emerald-400'
      : accent === 'rose'
        ? 'text-rose-400'
        : 'text-zinc-100';
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-black px-4 py-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums tracking-tight ${valueClass}`}>{value}</p>
    </div>
  );
}
