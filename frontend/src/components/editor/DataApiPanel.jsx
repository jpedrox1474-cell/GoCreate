import React, { useCallback, useEffect, useState } from 'react';
import { Key, BookOpen, Copy, Check, Loader2, Trash2, Plus, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  fetchOpenApiSpec,
  ACCESS_OPTIONS,
  openApiDocsUrl,
} from '../../lib/dataApi';

/**
 * API keys + OpenAPI docs + entity permission hints for a project.
 */
export default function DataApiPanel({ projectId, backendEnabled = false, entities = [], onPermissionsSaved }) {
  const { user } = useAuth();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [plainKey, setPlainKey] = useState(null);
  const [copied, setCopied] = useState(false);
  const [spec, setSpec] = useState(null);
  const [notice, setNotice] = useState(null);
  const [permDrafts, setPermDrafts] = useState({});

  const refresh = useCallback(async () => {
    if (!projectId || !user) return;
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const list = await listApiKeys({ idToken, projectId });
      setKeys(list);
      try {
        const oa = await fetchOpenApiSpec(projectId);
        setSpec(oa);
      } catch {
        setSpec(null);
      }
    } catch (err) {
      setNotice({ message: err?.message || 'Falha ao carregar Data API.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [projectId, user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const next = {};
    for (const e of entities || []) {
      next[e.id] = {
        read: e.permissions?.read || 'public',
        write: e.permissions?.write || 'public',
      };
    }
    setPermDrafts(next);
  }, [entities]);

  async function handleCreate() {
    if (!user || !projectId || busy) return;
    setBusy('create');
    setNotice(null);
    try {
      const idToken = await user.getIdToken();
      const created = await createApiKey({
        idToken,
        projectId,
        name: `Key ${keys.length + 1}`,
      });
      setPlainKey(created.key);
      setNotice({
        message: 'Key criada — copia agora; não será mostrada outra vez.',
        type: 'ok',
      });
      await refresh();
    } catch (err) {
      setNotice({ message: err?.message || 'Falha ao criar key.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke(keyId) {
    if (!user || !projectId || busy) return;
    if (!window.confirm('Revogar esta API key? Chamadas externas deixam de funcionar.')) return;
    setBusy(keyId);
    try {
      const idToken = await user.getIdToken();
      await revokeApiKey({ idToken, projectId, keyId });
      setNotice({ message: 'Key revogada.', type: 'ok' });
      await refresh();
    } catch (err) {
      setNotice({ message: err?.message || 'Falha ao revogar.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function savePermissions(entityId) {
    if (!user || !projectId || busy) return;
    const draft = permDrafts[entityId];
    if (!draft) return;
    setBusy(`perm-${entityId}`);
    try {
      const idToken = await user.getIdToken();
      const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const res = await fetch(
        `${API_URL}/api/projects/${encodeURIComponent(projectId)}/entities/${encodeURIComponent(entityId)}/permissions`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(draft),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao guardar.');
      setNotice({ message: `Permissões de ${entityId} guardadas.`, type: 'ok' });
      onPermissionsSaved?.();
    } catch (err) {
      setNotice({ message: err?.message || 'Falha ao guardar permissões.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  function copyText(text) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const exampleCurl = `curl -X POST https://gocreate-app.web.app/api/projects/${projectId || '{projectId}'}/data \\
  -H "Content-Type: application/json" \\
  -H "X-GoCreate-Key: gck_…" \\
  -d '{"action":"list","entity":"${entities[0]?.id || 'products'}"}'`;

  return (
    <div className="space-y-4 text-xs">
      {notice && (
        <div
          className={`px-2.5 py-1.5 rounded-md border ${
            notice.type === 'error'
              ? 'border-red-500/30 bg-red-950/40 text-red-200'
              : 'border-emerald-500/30 bg-emerald-950/30 text-emerald-200'
          }`}
        >
          {notice.message}
        </div>
      )}

      {!backendEnabled && (
        <p className="text-amber-200/80 text-[11px] px-2.5 py-2 rounded-md border border-amber-700/40 bg-amber-950/30">
          Ativa Backend Functions nas configurações do projeto para a Data API funcionar em runtime.
        </p>
      )}

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold text-zinc-200 uppercase tracking-wide flex items-center gap-1.5">
            <Key size={12} className="text-blue-400" /> API keys
          </h3>
          <button
            type="button"
            disabled={!!busy || !projectId}
            onClick={() => void handleCreate()}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
          >
            {busy === 'create' ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            Nova key
          </button>
        </div>
        {plainKey && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-zinc-950 border border-blue-500/30">
            <code className="flex-1 font-mono text-[10px] text-blue-300 truncate">{plainKey}</code>
            <button
              type="button"
              onClick={() => copyText(plainKey)}
              className="p-1 text-zinc-400 hover:text-white"
              title="Copiar"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
          </div>
        )}
        {loading ? (
          <p className="text-zinc-500 flex items-center gap-1">
            <Loader2 size={11} className="animate-spin" /> A carregar…
          </p>
        ) : !keys.length ? (
          <p className="text-zinc-500 text-[11px]">Nenhuma key ainda. Cria uma para chamadas externas.</p>
        ) : (
          <ul className="space-y-1">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border border-zinc-800/80"
              >
                <div className="min-w-0">
                  <p className="text-zinc-200 font-medium truncate">{k.name}</p>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    {k.prefix}… {k.revoked ? '· revogada' : ''}
                  </p>
                </div>
                {!k.revoked && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void handleRevoke(k.id)}
                    className="p-1 text-zinc-500 hover:text-red-400"
                    title="Revogar"
                  >
                    {busy === k.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
        <h3 className="text-[11px] font-semibold text-zinc-200 uppercase tracking-wide flex items-center gap-1.5">
          <Shield size={12} className="text-blue-400" /> Permissões por entidade
        </h3>
        <p className="text-[10px] text-zinc-500">
          público · autenticado/API key · só admin (dono do projeto)
        </p>
        {(entities || []).length === 0 ? (
          <p className="text-zinc-500 text-[11px]">Cria entidades primeiro.</p>
        ) : (
          <ul className="space-y-2">
            {entities.map((ent) => (
              <li key={ent.id} className="rounded-md border border-zinc-800/80 p-2 space-y-1.5">
                <p className="text-zinc-200 font-medium">{ent.name || ent.id}</p>
                <div className="flex flex-wrap gap-2 items-center">
                  <label className="text-[10px] text-zinc-500 flex items-center gap-1">
                    Ler
                    <select
                      value={permDrafts[ent.id]?.read || 'public'}
                      onChange={(e) =>
                        setPermDrafts((prev) => ({
                          ...prev,
                          [ent.id]: { ...prev[ent.id], read: e.target.value },
                        }))
                      }
                      className="bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-zinc-200"
                    >
                      {ACCESS_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[10px] text-zinc-500 flex items-center gap-1">
                    Escrever
                    <select
                      value={permDrafts[ent.id]?.write || 'public'}
                      onChange={(e) =>
                        setPermDrafts((prev) => ({
                          ...prev,
                          [ent.id]: { ...prev[ent.id], write: e.target.value },
                        }))
                      }
                      className="bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-zinc-200"
                    >
                      {ACCESS_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void savePermissions(ent.id)}
                    className="ml-auto px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {busy === `perm-${ent.id}` ? '…' : 'Guardar'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold text-zinc-200 uppercase tracking-wide flex items-center gap-1.5">
            <BookOpen size={12} className="text-blue-400" /> OpenAPI / exemplos
          </h3>
          {projectId && (
            <a
              href={openApiDocsUrl(projectId)}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-blue-400 hover:underline"
            >
              openapi.json
            </a>
          )}
        </div>
        <pre className="text-[10px] font-mono text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-md p-2 overflow-x-auto whitespace-pre-wrap">
          {exampleCurl}
        </pre>
        {spec?.['x-gocreate-entities'] && (
          <p className="text-[10px] text-zinc-500">
            {spec['x-gocreate-entities'].length} entidade(s) no spec · backend{' '}
            {spec['x-gocreate-backendEnabled'] ? 'ativo' : 'inativo'}
          </p>
        )}
      </section>
    </div>
  );
}
