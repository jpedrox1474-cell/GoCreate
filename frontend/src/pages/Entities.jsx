import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Database,
  Table2,
  Loader2,
  Sparkles,
  Plus,
  ChevronRight,
  ArrowLeft,
  ScanSearch,
} from 'lucide-react';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { listUserProjects, getPublishedProject } from '../lib/projects';
import {
  listEntities,
  listEntityRows,
  seedTemplateEntities,
  detectEntitiesFromFiles,
  seedDetectedEntities,
  getRememberedProjectId,
  rememberLastProjectId,
} from '../lib/entities';

const TYPE_COLORS = {
  string: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  number: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  boolean: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

function TypeBadge({ type }) {
  const t = TYPE_COLORS[type] ? type : 'string';
  return (
    <span
      className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide ${TYPE_COLORS[t]}`}
    >
      {t}
    </span>
  );
}

function cellValue(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function Entities() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [entities, setEntities] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

  const selected = useMemo(
    () => entities.find((e) => e.id === selectedId) || null,
    [entities, selectedId]
  );

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
      console.error('[Entities] projects:', err);
      setToast({ message: 'Não foi possível carregar projetos.', type: 'error' });
    }
  }, [user?.uid, searchParams]);

  const refreshEntities = useCallback(async (pid) => {
    if (!pid) {
      setEntities([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await listEntities(pid);
      setEntities(list);
      setSelectedId((prev) => (prev && list.some((e) => e.id === prev) ? prev : null));
    } catch (err) {
      console.error('[Entities] list:', err);
      setToast({ message: 'Falha ao carregar entidades.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    refreshEntities(projectId);
  }, [projectId, refreshEntities]);

  useEffect(() => {
    if (!projectId || !selectedId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setRowsLoading(true);
      try {
        const list = await listEntityRows(projectId, selectedId);
        if (!cancelled) setRows(list);
      } catch (err) {
        console.error('[Entities] rows:', err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setRowsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedId]);

  function handleProjectChange(id) {
    setProjectId(id);
    setSelectedId(null);
    rememberLastProjectId(id);
    setSearchParams(id ? { projectId: id } : {});
  }

  async function handleSeedTemplates() {
    if (!projectId || busy) return;
    setBusy('templates');
    try {
      await seedTemplateEntities(projectId);
      await refreshEntities(projectId);
      setToast({ message: 'Entidades de demonstração criadas.', type: 'success' });
    } catch (err) {
      setToast({ message: err?.message || 'Falha ao criar templates.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function handleDetect() {
    if (!projectId || busy) return;
    setBusy('detect');
    try {
      const pub =
        (await getPublishedProject(projectId, 'production')) ||
        (await getPublishedProject(projectId, 'preview'));
      const files = pub?.files || {};
      const detected = detectEntitiesFromFiles(files);
      if (!detected.length) {
        setToast({
          message:
            'Nenhum esquema detectado no código publicado. Publica um preview ou adiciona templates.',
          type: 'info',
        });
        return;
      }
      await seedDetectedEntities(projectId, detected);
      await refreshEntities(projectId);
      setToast({
        message: `${detected.length} entidade(s) detectada(s) no código.`,
        type: 'success',
      });
    } catch (err) {
      setToast({ message: err?.message || 'Falha na detecção.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  const columns = selected?.columns || [];

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-400/90 mb-2 flex items-center gap-1.5">
            <Database size={12} /> Banco de Dados
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 tracking-tight mb-1">
            Entidades
          </h1>
          <p className="text-sm text-zinc-500 max-w-xl">
            Tabelas e dados do projeto — schema da IA, detecção no código ou templates de demo.
          </p>
        </div>
        <div className="shrink-0">
          <label className="block text-[10px] uppercase tracking-wider text-zinc-600 mb-1">
            Projeto
          </label>
          <select
            value={projectId || ''}
            onChange={(e) => handleProjectChange(e.target.value || null)}
            className="bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 min-w-[200px] focus:outline-none focus:border-blue-500/50"
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

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm py-16 justify-center">
          <Loader2 size={18} className="animate-spin" /> A carregar…
        </div>
      ) : !projectId ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-6 py-12 text-center">
          <p className="text-sm text-zinc-400">Cria um projeto primeiro para gerir entidades.</p>
        </div>
      ) : selected ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft size={14} /> Voltar às entidades
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-blue-600/15 border border-blue-500/20 flex items-center justify-center">
              <Table2 size={16} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">{selected.name || selected.id}</h2>
              <p className="text-[11px] text-zinc-500 font-mono">{selected.id}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/80">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60">
                  {columns.map((col) => (
                    <th
                      key={col.name}
                      className="px-4 py-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider whitespace-nowrap"
                    >
                      <span className="inline-flex items-center gap-2">
                        {col.name}
                        <TypeBadge type={col.type} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsLoading ? (
                  <tr>
                    <td colSpan={Math.max(columns.length, 1)} className="px-4 py-8 text-center text-zinc-500">
                      <Loader2 size={16} className="inline animate-spin mr-2" />
                      A carregar linhas…
                    </td>
                  </tr>
                ) : !rows.length ? (
                  <tr>
                    <td
                      colSpan={Math.max(columns.length, 1)}
                      className="px-4 py-8 text-center text-zinc-500 text-xs"
                    >
                      Sem linhas. A IA pode emitir dados mock na próxima geração, ou usa templates.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr
                      key={row.id || idx}
                      className="border-b border-zinc-800/80 hover:bg-zinc-900/40 transition-colors"
                    >
                      {columns.map((col) => (
                        <td
                          key={col.name}
                          className="px-4 py-2.5 text-zinc-300 font-mono text-xs whitespace-nowrap max-w-[240px] truncate"
                          title={cellValue(row[col.name])}
                        >
                          {cellValue(row[col.name])}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : !entities.length ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 px-6 py-14 text-center space-y-5">
          <div className="mx-auto w-12 h-12 rounded-xl bg-zinc-800/80 flex items-center justify-center">
            <Database size={22} className="text-zinc-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-1">Nenhuma entidade ainda</h2>
            <p className="text-sm text-zinc-500 max-w-md mx-auto">
              Gera um app com modelos de dados no chat (a IA grava o esquema), detecta a partir do
              código publicado, ou adiciona templates de demonstração.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              disabled={!!busy}
              onClick={handleDetect}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-zinc-700 text-zinc-200 hover:bg-zinc-800/80 transition-all disabled:opacity-50"
            >
              {busy === 'detect' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ScanSearch size={14} />
              )}
              Gerar esquema
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={handleSeedTemplates}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-all disabled:opacity-50"
            >
              {busy === 'templates' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              Adicionar templates
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              disabled={!!busy}
              onClick={handleDetect}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-all disabled:opacity-50"
            >
              <ScanSearch size={12} /> Detectar no código
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={handleSeedTemplates}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-all disabled:opacity-50"
            >
              <Sparkles size={12} /> Templates
            </button>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {entities.map((ent) => (
              <li key={ent.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(ent.id)}
                  className="w-full text-left flex items-center gap-3 px-4 py-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:border-blue-500/30 hover:bg-zinc-900/70 transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 group-hover:bg-blue-600/15 transition-colors">
                    <Table2 size={16} className="text-zinc-400 group-hover:text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-100 truncate">
                      {ent.name || ent.id}
                    </p>
                    <p className="text-[11px] text-zinc-500 truncate">
                      {(ent.columns || []).length} colunas
                      {ent.source ? ` · ${ent.source}` : ''}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-400" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
