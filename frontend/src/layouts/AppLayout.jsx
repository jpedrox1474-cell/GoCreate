import React, { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  User,
  Settings,
  Menu,
  X,
  Plus,
  FolderKanban,
  Loader2,
  Plug,
  CheckSquare,
  Trash2,
  Database,
  Shield,
  Code2,
} from 'lucide-react';
import Logo from '../components/Logo';
import CreditsBadge from '../components/CreditsBadge';
import ProjectActionsMenu from '../components/ProjectActionsMenu';
import UserMenu from '../components/UserMenu';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { isOwnerEmail } from '../lib/plans';
import {
  listUserProjects,
  renameProject,
  deleteProject,
  deleteProjects,
  duplicateProject,
} from '../lib/projects';

const NAV = [
  { to: '/dashboard', label: 'Projetos', icon: LayoutDashboard },
  { to: '/entities', label: 'Entidades', icon: Database },
  { to: '/functions', label: 'Funções', icon: Code2 },
  { to: '/integrations', label: 'Integrações', icon: Plug },
  { to: '/profile', label: 'Perfil', icon: User },
  { to: '/settings', label: 'Configurações', icon: Settings },
];

export default function AppLayout() {
  const { user } = useAuth();
  const { isLight } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Admin: só allowlist de e-mails (não confiar em role/plan do cliente)
  const navItems = isOwnerEmail(user?.email)
    ? [...NAV, { to: '/admin', label: 'Admin', icon: Shield }]
    : NAV;

  const refreshProjects = useCallback(async () => {
    if (!user?.uid) return;
    setProjectsLoading(true);
    try {
      const list = await listUserProjects(user.uid);
      setProjects(list.slice(0, 12));
    } catch (err) {
      console.error('[AppLayout] projects:', err);
    } finally {
      setProjectsLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

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
      console.error('[AppLayout] rename:', err);
      setToast({ message: 'Não foi possível renomear.', type: 'error' });
    }
  }

  async function handleDuplicate(project) {
    if (!user?.uid) return;
    try {
      const id = await duplicateProject(user.uid, project);
      setToast({ message: 'Projeto duplicado.', type: 'success' });
      await refreshProjects();
      navigate(`/editor/${id}`);
    } catch (err) {
      console.error('[AppLayout] duplicate:', err);
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
      console.error('[AppLayout] delete:', err);
      setToast({
        message: err?.message || 'Não foi possível eliminar.',
        type: 'error',
      });
    }
  }

  function enterSelectFor(project) {
    setSelectMode(true);
    setSelectedIds(new Set([project.id]));
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(projects.map((p) => p.id)));
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
      const result = await deleteProjects(ids);
      const deleted = new Set(result.deleted || []);
      setProjects((prev) => prev.filter((p) => !deleted.has(p.id)));
      setSelectedIds(new Set());
      setSelectMode(false);
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
    } catch (err) {
      console.error('[AppLayout] bulk delete:', err);
      setToast({ message: 'Falha ao apagar selecionados.', type: 'error' });
      await refreshProjects();
    } finally {
      setBulkDeleting(false);
    }
  }

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
      isActive
        ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20'
        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 border border-transparent'
    }`;

  const sidebar = (
    <>
      <div className="px-4 py-4 border-b border-zinc-800">
        <Logo to="/dashboard" variant={isLight ? 'light' : 'dark'} />
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar min-h-0">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClass} onClick={() => setMobileOpen(false)}>
            <Icon size={16} />
            {label}
          </NavLink>
        ))}

        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            navigate('/editor/new');
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 mt-4 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-all shadow-md shadow-blue-900/20"
        >
          <Plus size={16} />
          Novo Projeto
        </button>

        <div className="mt-4 pt-3 border-t border-zinc-800/80">
          <div className="px-2 mb-1.5 flex items-center justify-between gap-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 flex items-center gap-1">
              <FolderKanban size={10} /> Recentes
            </p>
            {projects.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectMode((v) => {
                    if (v) setSelectedIds(new Set());
                    return !v;
                  });
                }}
                className="text-[10px] font-medium text-zinc-500 hover:text-zinc-300"
              >
                {selectMode ? 'Cancelar' : 'Selecionar'}
              </button>
            )}
          </div>

          {selectMode && projects.length > 0 && (
            <div className="flex flex-wrap gap-1 px-1 mb-2">
              <button
                type="button"
                onClick={selectAll}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              >
                <CheckSquare size={10} /> Todos
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={!selectedIds.size || bulkDeleting}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-md border border-red-500/40 text-red-400 hover:bg-red-600/15 disabled:opacity-40"
              >
                {bulkDeleting ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                Apagar ({selectedIds.size})
              </button>
            </div>
          )}

          {projectsLoading && !projects.length ? (
            <div className="flex items-center gap-2 px-2 py-2 text-zinc-500 text-xs">
              <Loader2 size={12} className="animate-spin" /> A carregar…
            </div>
          ) : !projects.length ? (
            <p className="px-2 py-1 text-[11px] text-zinc-600">Ainda sem projetos.</p>
          ) : (
            <ul className="space-y-0.5">
              {projects.map((p) => {
                const selected = selectedIds.has(p.id);
                return (
                  <li
                    key={p.id}
                    className={`group flex items-center gap-0.5 rounded-lg hover:bg-zinc-900/60 ${
                      selected ? 'bg-blue-600/10 ring-1 ring-blue-500/30' : ''
                    }`}
                  >
                    {selectMode && (
                      <button
                        type="button"
                        onClick={() => toggleSelected(p.id)}
                        className={`ml-1 w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                          selected
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'border-zinc-600'
                        }`}
                        aria-label={selected ? 'Desselecionar' : 'Selecionar'}
                      >
                        {selected ? <CheckSquare size={10} /> : null}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (selectMode) {
                          toggleSelected(p.id);
                          return;
                        }
                        setMobileOpen(false);
                        navigate(`/editor/${p.id}`);
                      }}
                      className="flex-1 min-w-0 text-left px-2.5 py-2 text-xs text-zinc-400 hover:text-zinc-100 truncate"
                      title={p.name}
                    >
                      {p.name}
                    </button>
                    {!selectMode && (
                      <div className="shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity pr-0.5">
                        <ProjectActionsMenu
                          project={p}
                          size="xs"
                          onSelect={enterSelectFor}
                          onOpen={(proj) => {
                            setMobileOpen(false);
                            navigate(`/editor/${proj.id}`);
                          }}
                          onRename={handleRename}
                          onDuplicate={handleDuplicate}
                          onDelete={handleDelete}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </nav>

      <div className="p-3 border-t border-zinc-800 shrink-0">
        <UserMenu variant="sidebar" showName showChevron className="mb-2" />
        <div className="px-2">
          <CreditsBadge className="w-full justify-center" />
        </div>
      </div>
    </>
  );

  return (
    <div className="gc-app-shell flex h-screen w-full bg-zinc-950 text-zinc-300 font-sans overflow-hidden">
      <aside className="hidden lg:flex w-60 flex-col border-r border-zinc-800 bg-zinc-950 shrink-0">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 flex flex-col bg-zinc-950 border-r border-zinc-800 shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <Logo to="/dashboard" variant={isLight ? 'light' : 'dark'} size="sm" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-md hover:bg-zinc-800 transition-all"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">{sidebar}</div>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center justify-between px-4 h-14 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md shrink-0">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-all"
          >
            <Menu size={18} />
          </button>
          <Logo to="/dashboard" variant={isLight ? 'light' : 'dark'} size="sm" />
          <CreditsBadge />
        </header>

        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <Outlet />
        </main>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
