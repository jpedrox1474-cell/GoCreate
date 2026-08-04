import React, { useMemo, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  Download,
  Upload,
  GripVertical,
  Pencil,
  Check,
  X,
  AlertTriangle,
  Copy,
  CheckSquare,
  Loader2,
} from 'lucide-react';
import {
  FIELD_TYPES,
  TYPE_COLORS,
  normalizeColumns,
  getSchemaMigrationWarnings,
  coerceCellValue,
  rowsToCsv,
  rowsToJson,
  parseCsv,
  parseJsonImport,
  downloadTextFile,
  updateEntitySchema,
  createEntityRow,
  updateEntityRow,
  deleteEntityRows,
  duplicateEntity,
  deleteEntity,
  importEntityRows,
} from '../../lib/entities';

export function TypeBadge({ type }) {
  const t = TYPE_COLORS[type] ? type : 'string';
  return (
    <span
      className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide ${TYPE_COLORS[t]}`}
    >
      {t}
    </span>
  );
}

function cellDisplay(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * Schema builder + data browser for one entity.
 * compact=true for editor panel.
 */
export default function EntityBrowser({
  projectId,
  entity,
  rows,
  rowsLoading,
  onRefresh,
  onBack,
  onToast,
  compact = false,
}) {
  const [editingSchema, setEditingSchema] = useState(false);
  const [draftName, setDraftName] = useState(entity?.name || '');
  const [draftCols, setDraftCols] = useState(() => normalizeColumns(entity?.columns || []));
  const [savingSchema, setSavingSchema] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [editingCell, setEditingCell] = useState(null); // { rowId, col }
  const [cellDraft, setCellDraft] = useState('');
  const [busy, setBusy] = useState(null);
  const [filter, setFilter] = useState('');
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);
  const fileRef = useRef(null);
  const PAGE_SIZE = compact ? 25 : 50;

  const columns = useMemo(
    () => normalizeColumns(entity?.columns || []),
    [entity?.columns]
  );

  const warnings = useMemo(
    () => (editingSchema ? getSchemaMigrationWarnings(columns, draftCols) : []),
    [editingSchema, columns, draftCols]
  );

  const filteredRows = useMemo(() => {
    let list = [...(rows || [])];
    const q = filter.trim().toLowerCase();
    if (q) {
      list = list.filter((row) =>
        columns.some((c) => cellDisplay(row[c.name]).toLowerCase().includes(q))
      );
    }
    if (sortCol) {
      list.sort((a, b) => {
        const av = a[sortCol];
        const bv = b[sortCol];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av;
        }
        const as = String(av);
        const bs = String(bv);
        return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
      });
    }
    return list;
  }, [rows, filter, sortCol, sortDir, columns]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function startSchemaEdit() {
    setDraftName(entity?.name || entity?.id || '');
    setDraftCols(normalizeColumns(entity?.columns || []).map((c) => ({ ...c })));
    setEditingSchema(true);
  }

  function moveCol(index, dir) {
    setDraftCols((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next.map((c, i) => ({ ...c, order: i }));
    });
  }

  async function saveSchema() {
    if (!projectId || !entity?.id || savingSchema) return;
    const cleaned = normalizeColumns(
      draftCols.filter((c) => String(c.name || '').trim())
    );
    if (!cleaned.length) {
      onToast?.({ message: 'Adiciona pelo menos um campo.', type: 'error' });
      return;
    }
    const danger = warnings.filter((w) => w.level === 'danger');
    if (danger.length) {
      if (
        !window.confirm(
          `${danger.map((d) => d.message).join('\n')}\n\nContinuar mesmo assim?`
        )
      ) {
        return;
      }
    }
    setSavingSchema(true);
    try {
      await updateEntitySchema(projectId, entity.id, {
        name: draftName,
        columns: cleaned,
      });
      setEditingSchema(false);
      await onRefresh?.();
      onToast?.({ message: 'Schema atualizado.', type: 'success' });
    } catch (err) {
      onToast?.({ message: err?.message || 'Falha ao guardar schema.', type: 'error' });
    } finally {
      setSavingSchema(false);
    }
  }

  async function handleAddRow() {
    if (!projectId || !entity?.id) return;
    setBusy('add');
    try {
      const data = {};
      for (const c of columns) {
        data[c.name] = coerceCellValue('', c.type);
      }
      await createEntityRow(projectId, entity.id, data);
      await onRefresh?.();
      onToast?.({ message: 'Linha criada.', type: 'success' });
    } catch (err) {
      onToast?.({ message: err?.message || 'Falha ao criar linha.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function commitCell(rowId, colName, type) {
    if (!projectId || !entity?.id) return;
    const value = coerceCellValue(cellDraft, type);
    setBusy('cell');
    try {
      await updateEntityRow(projectId, entity.id, rowId, { [colName]: value });
      setEditingCell(null);
      await onRefresh?.();
    } catch (err) {
      onToast?.({ message: err?.message || 'Falha ao editar.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Eliminar ${ids.length} linha(s)?`)) return;
    setBusy('bulk');
    try {
      await deleteEntityRows(projectId, entity.id, ids);
      setSelectedIds(new Set());
      await onRefresh?.();
      onToast?.({ message: `${ids.length} linha(s) eliminada(s).`, type: 'success' });
    } catch (err) {
      onToast?.({ message: err?.message || 'Falha ao eliminar.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function handleDuplicate() {
    setBusy('dup');
    try {
      await duplicateEntity(projectId, entity.id);
      await onRefresh?.();
      onToast?.({ message: 'Entidade duplicada.', type: 'success' });
      onBack?.();
    } catch (err) {
      onToast?.({ message: err?.message || 'Falha ao duplicar.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteEntity() {
    if (!window.confirm(`Eliminar entidade “${entity.name || entity.id}” e todas as linhas?`)) {
      return;
    }
    setBusy('delEnt');
    try {
      await deleteEntity(projectId, entity.id);
      onToast?.({ message: 'Entidade eliminada.', type: 'success' });
      onBack?.();
      await onRefresh?.();
    } catch (err) {
      onToast?.({ message: err?.message || 'Falha ao eliminar entidade.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  function exportCsv() {
    const csv = rowsToCsv(columns, rows);
    downloadTextFile(`${entity.id}.csv`, csv, 'text/csv');
  }

  function exportJson() {
    const json = rowsToJson(columns, rows);
    downloadTextFile(`${entity.id}.json`, json, 'application/json');
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    setBusy('import');
    try {
      let parsed;
      if (/\.json$/i.test(file.name) || text.trim().startsWith('{') || text.trim().startsWith('[')) {
        parsed = parseJsonImport(text);
      } else {
        parsed = parseCsv(text);
      }
      if (!parsed.rows.length) {
        onToast?.({ message: 'Ficheiro sem linhas.', type: 'info' });
        return;
      }
      const replace = window.confirm(
        `${parsed.rows.length} linha(s) encontradas.\nOK = substituir todas\nCancelar = acrescentar`
      );
      // If user cancels confirm for replace, still import as append — use a clearer flow:
      // Actually confirm: OK = replace, Cancel = append is confusing. Use two-step:
      // We'll interpret: confirm true = replace, false = append
      await importEntityRows(projectId, entity.id, parsed.rows, { replace });
      if (parsed.columns?.length && (!columns.length || replace)) {
        const merged = normalizeColumns([
          ...columns,
          ...parsed.columns.filter((c) => !columns.some((x) => x.name === c.name)),
        ]);
        if (merged.length !== columns.length) {
          await updateEntitySchema(projectId, entity.id, { columns: merged });
        }
      }
      await onRefresh?.();
      onToast?.({
        message: `${parsed.rows.length} linha(s) importada(s)${replace ? ' (substituídas)' : ''}.`,
        type: 'success',
      });
    } catch (err) {
      onToast?.({ message: err?.message || 'Falha na importação.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  function toggleSort(colName) {
    if (sortCol === colName) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(colName);
      setSortDir('asc');
    }
    setPage(0);
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pad = compact ? 'px-2 py-1.5' : 'px-4 py-2.5';

  return (
    <div className={`space-y-3 ${compact ? 'h-full flex flex-col min-h-0' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-[11px] text-zinc-500 hover:text-zinc-200 mb-1 transition-colors"
            >
              ← Voltar
            </button>
          )}
          <h2 className={`font-semibold text-zinc-100 truncate ${compact ? 'text-sm' : 'text-lg'}`}>
            {entity.name || entity.id}
          </h2>
          <p className="text-[11px] text-zinc-500 font-mono">{entity.id}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!editingSchema && (
            <>
              <button
                type="button"
                onClick={startSchemaEdit}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
              >
                <Pencil size={11} /> Schema
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={handleDuplicate}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              >
                <Copy size={11} /> Duplicar
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={handleDeleteEntity}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                <Trash2 size={11} /> Eliminar
              </button>
            </>
          )}
        </div>
      </div>

      {editingSchema ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-zinc-600 mb-1">
              Nome
            </label>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500/50"
            />
          </div>
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-600">Campos</p>
            {draftCols.map((col, idx) => (
              <div
                key={`${col.name}-${idx}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2"
              >
                <div className="flex flex-col gap-0.5 text-zinc-600">
                  <button type="button" onClick={() => moveCol(idx, -1)} disabled={idx === 0} className="hover:text-zinc-300 disabled:opacity-30" title="Subir">
                    <GripVertical size={12} />
                  </button>
                </div>
                <input
                  value={col.name}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^A-Za-z0-9_]/g, '');
                    setDraftCols((prev) =>
                      prev.map((c, i) => (i === idx ? { ...c, name: v } : c))
                    );
                  }}
                  placeholder="nome_campo"
                  className="flex-1 min-w-[100px] bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1.5 text-xs font-mono text-zinc-200 outline-none"
                />
                <select
                  value={col.type}
                  onChange={(e) => {
                    setDraftCols((prev) =>
                      prev.map((c, i) => (i === idx ? { ...c, type: e.target.value } : c))
                    );
                  }}
                  className="bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-300 outline-none"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <label
                  className="flex items-center gap-1 text-[10px] text-zinc-500 cursor-pointer select-none"
                  title="Campo obrigatório"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(col.required)}
                    onChange={(e) => {
                      setDraftCols((prev) =>
                        prev.map((c, i) =>
                          i === idx ? { ...c, required: e.target.checked } : c
                        )
                      );
                    }}
                    className="rounded border-zinc-700 bg-zinc-900"
                  />
                  req
                </label>
                <button
                  type="button"
                  onClick={() => setDraftCols((prev) => prev.filter((_, i) => i !== idx))}
                  className="p-1.5 text-zinc-500 hover:text-red-400"
                >
                  <Trash2 size={12} />
                </button>
                <div className="flex gap-0.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => moveCol(idx, -1)}
                    disabled={idx === 0}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-500 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCol(idx, 1)}
                    disabled={idx === draftCols.length - 1}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-500 disabled:opacity-30"
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setDraftCols((prev) => [
                  ...prev,
                  { name: `field_${prev.length + 1}`, type: 'string', required: false, order: prev.length },
                ])
              }
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
            >
              <Plus size={12} /> Adicionar campo
            </button>
          </div>
          {warnings.length > 0 && (
            <ul className="space-y-1">
              {warnings.map((w, i) => (
                <li
                  key={i}
                  className={`flex items-start gap-1.5 text-[11px] ${
                    w.level === 'danger'
                      ? 'text-red-400'
                      : w.level === 'warn'
                        ? 'text-amber-400'
                        : 'text-zinc-500'
                  }`}
                >
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                  {w.message}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setEditingSchema(false)}
              className="px-3 py-1.5 rounded-lg text-xs border border-zinc-800 text-zinc-400"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={savingSchema}
              onClick={saveSchema}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
            >
              {savingSchema ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Guardar schema
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
              placeholder="Filtrar linhas…"
              className="flex-1 min-w-[140px] bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-600"
            />
            <button
              type="button"
              disabled={!!busy}
              onClick={handleAddRow}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
            >
              {busy === 'add' ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              Linha
            </button>
            {selectedIds.size > 0 && (
              <button
                type="button"
                disabled={!!busy}
                onClick={handleBulkDelete}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-red-500/40 text-red-400"
              >
                <Trash2 size={11} /> Apagar ({selectedIds.size})
              </button>
            )}
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] border border-zinc-800 text-zinc-400 hover:text-zinc-200"
            >
              <Download size={11} /> CSV
            </button>
            <button
              type="button"
              onClick={exportJson}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] border border-zinc-800 text-zinc-400 hover:text-zinc-200"
            >
              <Download size={11} /> JSON
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={!!busy}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] border border-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
            >
              {busy === 'import' ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
              Importar
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>

          <div
            className={`overflow-auto rounded-xl border border-zinc-800 bg-zinc-950/80 ${
              compact ? 'flex-1 min-h-0' : ''
            }`}
          >
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60">
                  <th className={`${pad} w-8`}>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedIds.size === pageRows.length) setSelectedIds(new Set());
                        else setSelectedIds(new Set(pageRows.map((r) => r.id)));
                      }}
                      className="text-zinc-500 hover:text-zinc-300"
                      title="Selecionar página"
                    >
                      <CheckSquare size={13} />
                    </button>
                  </th>
                  {columns.map((col) => (
                    <th key={col.name} className={`${pad} text-[11px] font-semibold text-zinc-400 uppercase tracking-wider whitespace-nowrap`}>
                      <button
                        type="button"
                        onClick={() => toggleSort(col.name)}
                        className="inline-flex items-center gap-2 hover:text-zinc-200"
                      >
                        {col.name}
                        <TypeBadge type={col.type} />
                        {sortCol === col.name && (
                          <span className="text-blue-400 normal-case">{sortDir === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsLoading ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-zinc-500">
                      <Loader2 size={16} className="inline animate-spin mr-2" />
                      A carregar…
                    </td>
                  </tr>
                ) : !pageRows.length ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-zinc-500 text-xs">
                      Sem linhas. Adiciona, importa CSV/JSON, ou usa templates.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-800/80 hover:bg-zinc-900/40">
                      <td className={pad}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelect(row.id)}
                          className="rounded border-zinc-700 bg-zinc-900"
                        />
                      </td>
                      {columns.map((col) => {
                        const editing =
                          editingCell?.rowId === row.id && editingCell?.col === col.name;
                        return (
                          <td
                            key={col.name}
                            className={`${pad} text-zinc-300 font-mono text-xs max-w-[220px]`}
                            onDoubleClick={() => {
                              setEditingCell({ rowId: row.id, col: col.name });
                              setCellDraft(
                                typeof row[col.name] === 'object'
                                  ? JSON.stringify(row[col.name])
                                  : row[col.name] ?? ''
                              );
                            }}
                          >
                            {editing ? (
                              <div className="flex items-center gap-1">
                                {col.type === 'boolean' ? (
                                  <select
                                    value={String(coerceCellValue(cellDraft, 'boolean'))}
                                    onChange={(e) => setCellDraft(e.target.value)}
                                    className="bg-zinc-900 border border-blue-500/40 rounded px-1 py-0.5 text-xs"
                                    autoFocus
                                  >
                                    <option value="true">true</option>
                                    <option value="false">false</option>
                                  </select>
                                ) : (
                                  <input
                                    value={cellDraft}
                                    onChange={(e) => setCellDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') commitCell(row.id, col.name, col.type);
                                      if (e.key === 'Escape') setEditingCell(null);
                                    }}
                                    className="w-full min-w-[80px] bg-zinc-900 border border-blue-500/40 rounded px-1.5 py-0.5 text-xs outline-none"
                                    autoFocus
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={() => commitCell(row.id, col.name, col.type)}
                                  className="text-emerald-400"
                                >
                                  <Check size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCell(null)}
                                  className="text-zinc-500"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <span className="truncate block cursor-text" title="Duplo-clique para editar">
                                {cellDisplay(row[col.name])}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-between text-[11px] text-zinc-500">
              <span>
                {filteredRows.length} linha(s) · pág. {page + 1}/{pageCount}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="px-2 py-1 rounded border border-zinc-800 disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="px-2 py-1 rounded border border-zinc-800 disabled:opacity-40"
                >
                  Seguinte
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
