import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  PanelLeftClose,
  PanelLeft,
  FolderKanban,
  MessageSquare,
  Plus,
  Clock,
} from 'lucide-react';
import { MOCK_PROJECTS } from '../../lib/mockData';

function formatRelative(label) {
  if (!label) return 'Agora';
  return String(label);
}

export default function HistoryDrawer({
  open,
  onToggle,
  currentProjectId,
  onNewChat,
  projects = [],
}) {
  const list = projects.length ? projects : MOCK_PROJECTS;

  const conversations = useMemo(() => {
    // Derive recent chats from projects (real) or fall back to mock demos
    if (projects.length) {
      return projects.slice(0, 8).map((p) => ({
        id: `conv-${p.id}`,
        title: p.name || 'Conversa',
        time: formatRelative(p.updatedAtLabel || p.updatedAt),
        projectId: p.id,
      }));
    }
    return [
      { id: 'c1', title: 'Landing SaaS premium', time: 'Há 2 h', projectId: 'landing-saas' },
      { id: 'c2', title: 'Dashboard com KPIs', time: 'Ontem', projectId: 'dashboard-analytics' },
      { id: 'c3', title: 'Checkout Pix', time: 'Há 5 dias', projectId: 'checkout-pix' },
    ];
  }, [projects]);

  return (
    <aside
      className={`
        relative shrink-0 h-full border-r border-zinc-800/80 bg-zinc-950 flex flex-col
        transition-all duration-300 ease-in-out overflow-hidden
        ${open ? 'w-[220px]' : 'w-11'}
      `}
    >
      <div className="flex items-center justify-between h-11 px-2 border-b border-zinc-800/80 shrink-0">
        {open && (
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-1 truncate">
            Histórico
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="p-1.5 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-md transition-all ml-auto"
          title={open ? 'Recolher histórico' : 'Expandir histórico'}
        >
          {open ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
        </button>
      </div>

      {open ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4">
          <button
            type="button"
            onClick={onNewChat}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all"
          >
            <Plus size={14} />
            Novo chat
          </button>

          <div>
            <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 flex items-center gap-1">
              <FolderKanban size={10} /> Projetos
            </p>
            <ul className="space-y-0.5">
              {list.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/editor/${p.id}`}
                    className={`flex items-start gap-2 px-2.5 py-2 rounded-lg text-xs transition-all ${
                      currentProjectId === p.id
                        ? 'bg-zinc-900 text-zinc-100 border border-zinc-800'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
                    }`}
                  >
                    <FolderKanban size={13} className="mt-0.5 shrink-0 text-blue-400/80" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block text-[10px] text-zinc-600 mt-0.5 flex items-center gap-1">
                        <Clock size={9} /> {formatRelative(p.updatedAtLabel || p.updatedAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 flex items-center gap-1">
              <MessageSquare size={10} /> Conversas
            </p>
            <ul className="space-y-0.5">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/editor/${c.projectId}`}
                    className={`flex items-start gap-2 px-2.5 py-2 rounded-lg text-xs transition-all ${
                      currentProjectId === c.projectId
                        ? 'bg-zinc-900/80 text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                    }`}
                  >
                    <MessageSquare size={13} className="mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.title}</span>
                      <span className="block text-[10px] text-zinc-600 mt-0.5">{c.time}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center gap-2 pt-3">
          <button
            type="button"
            onClick={onNewChat}
            className="p-2 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-all"
            title="Novo chat"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="p-2 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-all"
            title="Projetos"
          >
            <FolderKanban size={16} />
          </button>
        </div>
      )}
    </aside>
  );
}
