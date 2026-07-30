import React, { useState } from 'react';
import { Loader2, Eye, EyeOff, ExternalLink, Unplug } from 'lucide-react';
import ModalShell from '../editor/ModalShell';

/**
 * Modal para ligar integração por API key / Access Token.
 */
export default function ConnectIntegrationModal({
  open,
  onClose,
  integration,
  onConnect,
  onDisconnect,
  connected,
  connecting,
}) {
  const fields = integration?.fields || [];
  const [values, setValues] = useState({});
  const [showSecret, setShowSecret] = useState({});
  const [error, setError] = useState(null);

  React.useEffect(() => {
    if (open) {
      setValues({});
      setShowSecret({});
      setError(null);
    }
  }, [open, integration?.id]);

  if (!integration) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    for (const f of fields) {
      if (f.required && !String(values[f.key] || '').trim()) {
        setError(`${f.label} é obrigatório.`);
        return;
      }
    }
    try {
      await onConnect?.(values);
    } catch (err) {
      setError(err?.message || 'Falha ao ligar.');
    }
  }

  return (
    <ModalShell open={open} onClose={onClose} title={`Ligar ${integration.name}`} wide>
      <p className="text-xs text-zinc-500 mb-4 leading-relaxed">{integration.description}</p>

      {connected ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300">
            Integração ligada. As credenciais estão guardadas de forma segura no servidor.
          </div>
          {integration.docsUrl && (
            <a
              href={integration.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
            >
              Documentação <ExternalLink size={12} />
            </a>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Fechar
            </button>
            {integration.connectType !== 'platform' && (
              <button
                type="button"
                disabled={connecting}
                onClick={() => onDisconnect?.()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              >
                {connecting ? <Loader2 size={14} className="animate-spin" /> : <Unplug size={14} />}
                Desligar
              </button>
            )}
          </div>
        </div>
      ) : integration.connectType === 'oauth' ? (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Esta integração usa OAuth. Fecha este diálogo e clica em <strong className="text-zinc-200">Ligar</strong> no
            cartão para autorizar.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Fechar
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                {f.label}
                {f.required ? <span className="text-red-400"> *</span> : null}
              </label>
              <div className="relative">
                <input
                  type={f.secret && !showSecret[f.key] ? 'password' : 'text'}
                  value={values[f.key] || ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  autoComplete="off"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500/50 rounded-lg py-2.5 px-3.5 pr-10 text-sm text-zinc-200 outline-none transition-all"
                />
                {f.secret && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowSecret((s) => ({ ...s, [f.key]: !s[f.key] }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300"
                  >
                    {showSecret[f.key] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </div>
            </div>
          ))}

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {integration.docsUrl && (
            <a
              href={integration.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
            >
              Onde obter as chaves <ExternalLink size={12} />
            </a>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={connecting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
            >
              {connecting ? <Loader2 size={14} className="animate-spin" /> : null}
              Ligar
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}
