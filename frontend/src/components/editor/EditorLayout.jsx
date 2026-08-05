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
  Layers,
  Component,
  MessageSquare,
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Send,
  Hexagon,
} from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*  Top Navbar                                                                */
/* -------------------------------------------------------------------------- */

function TopNavbar({ viewMode, setViewMode }) {
  const modes = [
    { id: 'preview', label: 'Pré-visualização', Icon: Monitor },
    { id: 'panel', label: 'Painel', Icon: LayoutDashboard },
    { id: 'edit', label: 'Editar', Icon: Pencil },
  ];

  return (
    <header className="h-14 shrink-0 border-b border-slate-200 bg-white flex items-center justify-between px-4 gap-4">
      {/* Left — logo + project */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
            <Hexagon size={18} strokeWidth={2.2} />
          </div>
          <span className="text-sm font-semibold text-slate-800 hidden sm:inline">GoCreate</span>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 max-w-[180px] rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <span className="truncate">JP Master</span>
          <ChevronDown size={14} className="text-slate-400 shrink-0" />
        </button>
      </div>

      {/* Center — pill toggle */}
      <div className="flex items-center justify-center shrink-0">
        <div className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 p-1">
          {modes.map(({ id, label, Icon }) => {
            const active = viewMode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setViewMode(id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon size={14} />
                <span className="hidden md:inline">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right — bell, avatar, publish */}
      <div className="flex items-center justify-end gap-2 flex-1">
        <button
          type="button"
          className="p-2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          aria-label="Notificações"
        >
          <Bell size={18} />
        </button>
        <div
          className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-300 to-slate-500 shrink-0 ring-2 ring-white"
          title="Avatar"
        />
        <button
          type="button"
          className="ml-1 inline-flex items-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-3.5 py-1.5 transition-colors"
        >
          Publicar
        </button>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Left Sidebar — Chat IA                                                    */
/* -------------------------------------------------------------------------- */

const MOCK_MESSAGES = [
  {
    id: 1,
    role: 'ai',
    text: 'Olá! Posso ajudar a criar páginas, formulários e painéis. O que queres construir?',
  },
  {
    id: 2,
    role: 'user',
    text: 'Quero uma landing page moderna para o JP Master.',
  },
  {
    id: 3,
    role: 'ai',
    text: 'Perfeito. Vou esboçar uma hero com headline, CTA e secção de benefícios. Diz se preferes tons frios ou quentes.',
  },
];

const SUGGESTION_CHIPS = [
  '+ Criar formulário',
  '+ Adicionar painel',
  '+ Mudar cores',
];

function LeftSidebar({ sideTab, setSideTab }) {
  const tabs = [
    { id: 'pages', label: 'Páginas', Icon: Layers },
    { id: 'components', label: 'Componentes', Icon: Component },
    { id: 'chat', label: 'Chat IA', Icon: MessageSquare },
  ];

  return (
    <aside className="w-80 shrink-0 border-r border-slate-200 bg-white flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 px-2 pt-2 pb-0 border-b border-slate-100">
        {tabs.map(({ id, label, Icon }) => {
          const active = sideTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSideTab(id)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                active
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {sideTab === 'chat' &&
          MOCK_MESSAGES.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-slate-100 text-slate-700 rounded-tl-sm'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        {sideTab === 'pages' && (
          <p className="text-sm text-slate-500 px-1">Lista de páginas (mock).</p>
        )}
        {sideTab === 'components' && (
          <p className="text-sm text-slate-500 px-1">Biblioteca de componentes (mock).</p>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-100 p-3 space-y-2 bg-white">
        <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
          <textarea
            rows={2}
            placeholder="O que você gostaria de criar?"
            className="flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder:text-slate-400 outline-none"
            readOnly
            defaultValue=""
          />
          <button
            type="button"
            className="shrink-0 p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            aria-label="Enviar"
          >
            <Send size={14} />
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="shrink-0 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors whitespace-nowrap"
            >
              <Plus size={12} className="text-slate-400" />
              {chip.replace(/^\+\s*/, '')}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/*  Center Canvas                                                             */
/* -------------------------------------------------------------------------- */

function CenterCanvas() {
  return (
    <main className="flex-1 min-w-0 min-h-0 bg-slate-100 relative flex items-center justify-center p-6 overflow-hidden">
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-lg border border-slate-200 bg-white shadow-sm p-1">
        <button
          type="button"
          className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100"
          title="Zoom out"
          aria-label="Diminuir zoom"
        >
          <ZoomOut size={16} />
        </button>
        <button
          type="button"
          className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100"
          title="Zoom in"
          aria-label="Aumentar zoom"
        >
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100"
          title="Ajustar à tela"
        >
          <Maximize2 size={14} />
          <span className="hidden sm:inline">Ajustar à tela</span>
        </button>
      </div>

      <div className="w-[80%] h-[85%] max-w-5xl bg-white shadow-lg rounded-sm border border-slate-200/80 overflow-hidden flex flex-col">
        <div className="h-9 shrink-0 border-b border-slate-100 bg-slate-50 flex items-center px-3 gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
          <span className="ml-3 text-[11px] text-slate-400 truncate">jp-master.app / home</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
            <LayoutTemplate size={28} className="text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-700">Canvas do site</p>
          <p className="text-xs text-slate-400 max-w-xs">
            Pré-visualização estrutural — sem dados ligados. O frame ocupa ~80% da área central.
          </p>
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Right Sidebar — style accordion                                           */
/* -------------------------------------------------------------------------- */

const STYLE_SECTIONS = [
  { id: 'layout', label: 'Layout', Icon: LayoutTemplate },
  { id: 'typography', label: 'Tipografia', Icon: Type },
  { id: 'colors', label: 'Cores', Icon: Palette },
  { id: 'borders', label: 'Bordas', Icon: Square },
  { id: 'effects', label: 'Efeitos', Icon: Sparkles },
];

function RightSidebar() {
  const [openId, setOpenId] = useState('layout');

  return (
    <aside className="w-72 shrink-0 border-l border-slate-200 bg-white flex flex-col h-full min-h-0 overflow-y-auto">
      <div className="px-3 py-3 border-b border-slate-100">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Propriedades
        </h2>
      </div>
      <div className="flex-1">
        {STYLE_SECTIONS.map(({ id, label, Icon }) => {
          const open = openId === id;
          return (
            <div key={id} className="border-b border-slate-100">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors"
              >
                <Icon size={15} className="text-slate-500 shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                <ChevronRight
                  size={14}
                  className={`text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
                />
              </button>
              {open && (
                <div className="px-3 pb-3 space-y-2 text-sm text-slate-600">
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">Largura</span>
                    <input
                      readOnly
                      defaultValue="100%"
                      className="w-24 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-right"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">Padding</span>
                    <input
                      readOnly
                      defaultValue="16px"
                      className="w-24 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-right"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">Gap</span>
                    <input
                      readOnly
                      defaultValue="8px"
                      className="w-24 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-right"
                    />
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/*  Root layout                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Esqueleto visual do editor (Webflow/Base44-like).
 * Sem lógica de DB — só estrutura UI para pré-visualização.
 *
 * Demo: /editor-layout-demo
 */
export default function EditorLayout() {
  const [viewMode, setViewMode] = useState('edit');
  const [sideTab, setSideTab] = useState('chat');

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-white text-slate-900">
      <TopNavbar viewMode={viewMode} setViewMode={setViewMode} />
      <div className="flex flex-1 min-h-0">
        <LeftSidebar sideTab={sideTab} setSideTab={setSideTab} />
        <CenterCanvas />
        <RightSidebar />
      </div>
    </div>
  );
}
