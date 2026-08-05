import React, { useState } from 'react';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  LayoutTemplate,
  Type,
  Palette,
  Square,
  Sparkles,
  Monitor,
  LayoutDashboard,
  Pencil,
  Settings,
  Save,
  Download,
  Menu,
  PanelLeft,
  Play,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Logo from '../Logo';
import CreditsBadge from '../CreditsBadge';
import UserMenu from '../UserMenu';
import { useTheme } from '../../context/ThemeContext';

/* -------------------------------------------------------------------------- */
/*  Top Navbar — Pré-visualização / Painel / Editar código                    */
/* -------------------------------------------------------------------------- */

export function EditorTopNavbar({
  viewMode,
  onViewModeChange,
  projectName,
  isReadOnly = false,
  isProjectOwner = true,
  onToggleMobileSidebar,
  onToggleHistory,
  historyOpen = true,
  onSave,
  onExport,
  onSettings,
  onPublish,
  showPublish = true,
}) {
  const { isLight } = useTheme();

  const modes = [
    { id: 'preview', label: 'Pré-visualização', Icon: Monitor },
    { id: 'panel', label: 'Painel', Icon: LayoutDashboard },
    {
      id: 'edit',
      label: 'Editar código',
      Icon: Pencil,
      title:
        'Abre código + preview lado a lado e destaca elementos. Não é um editor pixel a pixel tipo Figma (limitação cross-origin do iframe).',
    },
  ];

  return (
    <header className="relative flex items-center justify-between px-3 sm:px-4 h-14 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md z-30 shrink-0 gap-2">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-md transition-all lg:hidden"
          aria-label="Abrir chat"
        >
          <Menu size={18} />
        </button>
        <button
          type="button"
          onClick={onToggleHistory}
          className="hidden lg:inline-flex p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-md transition-all"
          title={historyOpen ? 'Recolher histórico' : 'Abrir histórico'}
        >
          <PanelLeft size={16} />
        </button>

        <Logo to="/dashboard" variant={isLight ? 'light' : 'dark'} size="sm" />

        <div className="h-4 w-px bg-zinc-800 mx-1 hidden sm:block" />

        <Link
          to="/dashboard"
          className="hidden sm:inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-all"
        >
          Projetos
        </Link>

        <button
          type="button"
          className="inline-flex items-center gap-1.5 max-w-[160px] sm:max-w-[200px] rounded-md px-2 py-1.5 text-sm font-medium text-zinc-300 bg-zinc-900/50 border border-zinc-800/50 hover:bg-zinc-800/50 transition-colors"
          title={projectName || 'Projeto'}
        >
          <span className="truncate">{projectName || 'Projeto'}</span>
          <ChevronDown size={14} className="text-zinc-500 shrink-0" />
        </button>
      </div>

      <div className="flex items-center justify-center shrink-0">
        <div className="inline-flex items-center gap-0.5 rounded-full bg-zinc-900 border border-zinc-800 p-1">
          {modes.map(({ id, label, Icon, title }) => {
            const active = viewMode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onViewModeChange?.(id)}
                title={title || label}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon size={14} />
                <span className="hidden md:inline">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 sm:gap-2 flex-1">
        <CreditsBadge />
        <UserMenu variant="header" showName={false} className="hidden sm:block" />
        {typeof onSave === 'function' && (
          <button
            type="button"
            onClick={onSave}
            disabled={isReadOnly}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 rounded-md transition-all disabled:opacity-40"
          >
            <Save size={14} />
            Salvar
          </button>
        )}
        {typeof onExport === 'function' && (
          <button
            type="button"
            onClick={onExport}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 rounded-md transition-all"
          >
            <Download size={14} />
            Exportar
          </button>
        )}
        {typeof onSettings === 'function' && (
          <button
            type="button"
            onClick={onSettings}
            disabled={isReadOnly && !isProjectOwner}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 rounded-md transition-all disabled:opacity-40"
            title={isReadOnly ? 'Só leitura' : 'Configurações'}
          >
            <Settings size={16} />
          </button>
        )}
        <button
          type="button"
          className="hidden xl:inline-flex p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 rounded-md transition-all"
          aria-label="Notificações"
          title="Notificações"
        >
          <Bell size={16} />
        </button>
        <div className="w-px h-4 bg-zinc-800 mx-0.5 hidden sm:block" />
        {isReadOnly ? (
          <span className="px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-zinc-800 text-zinc-400 border border-zinc-700">
            Visualizador
          </span>
        ) : showPublish ? (
          <button
            type="button"
            onClick={onPublish}
            className="flex items-center gap-2 px-3 sm:px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-all shadow-md shadow-blue-900/20"
          >
            <Play size={14} className="fill-white" />
            Publicar
          </button>
        ) : null}
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Right Sidebar — propriedades (placeholders)                               */
/* -------------------------------------------------------------------------- */

const STYLE_SECTIONS = [
  { id: 'layout', label: 'Layout', Icon: LayoutTemplate },
  { id: 'typography', label: 'Tipografia', Icon: Type },
  { id: 'colors', label: 'Cores', Icon: Palette },
  { id: 'borders', label: 'Bordas', Icon: Square },
  { id: 'effects', label: 'Efeitos', Icon: Sparkles },
];

export function EditorPropertiesPanel({ selectedElement = null, className = '' }) {
  const [openId, setOpenId] = useState('layout');

  return (
    <aside
      className={`w-64 xl:w-72 shrink-0 border-l border-zinc-800 bg-zinc-950 flex flex-col h-full min-h-0 overflow-y-auto custom-scrollbar ${className}`}
    >
      <div className="px-3 py-3 border-b border-zinc-800/80">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Propriedades
        </h2>
        {selectedElement?.tag ? (
          <p className="mt-1 font-mono text-[10px] text-zinc-400 truncate">
            {`<${selectedElement.tag}>`}
            {selectedElement.text ? ` “${String(selectedElement.text).slice(0, 24)}”` : ''}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-zinc-600 leading-snug">
            Em «Editar código», seleciona um elemento no preview para ver o contexto. Edição
            pixel-a-pixel tipo Figma não está disponível no iframe.
          </p>
        )}
      </div>
      <div className="flex-1">
        {STYLE_SECTIONS.map(({ id, label, Icon }) => {
          const open = openId === id;
          return (
            <div key={id} className="border-b border-zinc-800/60">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-900/80 transition-colors"
              >
                <Icon size={15} className="text-zinc-500 shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                <ChevronRight
                  size={14}
                  className={`text-zinc-500 transition-transform ${open ? 'rotate-90' : ''}`}
                />
              </button>
              {open && (
                <div className="px-3 pb-3 space-y-2 text-sm text-zinc-400">
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-500">Largura</span>
                    <input
                      readOnly
                      defaultValue="100%"
                      className="w-24 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-right text-zinc-400"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-500">Padding</span>
                    <input
                      readOnly
                      defaultValue="16px"
                      className="w-24 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-right text-zinc-400"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-500">Gap</span>
                    <input
                      readOnly
                      defaultValue="8px"
                      className="w-24 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-right text-zinc-400"
                    />
                  </label>
                  <p className="text-[10px] text-zinc-600 pt-1">
                    Placeholders — valores reais em breve.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/**
 * Shell estrutural do editor (navbar + 3 colunas).
 * Usado pelo Editor real; a rota demo redireciona para o dashboard.
 */
export default function EditorShell({
  header,
  left,
  center,
  right,
  showRight = true,
}) {
  return (
    <div className="gc-app-shell flex flex-col h-screen max-h-screen w-full overflow-hidden bg-zinc-950 text-zinc-300 font-sans selection:bg-indigo-500/30">
      {header}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {left}
        <div className="flex-1 min-w-0 min-h-0 flex overflow-hidden">{center}</div>
        {showRight ? right : null}
      </div>
    </div>
  );
}
