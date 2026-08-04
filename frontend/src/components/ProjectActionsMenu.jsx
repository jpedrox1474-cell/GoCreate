import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  MoreVertical,
  FolderOpen,
  Pencil,
  Copy,
  Trash2,
  CheckSquare,
  Archive,
} from 'lucide-react';

/**
 * Three-dots project menu — Selecionar / Abrir / Renomear / Duplicar / Arquivar / Eliminar.
 */
export default function ProjectActionsMenu({
  project,
  onOpen,
  onRename,
  onDuplicate,
  onArchive,
  onDelete,
  onSelect,
  disabled = false,
  size = 'sm',
  align = 'right',
  className = '',
  buttonClassName = '',
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function place() {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const menuW = 168;
      const pad = 8;
      let left = align === 'left' ? r.left : r.right - menuW;
      left = Math.max(pad, Math.min(left, window.innerWidth - menuW - pad));
      let top = r.bottom + 4;
      const approxH = 240;
      if (top + approxH > window.innerHeight - pad) {
        top = Math.max(pad, r.top - approxH - 4);
      }
      setCoords({ top, left });
    }

    place();

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
  }, [open, align]);

  const iconSize = size === 'xs' ? 12 : 14;
  const btnPad = size === 'xs' ? 'p-1' : 'p-1.5';

  const items = [
    onSelect && {
      key: 'select',
      label: 'Selecionar',
      icon: CheckSquare,
      onClick: () => {
        setOpen(false);
        onSelect(project);
      },
    },
    onOpen && {
      key: 'open',
      label: 'Abrir',
      icon: FolderOpen,
      onClick: () => {
        setOpen(false);
        onOpen(project);
      },
    },
    onRename && {
      key: 'rename',
      label: 'Renomear',
      icon: Pencil,
      onClick: () => {
        setOpen(false);
        onRename(project);
      },
    },
    onDuplicate && {
      key: 'duplicate',
      label: 'Duplicar',
      icon: Copy,
      onClick: () => {
        setOpen(false);
        onDuplicate(project);
      },
    },
    onArchive && {
      key: 'archive',
      label: project?.status === 'archived' ? 'Restaurar' : 'Arquivar',
      icon: Archive,
      onClick: () => {
        setOpen(false);
        onArchive(project);
      },
    },
    onDelete && {
      key: 'delete',
      label: 'Eliminar',
      icon: Trash2,
      danger: true,
      onClick: () => {
        setOpen(false);
        onDelete(project);
      },
    },
  ].filter(Boolean);

  if (!items.length) return null;

  return (
    <div className={`relative inline-flex ${className}`} onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-label="Opções do projeto"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`${btnPad} rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-all disabled:opacity-40 ${buttonClassName}`}
      >
        <MoreVertical size={iconSize} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: coords.top, left: coords.left }}
            className="gc-themed fixed z-[100] w-[168px] py-1 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/40 animate-in"
          >
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    item.onClick();
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-all ${
                    item.danger
                      ? 'text-red-400 hover:bg-zinc-800 hover:text-red-300'
                      : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
                  }`}
                >
                  <Icon size={12} className="shrink-0 opacity-80" />
                  {item.label}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
