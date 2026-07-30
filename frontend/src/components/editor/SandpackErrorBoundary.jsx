import React from 'react';
import { AlertTriangle, Wand2 } from 'lucide-react';

/**
 * Catches React render crashes inside Sandpack so the host app never white-screens.
 */
export default class SandpackErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('[SandpackErrorBoundary]', error);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
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
                this.props.onAskFix(message);
                this.reset();
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
