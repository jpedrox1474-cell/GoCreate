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
  const { credits, plan, creditsUsedThisMonth, allowance, openPricing, lowCredits } = useCredits();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [hiddenDemos, setHiddenDemos] = useState(() => loadHiddenDemos());

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
      setToast({ message: 'Projeto eliminado.', type: 'success' });
    } catch (err) {
      console.error('[Dashboard] delete:', err);
      setToast({ message: 'Não foi possível eliminar.', type: 'error' });
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
    return (
      <div className="relative group rounded-xl border border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-900 transition-all overflow-hidden">
        <Link to={`/editor/${project.id}`} className="block">
          <div className={`h-28 bg-gradient-to-br ${project.color || 'from-blue-600 to-indigo-600'} opacity-90 relative`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.2),transparent_50%)]" />
            <div className="absolute bottom-3 left-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-black/30 backdrop-blur-sm flex items-center justify-center">
                <FolderKanban size={14} className="text-white" />
              </div>
            </div>
            {isDemo && (
              <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/40 text-white/90 border border-white/10">
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

        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
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
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-md shadow-blue-900/20 transition-all disabled:opacity-60"
        >
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Criar Novo Projeto
        </button>
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
                <span className="text-zinc-300 capitalize font-medium">{plan}</span>
                {' · '}
                <span className={lowCredits ? 'text-amber-400 font-medium' : 'text-zinc-400'}>
                  {credits} créditos restantes
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
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>
              Usado este mês: {creditsUsedThisMonth} / {allowance}
            </span>
            <span>{Math.min(100, Math.round((creditsUsedThisMonth / Math.max(1, allowance)) * 100))}%</span>
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
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="group flex flex-col items-center justify-center gap-3 min-h-[200px] rounded-xl border border-dashed border-zinc-700 hover:border-blue-500/50 bg-zinc-900/40 hover:bg-zinc-900/80 transition-all p-6 disabled:opacity-60"
            >
              <div className="w-12 h-12 rounded-xl bg-zinc-800 group-hover:bg-blue-600/20 flex items-center justify-center transition-all">
                {creating ? (
                  <Loader2 size={22} className="text-blue-400 animate-spin" />
                ) : (
                  <Plus size={22} className="text-zinc-400 group-hover:text-blue-400 transition-all" />
                )}
              </div>
              <span className="text-sm font-semibold text-zinc-300 group-hover:text-zinc-100 transition-all">
                Criar Novo Projeto
              </span>
            </button>

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
