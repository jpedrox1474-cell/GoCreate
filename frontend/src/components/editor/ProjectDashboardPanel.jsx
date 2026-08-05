import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  LayoutDashboard,
  Users,
  Database,
  BarChart3,
  Megaphone,
  Globe,
  Puzzle,
  Shield,
  Code2,
  Bot,
  Workflow,
  ScrollText,
  BookOpen,
  Settings,
  Server,
  KeyRound,
  Crown,
  Copy,
  Check,
  Loader2,
  ImagePlus,
  ExternalLink,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useCredits } from '../../context/CreditsContext';
import { canUsePremium } from '../../lib/plans';
import { updateProjectSettings } from '../../lib/projects';
import { uploadFile } from '../../lib/uploadApi';
import { useAuth } from '../../context/AuthContext';
import EntitiesPanel from './EntitiesPanel';
import DataApiPanel from './DataApiPanel';

const NAV = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'users', label: 'Usuários', icon: Users },
  { id: 'data', label: 'Dados', icon: Database },
  { id: 'analytics', label: 'Análises', icon: BarChart3, premium: true },
  { id: 'marketing', label: 'Marketing', icon: Megaphone, premium: true },
  { id: 'domains', label: 'Domínios', icon: Globe },
  { id: 'integrations', label: 'Integrações', icon: Puzzle },
  { id: 'security', label: 'Segurança', icon: Shield },
  { id: 'code', label: 'Código', icon: Code2 },
  { id: 'agents', label: 'Agentes', icon: Bot, badge: 'Novo' },
  { id: 'workflows', label: 'Fluxos de trabalho', icon: Workflow, badge: 'Novo', premium: true },
  { id: 'logs', label: 'Logs', icon: ScrollText },
  { id: 'api', label: 'API', icon: BookOpen },
  { id: 'settings', label: 'Configurações', icon: Settings },
  { id: 'mcp', label: 'MCP', icon: Server, premium: true },
  { id: 'secrets', label: 'Segredos', icon: KeyRound, premium: true },
];

function PremiumGate({ title, description, onPlans }) {
  return (
    <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto py-16 px-4">
      <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
        <Crown size={22} className="text-amber-400" />
      </div>
      <h3 className="text-lg font-semibold text-zinc-100 mb-2">{title}</h3>
      <p className="text-sm text-zinc-500 mb-5 leading-relaxed">{description}</p>
      <button
        type="button"
        onClick={onPlans}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-sm font-semibold transition-colors"
      >
        Ver planos
      </button>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, actionLabel, onAction, secondary }) {
  return (
    <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto py-14 px-4">
      <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-400">
        <Icon size={22} />
      </div>
      <h3 className="text-base font-semibold text-zinc-100 mb-2">{title}</h3>
      {description && <p className="text-sm text-zinc-500 mb-5 leading-relaxed">{description}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
        >
          {actionLabel}
        </button>
      )}
      {secondary}
    </div>
  );
}

/**
 * Painel do projeto estilo Base44 — mantém Dark Mode Premium do GoCreate.
 */
export default function ProjectDashboardPanel({
  projectId,
  projectMeta,
  files = {},
  backendEnabled = false,
  projectAuth = null,
  onOpenSettings,
  onOpenDeploy,
  onOpenCode,
  onToast,
  onProjectMetaPatch,
}) {
  void projectAuth;
  const { user } = useAuth();
  const { openPricing, plan, role } = useCredits();
  const [section, setSection] = useState('overview');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [hideBadgeBusy, setHideBadgeBusy] = useState(false);
  const logoInputRef = useRef(null);

  const premiumOk = canUsePremium({ plan, role, email: user?.email });
  const name = projectMeta?.name || 'Projeto';
  const description = projectMeta?.description || 'App criado no GoCreate.';
  const slug = projectMeta?.slug || projectId;
  const logoUrl = projectMeta?.thumbnailUrl || projectMeta?.thumbnail || null;
  const hideBadge = Boolean(projectMeta?.hideGoCreateBadge);
  const publishedUrl = projectMeta?.publishedUrl || (slug ? `https://gocreate-app.web.app/p/${slug}` : null);

  const nav = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return NAV;
    return NAV.filter((n) => n.label.toLowerCase().includes(q));
  }, [search]);

  async function handleLogoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !projectId || !user) return;
    if (!file.type.startsWith('image/')) {
      onToast?.({ message: 'Escolhe uma imagem para o logo.', type: 'error' });
      return;
    }
    setLogoBusy(true);
    try {
      const idToken = await user.getIdToken();
      const uploaded = await uploadFile({ file, idToken });
      const url = uploaded?.url || uploaded?.secure_url;
      if (!url) throw new Error('Upload sem URL');
      await updateProjectSettings(projectId, { thumbnailUrl: url });
      onProjectMetaPatch?.({ thumbnailUrl: url, thumbnail: url });
      onToast?.({ message: 'Logo do projeto atualizado.', type: 'success' });
    } catch (err) {
      console.error('[ProjectDashboard] logo:', err);
      onToast?.({ message: err?.message || 'Falha ao atualizar logo.', type: 'error' });
    } finally {
      setLogoBusy(false);
    }
  }

  async function toggleBadge() {
    if (!projectId) return;
    if (!hideBadge && !premiumOk) {
      openPricing('Ocultar o selo GoCreate está nos planos pagos.');
      return;
    }
    setHideBadgeBusy(true);
    try {
      const next = !hideBadge;
      await updateProjectSettings(projectId, { hideGoCreateBadge: next });
      onProjectMetaPatch?.({ hideGoCreateBadge: next });
      onToast?.({
        message: next ? 'Selo oculto (Premium).' : 'Selo GoCreate visível.',
        type: 'success',
      });
    } catch (err) {
      onToast?.({ message: err?.message || 'Não foi possível alterar o selo.', type: 'error' });
    } finally {
      setHideBadgeBusy(false);
    }
  }

  async function copyLink() {
    if (!publishedUrl) return;
    try {
      await navigator.clipboard.writeText(publishedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      onToast?.({ message: 'Não foi possível copiar o link.', type: 'error' });
    }
  }

  function renderSection() {
    const item = NAV.find((n) => n.id === section);
    if (item?.premium && !premiumOk) {
      return (
        <PremiumGate
          title={`${item.label} é Premium`}
          description="Disponível nos planos Pro e superiores. Compara os planos e faz upgrade."
          onPlans={() => openPricing()}
        />
      );
    }

    switch (section) {
      case 'overview':
        return (
          <div className="space-y-5 max-w-3xl">
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <button
                type="button"
                disabled={logoBusy}
                onClick={() => logoInputRef.current?.click()}
                className="relative group w-20 h-20 rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden shrink-0"
                title="Alterar logo do projeto"
              >
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xl font-bold text-zinc-400">
                    {String(name).slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  {logoBusy ? (
                    <Loader2 size={18} className="animate-spin text-white" />
                  ) : (
                    <ImagePlus size={18} className="text-white" />
                  )}
                </span>
              </button>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold text-zinc-100 truncate">{name}</h2>
                <p className="text-sm text-zinc-500 mt-1 leading-relaxed">{description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openPricing()}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-900"
                  >
                    Ganhar créditos
                  </button>
                  <Link
                    to="/plans"
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-900"
                  >
                    Ver uso / planos
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-xs font-medium text-zinc-400 mb-2">Visibilidade do aplicativo</p>
                <div className="flex items-center gap-2 text-sm text-zinc-200">
                  <Globe size={14} className="text-zinc-500" />
                  Público (link /p/{slug})
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-xs font-medium text-zinc-400 mb-2">Convidar usuários</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={copyLink}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-300 hover:text-white"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copiado' : 'Copiar link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenSettings?.()}
                    className="px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-300 hover:text-white"
                  >
                    Enviar convites
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:col-span-2">
                <p className="text-xs font-medium text-zinc-400 mb-2">Selo da plataforma</p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-zinc-300">
                    {hideBadge
                      ? 'O selo GoCreate está oculto.'
                      : 'O selo “Feito com GoCreate” aparece no site publicado.'}
                  </p>
                  <button
                    type="button"
                    disabled={hideBadgeBusy}
                    onClick={() => void toggleBadge()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-950 disabled:opacity-50"
                  >
                    {hideBadgeBusy ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : hideBadge ? (
                      <Eye size={12} />
                    ) : (
                      <EyeOff size={12} />
                    )}
                    {hideBadge ? 'Mostrar selo' : 'Ocultar selo'}
                    {!premiumOk && !hideBadge && <Crown size={11} className="text-amber-400" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      case 'users':
        return (
          <EmptyState
            icon={Users}
            title="Usuários do app"
            description="Gere autenticação no chat ou configure Auth nas definições do projeto. Convites e papéis ficam em Configurações."
            actionLabel="Abrir autenticação"
            onAction={() => onOpenSettings?.()}
          />
        );

      case 'data':
        return (
          <div className="h-full min-h-[420px] -m-1">
            <EntitiesPanel
              projectId={projectId}
              backendEnabled={backendEnabled}
              onRequestUi={null}
            />
          </div>
        );

      case 'domains':
        return (
          <div className="max-w-xl space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <p className="text-xs text-zinc-500 mb-1">URL gratuita</p>
              <p className="text-sm text-zinc-200 font-mono break-all">
                gocreate-app.web.app/p/{slug}
              </p>
              {publishedUrl && (
                <a
                  href={publishedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-xs text-blue-400 hover:text-blue-300"
                >
                  Abrir <ExternalLink size={11} />
                </a>
              )}
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <p className="text-sm font-medium text-zinc-100 mb-1">Domínios personalizados</p>
              <p className="text-sm text-zinc-500 mb-3">
                Liga o teu domínio (ex.: app.tuaempresa.com) nos planos pagos.
              </p>
              {premiumOk ? (
                <button
                  type="button"
                  onClick={() => onOpenSettings?.()}
                  className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white"
                >
                  Configurar domínio
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openPricing('Domínios personalizados estão nos planos pagos.')}
                  className="px-3 py-2 text-xs font-semibold rounded-lg bg-zinc-100 hover:bg-white text-zinc-950"
                >
                  Ver planos
                </button>
              )}
            </div>
          </div>
        );

      case 'integrations':
        return (
          <EmptyState
            icon={Puzzle}
            title="Integrações"
            description="Mercado Pago, WhatsApp, GitHub e redes sociais — liga no hub de integrações da conta."
            actionLabel="Abrir integrações"
            onAction={() => {
              window.location.href = '/integrations';
            }}
          />
        );

      case 'security':
        return (
          <EmptyState
            icon={Shield}
            title="Verifique a segurança do seu app"
            description="Revê permissões de Auth, backend e dados. Ativa Backend Functions para persistência segura."
            actionLabel="Abrir configurações de segurança"
            onAction={() => onOpenSettings?.()}
          />
        );

      case 'code':
        return (
          <EmptyState
            icon={Code2}
            title="Código do projeto"
            description="Vê e edita os ficheiros gerados na aba Código do workspace."
            actionLabel="Abrir código"
            onAction={() => onOpenCode?.()}
          />
        );

      case 'agents':
        return (
          <EmptyState
            icon={Bot}
            title="Agentes"
            description="Cria agentes que trabalham no teu app (automações com IA). Em breve — por agora usa o Assistente Auto no chat."
            actionLabel="Ver planos"
            onAction={() => openPricing()}
          />
        );

      case 'logs':
        return (
          <EmptyState
            icon={ScrollText}
            title="Logs"
            description="Histórico de deploys e execuções. Consulta o histórico no modal de Deploy."
            actionLabel="Abrir Deploy"
            onAction={() => onOpenDeploy?.()}
          />
        );

      case 'api':
        return (
          <div className="h-full min-h-[420px]">
            <DataApiPanel projectId={projectId} backendEnabled={backendEnabled} />
          </div>
        );

      case 'settings':
        return (
          <EmptyState
            icon={Settings}
            title="Configurações do projeto"
            description="Auth, Backend Functions, domínio, layout lock e colaboradores."
            actionLabel="Abrir configurações"
            onAction={() => onOpenSettings?.()}
          />
        );

      case 'mcp':
        return (
          <EmptyState
            icon={Server}
            title="MCP — acesso para assistentes de IA"
            description="Deixa assistentes de IA usarem o teu app via Model Context Protocol. Disponível em planos pagos."
            actionLabel="Ver planos"
            onAction={() => openPricing('MCP está nos planos pagos.')}
          />
        );

      default:
        return (
          <EmptyState
            icon={item?.icon || LayoutDashboard}
            title={item?.label || 'Secção'}
            description="Esta área estará disponível em breve no GoCreate."
            actionLabel="Ver planos"
            onAction={() => openPricing()}
          />
        );
    }
  }

  return (
    <div className="h-full min-h-0 flex bg-zinc-950 text-zinc-300 overflow-hidden rounded-xl border border-zinc-800">
      <aside className="w-[220px] shrink-0 border-r border-zinc-800 flex flex-col bg-zinc-950/80">
        <div className="p-3 border-b border-zinc-800">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar…"
              className="w-full pl-8 pr-2 py-2 text-xs rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2 px-2 custom-scrollbar space-y-0.5">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = section === n.id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setSection(n.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors ${
                  active
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <Icon size={14} className="shrink-0 opacity-80" />
                <span className="truncate flex-1">{n.label}</span>
                {n.badge && (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-300 border border-blue-500/30">
                    {n.badge}
                  </span>
                )}
                {n.premium && !premiumOk && <Crown size={11} className="text-amber-400/80 shrink-0" />}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-zinc-800">
          <Link
            to="/plans"
            className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-xs font-medium text-amber-200/90 bg-amber-950/30 border border-amber-800/40 hover:bg-amber-950/50"
          >
            <Crown size={13} />
            Atualizar plano
          </Link>
        </div>
      </aside>

      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-zinc-100">
            {NAV.find((n) => n.id === section)?.label || 'Painel'}
          </h1>
        </div>
        {renderSection()}
      </div>
    </div>
  );
}
