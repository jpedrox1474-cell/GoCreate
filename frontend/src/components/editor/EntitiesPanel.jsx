import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Database,
  Table2,
  Loader2,
  Sparkles,
  Plus,
  ChevronRight,
  ScanSearch,
  KeyRound,
} from 'lucide-react';
import {
  listEntities,
  listEntityRows,
  seedTemplateEntities,
  detectEntitiesFromFiles,
  seedDetectedEntities,
} from '../../lib/entities';
import EntityBrowser from './EntityBrowser';
import DataApiPanel from './DataApiPanel';

/**
 * Compact entities browser scoped to a single project (editor workspace).
 */
export default function EntitiesPanel({ projectId, files = {}, backendEnabled = false }) {
  const [entities, setEntities] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [rowsLoading, setRowsLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [view, setView] = useState('entities'); // entities | api

  const selected = useMemo(
    () => entities.find((e) => e.id === selectedId) || null,
    [entities, selectedId]
  );

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
      console.error('[EntitiesPanel] list:', err);
      setNotice({ message: 'Falha ao carregar entidades.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshRows = useCallback(async () => {
    if (!projectId || !selectedId) {
      setRows([]);
      return;
    }
    setRowsLoading(true);
    try {
      const list = await listEntityRows(projectId, selectedId);
      setRows(list);
    } catch (err) {
      console.error('[EntitiesPanel] rows:', err);
      setRows([]);
    } finally {
      setRowsLoading(false);
    }
  }, [projectId, selectedId]);

  useEffect(() => {
    refreshEntities(projectId);
  }, [projectId, refreshEntities]);

  useEffect(() => {
    refreshRows();
  }, [refreshRows]);

  async function handleSeedTemplates() {
    if (!projectId || busy) return;
    setBusy('templates');
    setNotice(null);
    try {
      await seedTemplateEntities(projectId);
      await refreshEntities(projectId);
      setNotice({ message: 'Templates criados.', type: 'ok' });
    } catch (err) {
      setNotice({ message: err?.message || 'Falha ao criar templates.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function handleDetect() {
    if (!projectId || busy) return;
    setBusy('detect');
    setNotice(null);
    try {
      const detected = detectEntitiesFromFiles(files);
      if (!detected.length) {
        setNotice({
          message: 'Nenhum esquema detectado no código gerado.',
          type: 'info',
        });
        return;
      }
      await seedDetectedEntities(projectId, detected);
      await refreshEntities(projectId);
      setNotice({
        message: `${detected.length} entidade(s) detectada(s).`,
        type: 'ok',
      });
    } catch (err) {
      setNotice({ message: err?.message || 'Falha na detecção.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function handleBrowserRefresh() {
    await refreshEntities(projectId);
    await refreshRows();
  }

  if (!projectId) {
    return (
      <div className="w-full h-full flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="mx-auto w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3">
            <Database size={18} className="text-zinc-500" />
          </div>
          <p className="text-sm text-zinc-300 font-medium mb-1">Guarda o projeto primeiro</p>
          <p className="text-xs text-zinc-500">
            As entidades ficam ligadas a um projeto guardado no Firestore.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto custom-scrollbar px-1 sm:px-2 py-1">
      {notice && (
        <div
          className={`mb-2 px-2.5 py-1.5 rounded-md text-[11px] border ${
            notice.type === 'error'
              ? 'border-red-500/30 bg-red-950/40 text-red-200'
              : notice.type === 'ok'
                ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-200'
                : 'border-zinc-700 bg-zinc-900/80 text-zinc-300'
          }`}
        >
          {notice.message}
        </div>
      )}

      {!selectedId && (
        <div className="mb-2 flex p-0.5 bg-zinc-900 rounded-lg border border-zinc-800 w-fit">
          <button
            type="button"
            onClick={() => setView('entities')}
            className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${
              view === 'entities' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Entidades
          </button>
          <button
            type="button"
            onClick={() => setView('api')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${
              view === 'api' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <KeyRound size={11} /> Data API
          </button>
        </div>
      )}

      {view === 'api' && !selectedId ? (
        <DataApiPanel
          projectId={projectId}
          backendEnabled={backendEnabled}
          entities={entities}
          onPermissionsSaved={() => refreshEntities(projectId)}
        />
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 text-zinc-500 text-xs py-16">
          <Loader2 size={14} className="animate-spin" /> A carregar…
        </div>
      ) : selected ? (
        <EntityBrowser
          compact
          projectId={projectId}
          entity={selected}
          rows={rows}
          rowsLoading={rowsLoading}
          onRefresh={handleBrowserRefresh}
          onBack={() => setSelectedId(null)}
          onToast={(t) =>
            setNotice({
              message: t.message,
              type: t.type === 'success' ? 'ok' : t.type === 'error' ? 'error' : 'info',
            })
          }
        />
      ) : !entities.length ? (
        <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-10 text-center space-y-4">
          <div className="mx-auto w-9 h-9 rounded-lg bg-zinc-800/80 flex items-center justify-center">
            <Database size={16} className="text-zinc-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-200 mb-0.5">Nenhuma entidade</p>
            <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
              Detecta no código gerado ou adiciona templates de demonstração.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              disabled={!!busy}
              onClick={handleDetect}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-700 text-zinc-200 hover:bg-zinc-800/80 transition-all disabled:opacity-50"
            >
              {busy === 'detect' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <ScanSearch size={12} />
              )}
              Detectar
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={handleSeedTemplates}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-all disabled:opacity-50"
            >
              {busy === 'templates' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Plus size={12} />
              )}
              Templates
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5 justify-end">
            <button
              type="button"
              disabled={!!busy}
              onClick={handleDetect}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-all disabled:opacity-50"
            >
              <ScanSearch size={11} /> Detectar
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={handleSeedTemplates}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-all disabled:opacity-50"
            >
              <Sparkles size={11} /> Templates
            </button>
          </div>
          <ul className="space-y-1">
            {entities.map((ent) => (
              <li key={ent.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(ent.id)}
                  className="w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-zinc-800/80 bg-zinc-900/40 hover:border-blue-500/30 hover:bg-zinc-900/70 transition-all group"
                >
                  <div className="w-7 h-7 rounded-md bg-zinc-800 flex items-center justify-center shrink-0 group-hover:bg-blue-600/15">
                    <Table2 size={13} className="text-zinc-400 group-hover:text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-zinc-100 truncate">
                      {ent.name || ent.id}
                    </p>
                    <p className="text-[10px] text-zinc-500 truncate">
                      {(ent.columns || []).length} colunas
                      {ent.source ? ` · ${ent.source}` : ''}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-zinc-600 group-hover:text-zinc-400" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
