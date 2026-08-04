import React from 'react';
import { Monitor, Code, Layout, Smartphone, Database, ExternalLink } from 'lucide-react';
import PreviewPane from './PreviewPane';
import CodeEditor from './CodeEditor';
import EntitiesPanel from './EntitiesPanel';

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
}) {
  function openPreviewTab() {
    if (!projectId) return;
    window.open(`/p/${projectId}/preview`, '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="flex-1 flex flex-col bg-zinc-950 min-w-0 min-h-0 h-full overflow-hidden">
      <div className="flex flex-wrap items-center justify-between px-3 py-2 border-b border-zinc-800 gap-2 shrink-0">
        <div className="flex p-0.5 bg-zinc-900 rounded-lg border border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === 'preview'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Monitor size={14} />
            Live Preview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === 'code'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Code size={14} />
            Código
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('entities')}
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

        {activeTab === 'preview' && (
          <div className="hidden sm:flex items-center gap-1 bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
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
        {activeTab === 'preview' ? (
          <div
            className={`h-full min-h-0 transition-all duration-500 ${
              previewMode === 'mobile'
                ? 'w-[375px] max-h-[812px] self-center rounded-[2rem] overflow-hidden border-8 border-zinc-900 ring-1 ring-zinc-700'
                : 'w-full'
            }`}
          >
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
        ) : (
          <div className="w-full h-full min-h-0 overflow-hidden">
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
          </div>
        )}
      </div>
    </section>
  );
}
