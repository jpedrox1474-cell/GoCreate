import React from 'react';
import { AlertTriangle, Wand2, Loader2 } from 'lucide-react';

/**
 * Catches React render crashes inside Sandpack so the host app never white-screens.
 */
export default class SandpackErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, fixing: false };
  }

  static getDerivedStateFromError(error) {
    return { error, fixing: false };
  }

  componentDidCatch(error) {
    console.error('[SandpackErrorBoundary]', error);
  }

  componentDidUpdate(prevProps) {
    // Generation finished → allow a fresh remount path without stuck "fixing" ghost.
    if (prevProps.isGenerating && !this.props.isGenerating && this.state.fixing) {
      this.setState({ fixing: false, error: null });
    }
  }

  reset = () => {
    this.setState({ error: null, fixing: false });
  };

  render() {
    const { error, fixing } = this.state;
    const isGenerating = Boolean(this.props.isGenerating);

    if ((fixing || isGenerating) && error) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center gap-3 bg-zinc-950/95 px-6 text-center border border-zinc-800/80 rounded-xl">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-blue-600/20 blur-md animate-pulse" />
            <Loader2 size={28} className="relative text-blue-500 animate-spin" />
          </div>
          <p className="text-sm font-medium text-zinc-100">A IA está a corrigir o código…</p>
          <p className="text-xs text-zinc-500">Mantém esta página aberta</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-1 h-1 rounded-full bg-blue-500 animate-bounce [animation-duration:0.7s]" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce [animation-duration:0.7s]" style={{ animationDelay: '140ms' }} />
            <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce [animation-duration:0.7s]" style={{ animationDelay: '280ms' }} />
          </div>
        </div>
      );
    }

    if (!error) return this.props.children;

    const message = error?.message || String(error);

    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 bg-zinc-950/95 px-6 text-center border border-zinc-800/80 rounded-xl">
        <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <AlertTriangle size={22} className="text-red-400" />
        </div>
        <div className="max-w-md space-y-2">
          <h3 className="text-sm font-semibold text-zinc-100">Erro no preview</h3>
          <p className="text-xs text-zinc-500 leading-relaxed font-mono break-words">
            {message}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={this.reset}
            className="px-3 py-2 text-xs font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg transition-all"
          >
            Tentar novamente
          </button>
          {typeof this.props.onAskFix === 'function' && (
            <button
              type="button"
              onClick={() => {
                this.setState({ fixing: true });
                this.props.onAskFix(message);
              }}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-md shadow-blue-900/20 transition-all"
            >
              <Wand2 size={14} />
              Pedir para a IA consertar
            </button>
          )}
        </div>
      </div>
    );
  }
}
