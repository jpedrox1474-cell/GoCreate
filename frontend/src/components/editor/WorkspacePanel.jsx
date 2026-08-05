import React, { useCallback, useState } from 'react';
import {
  Monitor,
  Code,
  Layout,
  Smartphone,
  Database,
  ExternalLink,
  LayoutDashboard,
  MousePointer2,
} from 'lucide-react';
import PreviewPane from './PreviewPane';
import CodeEditor from './CodeEditor';
import EntitiesPanel from './EntitiesPanel';
import ProjectDashboardPanel from './ProjectDashboardPanel';

function guessFileForElement(files, element) {
  if (!files || !element) return null;
  const entries = Object.entries(files);
  if (!entries.length) return null;

  function fileCode(value) {
    if (typeof value === 'string') return value;
    if (value && typeof value.code === 'string') return value.code;
    return '';
  }

  const text = (element.text || '').trim();
  if (text.length >= 4) {
    const hit = entries.find(([, code]) => fileCode(code).includes(text.slice(0, 40)));
    if (hit) return hit[0];
  }

  for (const cls of element.classes || []) {
    if (cls.length < 4) continue;
    const hit = entries.find(([, code]) => fileCode(code).includes(cls));
    if (hit) return hit[0];
  }

  const preferred = entries.find(([path]) => /App\.(jsx|tsx|js|ts)$/i.test(path));
  return preferred?.[0] || entries[0]?.[0] || null;
}

export default function WorkspacePanel({
  activeTab,
  setActiveTab,
  previewMode,
  setPreviewMode,
  files,
  activeFile,
  setActiveFile,
  isGenerating,
  onAskFix,
  onContinue,
  generationIncomplete = false,
  entitiesOnly = false,
  onRequestUi = null,
  projectId = null,
  backendEnabled = false,
  projectAuth = null,
  authAccess = null,
  canEditCode = false,
  onChangeFile = null,
  onSaveFile = null,
  onRevertFile = null,
  codeBaselines = null,
  dirtyCodeFiles = null,
  diffBaselines = null,
  projectMeta = null,
  onOpenSettings = null,
  onOpenDeploy = null,
  onToast = null,
  onProjectMetaPatch = null,
}) {
  const [visualEditMode, setVisualEditMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState(null);

  function openPreviewTab() {
    if (!projectId) return;
    window.open(`/p/${projectId}/preview`, '_blank', 'noopener,noreferrer');
  }

  const showPreviewChrome = activeTab === 'preview' || activeTab === 'edit';

  const enterVisualEdit = useCallback(
    (next) => {
      const enabled = typeof next === 'boolean' ? next : !visualEditMode;
      setVisualEditMode(enabled);
      if (enabled) {
        setActiveTab('edit');
        if (!activeFile) {
          const first = Object.keys(files || {})[0];
          if (first) setActiveFile?.(first);
        }
      } else {
        setSelectedElement(null);
        if (activeTab === 'edit') setActiveTab('preview');
      }
    },
    [visualEditMode, setActiveTab, activeFile, files, setActiveFile, activeTab]
  );

  const handleElementSelect = useCallback(
    (payload) => {
      setSelectedElement(payload);
      if (!payload) return;
      const match = guessFileForElement(files, payload);
      if (match && typeof setActiveFile === 'function') setActiveFile(match);
    },
    [files, setActiveFile]
  );

  const codePane = (
    <CodeEditor
      files={files}
      activeFile={activeFile}
      onSelectFile={setActiveFile}
      canEdit={canEditCode}
      onChangeFile={onChangeFile}
      onSaveFile={onSaveFile}
      onRevertFile={onRevertFile}
      baselines={codeBaselines}
      dirtyFiles={dirtyCodeFiles}
      diffBaselines={diffBaselines}
    />
  );

  const previewPane = (
    <PreviewPane
      files={files}
      isGenerating={isGenerating}
      onAskFix={onAskFix}
      onContinue={onContinue}
      generationIncomplete={generationIncomplete}
      entitiesOnly={entitiesOnly}
      onRequestUi={onRequestUi}
      projectId={projectId}
      backendEnabled={backendEnabled}
      projectAuth={projectAuth}
      authAccess={authAccess}
      visualEditMode={visualEditMode}
      onToggleVisualEdit={enterVisualEdit}
      onElementSelect={handleElementSelect}
      selectedElement={selectedElement}
      onOpenSettings={onOpenSettings}
      onToast={onToast}
    />
  );

  return (
    <section className="flex-1 flex flex-col bg-zinc-950 min-w-0 min-h-0 h-full overflow-hidden">
      <div className="flex flex-wrap items-center justify-between px-3 py-2 border-b border-zinc-800 gap-2 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex p-0.5 bg-zinc-900 rounded-lg border border-zinc-800">
            <button
              type="button"
              onClick={() => {
                setVisualEditMode(false);
                setSelectedElement(null);
                setActiveTab('preview');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'preview' && !visualEditMode
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Monitor size={14} />
              Pré-visualização
            </button>
            <button
              type="button"
              onClick={() => {
                setVisualEditMode(false);
                setSelectedElement(null);
                setActiveTab('panel');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'panel'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <LayoutDashboard size={14} />
              Painel
            </button>
            <button
              type="button"
              onClick={() => {
                setVisualEditMode(false);
                setSelectedElement(null);
                setActiveTab('code');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'code' && !visualEditMode
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Code size={14} />
              Código
            </button>
            <button
              type="button"
              onClick={() => {
                setVisualEditMode(false);
                setSelectedElement(null);
                setActiveTab('entities');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'entities'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Database size={14} />
              Entidades
            </button>
          </div>

          {/* Primary Figma-style Edit control — not buried in tabs */}
          <button
            type="button"
            onClick={() => enterVisualEdit(!visualEditMode)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-all shadow-sm ${
              visualEditMode
                ? 'bg-blue-600 text-white border-blue-500 shadow-blue-900/40 ring-2 ring-blue-400/40'
                : 'bg-zinc-900 text-zinc-100 border-zinc-700 hover:border-blue-500/50 hover:text-white hover:bg-zinc-800'
            }`}
            title="Modo edição visual — seleciona elementos no preview"
            aria-pressed={visualEditMode}
          >
            <MousePointer2 size={14} />
            Editar
          </button>
        </div>

        {showPreviewChrome && (
          <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
            <button
              type="button"
              onClick={() => setPreviewMode('desktop')}
              className={`p-1.5 rounded-md transition-all ${
                previewMode === 'desktop' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Desktop"
            >
              <Layout size={14} />
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('mobile')}
              className={`p-1.5 rounded-md transition-all ${
                previewMode === 'mobile' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Mobile"
            >
              <Smartphone size={14} />
            </button>
            <button
              type="button"
              onClick={openPreviewTab}
              disabled={!projectId}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 transition-all disabled:opacity-40"
              title="Abrir preview numa nova aba"
            >
              <ExternalLink size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 p-2 sm:p-4 overflow-hidden flex justify-center items-stretch bg-zinc-950">
        {activeTab === 'panel' ? (
          <div className="w-full h-full min-h-0 overflow-hidden">
            <ProjectDashboardPanel
              projectId={projectId}
              projectMeta={projectMeta}
              files={files}
              backendEnabled={backendEnabled}
              projectAuth={projectAuth}
              onOpenSettings={onOpenSettings}
              onOpenDeploy={onOpenDeploy}
              onOpenCode={() => {
                setVisualEditMode(false);
                setActiveTab('code');
              }}
              onToast={onToast}
              onProjectMetaPatch={onProjectMetaPatch}
            />
          </div>
        ) : activeTab === 'entities' ? (
          <div className="w-full h-full min-h-0 overflow-hidden">
            <EntitiesPanel
              projectId={projectId}
              files={files}
              backendEnabled={backendEnabled}
            />
          </div>
        ) : visualEditMode || activeTab === 'edit' ? (
          <div
            className={`w-full h-full min-h-0 overflow-hidden grid gap-2 ${
              visualEditMode
                ? 'grid-cols-1 lg:grid-cols-2 ring-2 ring-blue-500/50 rounded-xl p-1 bg-blue-950/20'
                : 'grid-cols-1'
            }`}
          >
            <div className="min-h-0 min-w-0 overflow-hidden rounded-xl border border-zinc-800">
              {codePane}
            </div>
            {visualEditMode && (
              <div
                className={`min-h-0 min-w-0 overflow-hidden ${
                  previewMode === 'mobile'
                    ? 'flex justify-center items-start'
                    : ''
                }`}
              >
                <div
                  className={
                    previewMode === 'mobile'
                      ? 'w-[375px] max-h-full rounded-[2rem] overflow-hidden border-8 border-zinc-900 ring-1 ring-blue-500/40'
                      : 'w-full h-full'
                  }
                >
                  {previewPane}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'code' ? (
          <div className="w-full h-full min-h-0 overflow-hidden">{codePane}</div>
        ) : (
          <div
            className={`h-full min-h-0 transition-all duration-500 ${
              previewMode === 'mobile'
                ? 'w-[375px] max-h-[812px] self-center rounded-[2rem] overflow-hidden border-8 border-zinc-900 ring-1 ring-zinc-700'
                : 'w-full'
            }`}
          >
            {previewPane}
          </div>
        )}
      </div>
    </section>
  );
}
