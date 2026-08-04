import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Settings, LayoutDashboard, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Base44-style account menu: avatar opens dropdown; only Logout signs out.
 */
export default function UserMenu({
  variant = 'sidebar',
  showName = true,
  showChevron = false,
  className = '',
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const initial = (user.displayName || user.email || 'U')[0].toUpperCase();
  const isCompact = variant === 'compact' || variant === 'header';
  const menuAlign = variant === 'sidebar' ? 'left-0 bottom-full mb-1' : 'right-0 top-full mt-1';

  async function handleLogout(e) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    await logout();
    navigate('/');
  }

  function go(path) {
    setOpen(false);
    navigate(path);
  }

  const avatar = user.photoURL ? (
    <img
      src={user.photoURL}
      alt=""
      className={`rounded-full object-cover border border-zinc-700 shrink-0 ${
        isCompact ? 'w-7 h-7' : 'w-8 h-8'
      }`}
    />
  ) : (
    <div
      className={`rounded-full bg-blue-600 flex items-center justify-center font-bold text-white shrink-0 ${
        isCompact ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-xs'
      }`}
    >
      {initial}
    </div>
  );

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu da conta"
        className={`flex items-center gap-2 rounded-lg transition-all ${
          isCompact
            ? 'p-0.5 hover:bg-zinc-800/60'
            : 'w-full px-2 py-2 hover:bg-zinc-800/60'
        }`}
      >
        {avatar}
        {showName && !isCompact ? (
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm font-medium text-zinc-200 truncate">
              {user.displayName || 'Utilizador'}
            </p>
            <p className="text-[11px] text-zinc-500 truncate">{user.email}</p>
          </div>
        ) : null}
        {showChevron ? (
          <ChevronDown
            size={14}
            className={`text-zinc-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className={`absolute z-50 w-56 rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/40 py-1 ${menuAlign}`}
        >
          <div className="px-3 py-2 border-b border-zinc-800">
            <p className="text-xs font-medium text-zinc-200 truncate">
              {user.displayName || 'Utilizador'}
            </p>
            <p className="text-[11px] text-zinc-500 truncate">{user.email}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => go('/profile')}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <User size={14} className="text-zinc-500" />
            A minha conta / Perfil
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => go('/settings')}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <Settings size={14} className="text-zinc-500" />
            Configurações
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => go('/dashboard')}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <LayoutDashboard size={14} className="text-zinc-500" />
            Dashboard
          </button>
          <div className="my-1 border-t border-zinc-800" />
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-600/10"
          >
            <LogOut size={14} />
            Sair
          </button>
        </div>
      ) : null}

      {/* Hidden link for a11y crawlers */}
      <Link to="/profile" className="sr-only">
        Perfil
      </Link>
    </div>
  );
}
