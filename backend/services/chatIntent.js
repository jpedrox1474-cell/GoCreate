/**
 * Detecta intenção do turno de chat e se o layout deve ficar bloqueado.
 * Usado em /api/chat para injectar regras no system prompt (sem alterar o runtime de merge).
 */

const PRESERVE_LAYOUT_RE =
  /\b(preserv(a|ar|e)|n[aã]o\s+(mex(a|er)|alter(a|ar)|mud(a|ar)|troqu(e|ar))|don'?t\s+change|keep\s+(the\s+)?(layout|design|ui)|layout\s*lock|manter\s+(o\s+)?(layout|design|visual)|sem\s+mudar\s+(o\s+)?(layout|design|ui)|n[aã]o\s+reescrev)/i;

const CHAT_ONLY_RE =
  /^(como|o\s+que|qual|quais|por\s+quê|porque|por\s+que|explique|explica|explica-me|me\s+explica|what|how|why|does|can\s+i|posso|é\s+poss[ií]vel|funciona|onde\s+(fica|est[aá])|diferen[cç]a)\b/i;

const CHAT_ONLY_PHRASE_RE =
  /\b(como\s+(funciona|é\s+que|trabalha)|o\s+que\s+(é|significa)|explique\s+(como|o)|sem\s+(gerar|alterar|mudar)\s+c[oó]digo|s[oó]\s+(uma\s+)?pergunt|apenas\s+(uma\s+)?pergunt|n[aã]o\s+(geres?|gere|alteres?|mudes?)\s+(c[oó]digo|o\s+app|a\s+app))\b/i;

const CODE_EDIT_RE =
  /\b(cria|criar|crie|gera|gerar|gere|faz|fazer|fa[cç]a|altera|alterar|muda|mudar|corrige|corrigir|adiciona|adicionar|remove|remover|implementa|implementar|liga|ligar|conecta|conectar|salva|salvar|guarde|guardar|wire|wiring|refatora|refatorar|atualiza|atualizar|fix|bot[aã]o|p[aá]gina|componente|layout|design|estilo|cor|css|tailwind)\b/i;

const DATA_BACKEND_ONLY_RE =
  /\b(salvar?\s+(no\s+|na\s+)?(banco|base|db|database|firestore)|guardar?\s+(no\s+|na\s+)?(banco|base|db)|go\s*create\s*data|gocreatedata|backend|entidade|entidades|persist(ir|ência)|crud|submit|onsubmit|formul[aá]rio\s+(salvar?|guardar?)|wire\s+(o\s+)?backend|ligar?\s+(ao\s+|o\s+)?backend|dados?\s+no\s+servidor)\b/i;

/**
 * @param {string} userText
 * @returns {boolean}
 */
export function detectPreserveLayoutIntent(userText) {
  return PRESERVE_LAYOUT_RE.test(String(userText || ''));
}

/**
 * @param {string} userText
 * @param {{ hasOrchestrateIntent?: boolean }} [opts]
 * @returns {'chat_only' | 'code_edit' | 'orchestrate'}
 */
export function detectChatTurnIntent(userText, { hasOrchestrateIntent = false } = {}) {
  const text = String(userText || '').trim();
  if (!text) return 'chat_only';
  if (hasOrchestrateIntent) return 'orchestrate';

  const lower = text.toLowerCase();
  const looksLikeQuestion =
    text.endsWith('?') || CHAT_ONLY_RE.test(text) || CHAT_ONLY_PHRASE_RE.test(lower);
  const wantsCode = CODE_EDIT_RE.test(lower) || DATA_BACKEND_ONLY_RE.test(lower);

  if (looksLikeQuestion && !wantsCode) return 'chat_only';
  if (wantsCode) return 'code_edit';
  if (looksLikeQuestion) return 'chat_only';
  return 'code_edit';
}

/**
 * Pedido focado em dados/backend sem pedir redesign de UI.
 * @param {string} userText
 */
export function detectDataBackendOnlyRequest(userText) {
  const text = String(userText || '');
  if (!DATA_BACKEND_ONLY_RE.test(text)) return false;
  // Pedido explícito de redesign visual → não forçar data-only
  if (
    /\b(muda|mudar|altera|alterar|redesenh|troca|trocar|cria|criar|gera|gerar)\b[\s\S]{0,40}\b(layout|design|cor|cores|estilo|ui|interface|apar[eê]ncia)\b/i.test(
      text
    )
  ) {
    return false;
  }
  return true;
}

/**
 * Bloco injectado no system prompt conforme intenção + layout lock.
 */
export function buildChatBehaviorAddon({
  intent = 'code_edit',
  layoutLock = false,
  dataBackendOnly = false,
} = {}) {
  const parts = [];

  parts.push(`## Modo deste turno
- intent detectado: **${intent}**
- layoutLock: **${layoutLock ? 'true' : 'false'}**
- data/backend only: **${dataBackendOnly ? 'true' : 'false'}**`);

  if (intent === 'chat_only') {
    parts.push(`### chat_only (OBRIGATÓRIO)
- Responde em português, de forma clara e conversacional (como Base44): explica, confirma entendimento, faz pergunta de esclarecimento se o pedido for ambíguo.
- NÃO emitas \`<gocreate_artifact>\`, \`<file>\` nem \`<gocreate_entities>\`.
- NÃO regenere o app. Só texto no chat.`);
  } else {
    parts.push(`### Comportamento conversacional (OBRIGATÓRIO)
- Antes do código: 1–3 frases a confirmar o plano (o que vais alterar e o que NÃO vais tocar).
- Se o pedido for ambíguo (entidade, campos, ou escopo), faz UMA pergunta curta no chat; só gera código se houver contexto suficiente ou o utilizador já tiver deixado claro.
- Preferência por **diffs mínimos**: altera só os ficheiros necessários ao pedido. Não reescrevas o projeto inteiro “por precaução”.
- Ao emitir \`<file>\`, o conteúdo tem de ser o ficheiro COMPLETO (o runtime faz replace por path) — mas **copia a estrutura/JSX/classes existentes** e muda só o necessário.`);
  }

  if (intent === 'code_edit' && dataBackendOnly) {
    parts.push(`### Pedido de dados / backend / GoCreateData (CRÍTICO)
- NÃO mudes layout, cores, estrutura visual, hierarquia de componentes, classes Tailwind, nem componentes não relacionados.
- Só toca na camada de dados: handlers de submit, calls a \`window.GoCreateData\`, entidades, loading/erro de persistência.
- Mantém o JSX/markup e o design exactamente como está; podes acrescentar handlers/imports mínimos.
- Se precisares de listar ficheiros: preferir o formulário / página que já existe + wiring — NÃO redesenhes a UI.`);
  }

  if (layoutLock) {
    parts.push(`### LAYOUT LOCK ATIVO (CRÍTICO — não ignores)
- O projeto tem "Preservar layout" / o utilizador pediu para não mudar o design.
- Só podes alterar a camada de dados: GoCreateData, entidades, handlers de formulário/submit, auth wiring mínimo.
- PROIBIDO: mudar layout, cores, tipografia, espaçamentos, classes Tailwind, estrutura JSX, rotas visuais, ou redesenhar componentes.
- Se o pedido pedir redesign visual, responde em texto que o layout lock está ativo e pede para desativar "Preservar layout" nas Configurações — sem emitir artifact de UI redesign.`);
  } else {
    parts.push(`### Regras anti-alucinação de layout
- Pedidos só de dados/backend/auth: NÃO alteres layout, cores, estrutura ou Tailwind não relacionado.
- Se o utilizador disser "preserva", "não mudes o design", "keep layout": trata como layout lock neste turno.`);
  }

  return `\n\n${parts.join('\n\n')}\n`;
}
