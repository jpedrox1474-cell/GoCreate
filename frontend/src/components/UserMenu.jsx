import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { User, Settings, LayoutDashboard, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const MENU_W = 224;
const MENU_H_EST = 220;
const VIEW_PAD = 8;
const GAP = 4;

/**
 * Base44-style account menu: avatar opens dropdown; only Logout signs out.
 * Portal + fixed positioning so the menu is never clipped by overflow/z-index.
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
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const place = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuW = Math.min(MENU_W, window.innerWidth - VIEW_PAD * 2);
    const measuredH = menuRef.current?.offsetHeight || MENU_H_EST;
    const openUp = variant === 'sidebar';

    let left = variant === 'sidebar' ? r.left : r.right - menuW;
    left = Math.max(VIEW_PAD, Math.min(left, window.innerWidth - menuW - VIEW_PAD));

    let top;
    if (openUp) {
      top = Math.max(VIEW_PAD, r.top - measuredH - GAP);
      if (top + measuredH > r.top - GAP && r.bottom + measuredH + VIEW_PAD < window.innerHeight) {
        top = Math.min(r.bottom + GAP, window.innerHeight - measuredH - VIEW_PAD);
      }
    } else {
      top = r.bottom + GAP;
      if (top + measuredH > window.innerHeight - VIEW_PAD) {
        top = Math.max(VIEW_PAD, r.top - measuredH - GAP);
      }
    }

    setCoords({ top, left, width: menuW });
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
  }, [open, variant]);

  useEffect(() => {
    if (!open) return undefined;

    function onDoc(e) {
      if (btnRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }

    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, variant]);

  if (!user) return null;

  const initial = (user.displayName || user.email || 'U')[0].toUpperCase();
  const isCompact = variant === 'compact' || variant === 'header';

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
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
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

      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ top: coords.top, left: coords.left, width: coords.width || MENU_W }}
              className="gc-themed fixed z-[200] rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/40 py-1"
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
            </div>,
            document.body
          )
        : null}

      <Link to="/profile" className="sr-only">
        Perfil
      </Link>
    </div>
  );
}
