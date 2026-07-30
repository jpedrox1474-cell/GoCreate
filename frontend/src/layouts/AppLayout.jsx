import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  User,
  Settings,
  LogOut,
  Menu,
  X,
  Plus,
} from 'lucide-react';
import Logo from '../components/Logo';
import CreditsBadge from '../components/CreditsBadge';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/dashboard', label: 'Projetos', icon: LayoutDashboard },
  { to: '/profile', label: 'Perfil', icon: User },
  { to: '/settings', label: 'Configurações', icon: Settings },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/');
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
        <Logo to="/dashboard" variant="dark" />
      </div>

      <nav className="flex-1 p-3 space-y-1">
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
      </nav>

      <div className="p-3 border-t border-zinc-800">
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
              <Logo to="/dashboard" variant="dark" size="sm" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-md hover:bg-zinc-800 transition-all"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">{sidebar}</div>
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
          <Logo to="/dashboard" variant="dark" size="sm" />
          <CreditsBadge />
        </header>

        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
