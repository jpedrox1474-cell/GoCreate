import React, { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  User,
  Settings,
  LogOut,
  Menu,
  X,
  Plus,
  FolderKanban,
  Loader2,
  Plug,
  Bot,
  Database,
} from 'lucide-react';
import Logo from '../components/Logo';
import CreditsBadge from '../components/CreditsBadge';
import ProjectActionsMenu from '../components/ProjectActionsMenu';
import Toast from '../components/Toast';
import VoiceAssistantModal from '../components/editor/VoiceAssistantModal';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  listUserProjects,
  renameProject,
  deleteProject,
  duplicateProject,
} from '../lib/projects';
import { PENDING_PROMPT_KEY } from '../lib/mockData';

const NAV = [
  { to: '/dashboard', label: 'Projetos', icon: LayoutDashboard },
  { to: '/entities', label: 'Banco de Dados', icon: Database },
  { to: '/automations', label: 'Automations', icon: Bot },
  { to: '/integrations', label: 'Integrações', icon: Plug },
  { to: '/profile', label: 'Perfil', icon: User },
  { to: '/settings', label: 'Configurações', icon: Settings },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { isLight } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [jarvisOpen, setJarvisOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [toast, setToast] = useState(null);

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

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  function handleJarvisConfirmBuild(prompt) {
    setJarvisOpen(false);
    const trimmed = (prompt || '').trim();
    if (!trimmed) return;
    sessionStorage.setItem(PENDING_PROMPT_KEY, trimmed);
    navigate('/editor/new');
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
      setToast({ message: 'Projeto eliminado.', type: 'success' });
    } catch (err) {
      console.error('[AppLayout] delete:', err);
      setToast({ message: 'Não foi possível eliminar.', type: 'error' });
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
        {NAV.map(({ to, label, icon: Icon }) => (
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

        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            setJarvisOpen(true);
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 mt-2 rounded-lg text-sm font-medium text-indigo-200/90 hover:text-white border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 transition-all"
        >
          <span
            className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 shadow-sm shadow-indigo-500/40 shrink-0"
            aria-hidden
          />
          Modo Jarvis
        </button>

        <div className="mt-4 pt-3 border-t border-zinc-800/80">
          <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 flex items-center gap-1">
            <FolderKanban size={10} /> Recentes
          </p>
          {projectsLoading && !projects.length ? (
            <div className="flex items-center gap-2 px-2 py-2 text-zinc-500 text-xs">
              <Loader2 size={12} className="animate-spin" /> A carregar…
            </div>
          ) : !projects.length ? (
            <p className="px-2 py-1 text-[11px] text-zinc-600">Ainda sem projetos.</p>
          ) : (
            <ul className="space-y-0.5">
              {projects.map((p) => (
                <li key={p.id} className="group flex items-center gap-0.5 rounded-lg hover:bg-zinc-900/60">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      navigate(`/editor/${p.id}`);
                    }}
                    className="flex-1 min-w-0 text-left px-2.5 py-2 text-xs text-zinc-400 hover:text-zinc-100 truncate"
                    title={p.name}
                  >
                    {p.name}
                  </button>
                  <div className="shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity pr-0.5">
                    <ProjectActionsMenu
                      project={p}
                      size="xs"
                      onOpen={(proj) => {
                        setMobileOpen(false);
                        navigate(`/editor/${proj.id}`);
                      }}
                      onRename={handleRename}
                      onDuplicate={handleDuplicate}
                      onDelete={handleDelete}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </nav>

      <div className="p-3 border-t border-zinc-800 shrink-0">
        <div className="flex items-center gap-3 px-2 py-2 mb-2">
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              className="w-8 h-8 rounded-full object-cover shrink-0 border border-zinc-700"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {(user?.displayName || user?.email || 'U')[0].toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-200 truncate">
              {user?.displayName || 'Utilizador'}
            </p>
            <p className="text-[11px] text-zinc-500 truncate">{user?.email}</p>
          </div>
        </div>
        <div className="px-2 mb-2">
          <CreditsBadge className="w-full justify-center" />
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-all"
        >
          <LogOut size={16} />
          Sair
        </button>
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
      <VoiceAssistantModal
        open={jarvisOpen}
        onClose={() => setJarvisOpen(false)}
        onConfirmBuild={handleJarvisConfirmBuild}
      />
    </div>
  );
}
