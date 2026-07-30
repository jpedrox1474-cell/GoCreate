import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Clock,
  FolderKanban,
  Search,
  Loader2,
  Zap,
  CreditCard,
  EyeOff,
  CheckSquare,
  Trash2,
  X,
} from 'lucide-react';
import { MOCK_PROJECTS } from '../lib/mockData';
import {
  listUserProjects,
  createProject,
  renameProject,
  deleteProject,
  duplicateProject,
} from '../lib/projects';
import { useAuth } from '../context/AuthContext';
import { useCredits } from '../context/CreditsContext';
import Toast from '../components/Toast';
import ProjectActionsMenu from '../components/ProjectActionsMenu';

const STATUS_LABEL = {
  draft: { text: 'Rascunho', className: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
  deployed: { text: 'Deployed', className: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60' },
};

const HIDDEN_DEMOS_KEY = 'gocreate-hidden-demos';

const THUMB_POOL = [
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1556155092-490a1ba16284?w=800&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80&auto=format&fit=crop',
];

const DEMO_THUMBS = {
  'landing-saas':
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80&auto=format&fit=crop',
  'dashboard-analytics':
    'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80&auto=format&fit=crop',
  'checkout-pix':
    'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80&auto=format&fit=crop',
};

function hashId(id = '') {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function getProjectThumb(project) {
  if (project.thumbnail) return project.thumbnail;
  if (DEMO_THUMBS[project.id]) return DEMO_THUMBS[project.id];
  return THUMB_POOL[hashId(project.id) % THUMB_POOL.length];
}

function loadHiddenDemos() {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_DEMOS_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function saveHiddenDemos(set) {
  localStorage.setItem(HIDDEN_DEMOS_KEY, JSON.stringify([...set]));
}

export default function Dashboard() {
  const { user } = useAuth();
  const { credits, plan, creditsUsedThisMonth, allowance, openPricing, lowCredits, unlimited } = useCredits();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [hiddenDemos, setHiddenDemos] = useState(() => loadHiddenDemos());
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const list = await listUserProjects(user.uid);
      setProjects(list);
    } catch (err) {
      console.error('[Dashboard] list:', err);
      setToast({ message: 'Não foi possível carregar os projetos.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const demos = MOCK_PROJECTS.filter((p) => !hiddenDemos.has(p.id));

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const filteredDemos = demos.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase())
  );

  function toggleSelectMode() {
    setSelectMode((v) => {
      if (v) setSelectedIds(new Set());
      return !v;
    });
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    if (!user?.uid || creating) return;
    setCreating(true);
    try {
      const id = await createProject(user.uid, { name: 'Novo Projeto' });
      setToast({ message: 'Projeto criado.', type: 'success' });
      navigate(`/editor/${id}`);
    } catch (err) {
      console.error('[Dashboard] create:', err);
      setToast({ message: 'Falha ao criar projeto.', type: 'error' });
      setCreating(false);
    }
  }

  async function handleRename(project) {
    const next = window.prompt('Novo nome do projeto', project.name);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === project.name) return;
    try {
      await renameProject(project.id, trimmed);
      setProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, name: trimmed } : p))
      );
      setToast({ message: 'Projeto renomeado.', type: 'success' });
    } catch (err) {
      console.error('[Dashboard] rename:', err);
      setToast({ message: 'Não foi possível renomear.', type: 'error' });
    }
  }

  async function handleDuplicate(project) {
    if (!user?.uid) return;
    try {
      const id = await duplicateProject(user.uid, project);
      setToast({ message: 'Projeto duplicado.', type: 'success' });
      navigate(`/editor/${id}`);
    } catch (err) {
      console.error('[Dashboard] duplicate:', err);
      setToast({ message: 'Não foi possível duplicar.', type: 'error' });
    }
  }

  async function handleDelete(project) {
    if (!window.confirm(`Eliminar “${project.name}”? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteProject(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(project.id);
        return next;
      });
      setToast({ message: 'Projeto eliminado.', type: 'success' });
    } catch (err) {
      console.error('[Dashboard] delete:', err);
      setToast({ message: 'Não foi possível eliminar.', type: 'error' });
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    if (!ids.length || bulkDeleting) return;
    if (
      !window.confirm(
        `Eliminar ${ids.length} projeto${ids.length === 1 ? '' : 's'}? Esta ação não pode ser desfeita.`
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    try {
      await Promise.all(ids.map((id) => deleteProject(id)));
      setProjects((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
      setSelectMode(false);
      setToast({
        message: `${ids.length} projeto${ids.length === 1 ? '' : 's'} eliminado${ids.length === 1 ? '' : 's'}.`,
        type: 'success',
      });
    } catch (err) {
      console.error('[Dashboard] bulk delete:', err);
      setToast({ message: 'Falha ao apagar selecionados.', type: 'error' });
      await refresh();
    } finally {
      setBulkDeleting(false);
    }
  }

  function hideDemo(id) {
    setHiddenDemos((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveHiddenDemos(next);
      return next;
    });
    setToast({ message: 'Exemplo ocultado.', type: 'info' });
  }

  function ProjectCard({ project, isDemo = false }) {
    const status = STATUS_LABEL[project.status] || STATUS_LABEL.draft;
    const thumb = getProjectThumb(project);
    const selected = selectedIds.has(project.id);

    return (
      <div
        className={`relative group rounded-xl border bg-zinc-900/60 hover:bg-zinc-900 transition-all overflow-hidden ${
          selected ? 'border-blue-500/50 ring-1 ring-blue-500/30' : 'border-zinc-800 hover:border-zinc-700'
        }`}
      >
        {selectMode && !isDemo && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleSelected(project.id);
            }}
            className={`absolute top-2 left-2 z-20 w-6 h-6 rounded-md border flex items-center justify-center transition-all ${
              selected
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-zinc-950/80 border-zinc-600 text-transparent hover:border-zinc-400'
            }`}
            aria-pressed={selected}
            aria-label={selected ? 'Desselecionar' : 'Selecionar'}
          >
            <CheckSquare size={14} className={selected ? 'opacity-100' : 'opacity-0'} />
          </button>
        )}

        <Link
          to={selectMode && !isDemo ? '#' : `/editor/${project.id}`}
          onClick={(e) => {
            if (selectMode && !isDemo) {
              e.preventDefault();
              toggleSelected(project.id);
            }
          }}
          className="block"
        >
          {/* Browser-chrome thumbnail */}
          <div className="relative h-36 bg-zinc-950 border-b border-zinc-800 overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-6 bg-zinc-900/95 border-b border-zinc-800 flex items-center gap-1.5 px-2.5 z-10">
              <span className="w-2 h-2 rounded-full bg-zinc-700" />
              <span className="w-2 h-2 rounded-full bg-zinc-700" />
              <span className="w-2 h-2 rounded-full bg-zinc-700" />
              <span className="ml-2 flex-1 h-3 rounded bg-zinc-800/80 max-w-[55%]" />
            </div>
            <img
              src={thumb}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-95 transition-opacity pt-6"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div
              className={`absolute inset-0 pt-6 bg-gradient-to-br ${project.color || 'from-blue-600 to-indigo-600'} opacity-40 mix-blend-overlay pointer-events-none`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-3 left-3 flex items-center gap-2 z-[1]">
              <div className="w-8 h-8 rounded-lg bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10">
                <FolderKanban size={14} className="text-white" />
              </div>
            </div>
            {isDemo && (
              <span className="absolute top-8 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/50 text-white/90 border border-white/10 z-[1]">
                Exemplo
              </span>
            )}
          </div>
          <div className="p-4">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h2 className="text-sm font-semibold text-zinc-100 truncate">{project.name}</h2>
              <span
                className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${status.className}`}
              >
                {status.text}
              </span>
            </div>
            <p className="text-xs text-zinc-500 line-clamp-2 mb-3">
              {project.description || 'Projeto GoCreate'}
            </p>
            <div className="flex items-center justify-between text-[11px] text-zinc-500">
              <span className="inline-flex items-center gap-1">
                <Clock size={11} />
                {project.updatedAtLabel || project.updatedAt || 'Agora'}
              </span>
              <span className="font-mono text-zinc-600">{project.framework || 'React'}</span>
            </div>
          </div>
        </Link>

        {!selectMode && (
          <div className="absolute top-8 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity z-20">
            {isDemo ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  hideDemo(project.id);
                }}
                className="p-1.5 rounded-md bg-black/40 text-white/90 hover:bg-black/60 transition-all inline-flex items-center gap-1 text-[10px] font-medium"
                title="Ocultar exemplo"
              >
                <EyeOff size={12} />
              </button>
            ) : (
              <ProjectActionsMenu
                project={project}
                buttonClassName="bg-black/40 text-white/90 hover:bg-black/60 hover:text-white"
                onOpen={(proj) => navigate(`/editor/${proj.id}`)}
                onRename={handleRename}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">
            Workspace
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 tracking-tight">
            Meus Projetos
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Olá{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''} — continua de onde
            paraste.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleSelectMode}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium rounded-lg border transition-all ${
              selectMode
                ? 'border-blue-500/40 bg-blue-600/15 text-blue-300'
                : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100'
            }`}
          >
            {selectMode ? <X size={15} /> : <CheckSquare size={15} />}
            {selectMode ? 'Cancelar' : 'Selecionar Vários'}
          </button>
          {selectMode && (
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={!selectedIds.size || bulkDeleting}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg border border-red-500/40 bg-red-600/15 text-red-400 hover:bg-red-600/25 hover:text-red-300 transition-all disabled:opacity-40"
            >
              {bulkDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              Apagar Selecionados
              {selectedIds.size > 0 && (
                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-red-500/20">
                  {selectedIds.size}
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || selectMode}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-md shadow-blue-900/20 transition-all disabled:opacity-60"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Criar Novo Projeto
          </button>
        </div>
      </div>

      <section className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600/15 flex items-center justify-center">
              <CreditCard size={15} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Uso e Faturamento</h2>
              <p className="text-xs text-zinc-500">
                Plano{' '}
                <span className="text-zinc-300 capitalize font-medium">
                  {plan === 'enterprise_master' ? 'Owner Master' : plan}
                </span>
                {' · '}
                <span className={lowCredits ? 'text-amber-400 font-medium' : 'text-zinc-400'}>
                  {unlimited ? '∞ Ilimitado' : `${credits} créditos restantes`}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openPricing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all"
          >
            <Zap size={12} />
            Ver planos
          </button>
        </div>
        <div className="space-y-2">
          {unlimited ? (
            <p className="text-[11px] text-emerald-400/90">Conta Owner — créditos e paywalls liberados.</p>
          ) : (
            <>
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>
              Usado este mês: {creditsUsedThisMonth} / {allowance}
            </span>
            <span>
              {Math.min(100, Math.round((creditsUsedThisMonth / Math.max(1, allowance)) * 100))}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                lowCredits ? 'bg-amber-500' : 'bg-blue-600'
              }`}
              style={{
                width: `${Math.min(100, (creditsUsedThisMonth / Math.max(1, allowance)) * 100)}%`,
              }}
            />
          </div>
            </>
          )}
        </div>
      </section>

      <div className="relative mb-6 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar projetos…"
          className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-lg py-2.5 pl-9 pr-4 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-all"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500 gap-2">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">A carregar projetos…</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {!selectMode && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="group flex flex-col items-center justify-center gap-3 min-h-[240px] rounded-xl border border-dashed border-zinc-700 hover:border-blue-500/50 bg-zinc-900/40 hover:bg-zinc-900/80 transition-all p-6 disabled:opacity-60"
              >
                <div className="w-12 h-12 rounded-xl bg-zinc-800 group-hover:bg-blue-600/20 flex items-center justify-center transition-all">
                  {creating ? (
                    <Loader2 size={22} className="text-blue-400 animate-spin" />
                  ) : (
                    <Plus
                      size={22}
                      className="text-zinc-400 group-hover:text-blue-400 transition-all"
                    />
                  )}
                </div>
                <span className="text-sm font-semibold text-zinc-300 group-hover:text-zinc-100 transition-all">
                  Criar Novo Projeto
                </span>
              </button>
            )}

            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>

          {!filteredProjects.length && !search && (
            <p className="text-center text-sm text-zinc-500 mt-8">
              Ainda não tens projetos. Cria o primeiro ou abre um exemplo abaixo.
            </p>
          )}

          {search && !filteredProjects.length && !filteredDemos.length && (
            <p className="text-center text-sm text-zinc-500 mt-8">Nenhum projeto encontrado.</p>
          )}

          {filteredDemos.length > 0 && (
            <div className="mt-10">
              <h2 className="text-sm font-semibold text-zinc-300 mb-3">Exemplos</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDemos.map((project) => (
                  <ProjectCard key={project.id} project={project} isDemo />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
