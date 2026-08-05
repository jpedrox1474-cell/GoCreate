/**
 * E-mails transacionais GoCreate via Resend (SDK Node + REST).
 * Sem RESEND_API_KEY: não envia — só log claro (não inventar chaves).
 *
 * Colar a API key em backend/.env e functions/.env:
 *   RESEND_API_KEY=re_...
 *   RESEND_FROM=GoCreate <onboarding@resend.dev>
 * (domínio verificado no Resend para produção)
 */

import { Resend } from 'resend';

const LOG = '[resendMail]';

export function getResendApiKey() {
  return String(process.env.RESEND_API_KEY || '').trim();
}

export function getResendFrom() {
  return (
    String(process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL || '').trim() ||
    'GoCreate <onboarding@resend.dev>'
  );
}

export function isResendConfigured() {
  return Boolean(getResendApiKey());
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{ to: string|string[], subject: string, html?: string, text?: string }} opts
 * @returns {Promise<{ ok: boolean, skipped?: boolean, id?: string|null, error?: string }>}
 */
export async function sendEmail({ to, subject, html, text }) {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    console.warn(
      `${LOG} RESEND_API_KEY em falta — e-mail não enviado (subject="${subject}"). ` +
        `Cole a chave em backend/.env e functions/.env (https://resend.com/api-keys).`
    );
    return { ok: false, skipped: true, error: 'resend_not_configured' };
  }

  const recipients = (Array.isArray(to) ? to : [to])
    .map((e) => String(e || '').trim().toLowerCase())
    .filter((e) => e.includes('@'));
  if (!recipients.length) {
    return { ok: false, error: 'invalid_recipient' };
  }
  if (!subject || (!html && !text)) {
    return { ok: false, error: 'missing_content' };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: getResendFrom(),
      to: recipients,
      subject: String(subject),
      html: html || undefined,
      text: text || undefined,
    });
    if (error) {
      console.error(`${LOG} falha ao enviar:`, error);
      return {
        ok: false,
        error: error.message || String(error),
      };
    }
    return { ok: true, id: data?.id || null };
  } catch (err) {
    console.error(`${LOG} exceção:`, err?.message || err);
    return { ok: false, error: err?.message || 'send_failed' };
  }
}

function appBaseUrl() {
  return String(process.env.PUBLIC_APP_URL || 'https://gocreate-app.web.app').replace(
    /\/$/,
    ''
  );
}

/**
 * Convite de colaborador (editor/viewer).
 */
export async function sendCollaboratorInviteEmail({
  to,
  projectName,
  role,
  inviterEmail,
  projectId,
}) {
  const base = appBaseUrl();
  const name = projectName || 'um projeto';
  const roleLabel = role === 'viewer' ? 'visualizador' : 'editor';
  const link = `${base}/editor/${encodeURIComponent(projectId || '')}`;
  const subject = `Convite GoCreate — ${name}`;
  const text = [
    `Foste convidado(a) como ${roleLabel} para "${name}" no GoCreate.`,
    inviterEmail ? `Quem convidou: ${inviterEmail}` : null,
    `Abre o projeto: ${link}`,
  ]
    .filter(Boolean)
    .join('\n');
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#18181b">
      <p>Foste convidado(a) como <strong>${escapeHtml(roleLabel)}</strong> para
        <strong>${escapeHtml(name)}</strong> no GoCreate.</p>
      ${
        inviterEmail
          ? `<p style="color:#52525b">Quem convidou: ${escapeHtml(inviterEmail)}</p>`
          : ''
      }
      <p><a href="${escapeHtml(link)}" style="color:#2563eb">Abrir projeto</a></p>
    </div>
  `;
  return sendEmail({ to, subject, html, text });
}

/**
 * Recuperação de password — link gerado pelo Firebase Admin.
 */
export async function sendPasswordRecoveryEmail({ to, resetLink }) {
  const subject = 'Recuperar password — GoCreate';
  const text = `Clica neste link para redefinir a tua password GoCreate:\n\n${resetLink}\n\nSe não pediste isto, ignora este e-mail.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#18181b">
      <p>Recebemos um pedido para redefinir a tua password no GoCreate.</p>
      <p><a href="${escapeHtml(resetLink)}" style="color:#2563eb">Redefinir password</a></p>
      <p style="color:#52525b;font-size:14px">Se não pediste isto, podes ignorar este e-mail.</p>
    </div>
  `;
  return sendEmail({ to, subject, html, text });
}

/**
 * Aviso de deploy (preferência users.preferences.deployEmails).
 */
export async function sendDeployNotificationEmail({
  to,
  projectName,
  url,
  env,
}) {
  const name = projectName || 'Projeto';
  const envLabel = env === 'preview' ? 'preview' : 'produção';
  const subject = `Deploy GoCreate — ${name} (${envLabel})`;
  const text = [
    `O teu projeto "${name}" foi publicado (${envLabel}).`,
    url ? `URL: ${url}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#18181b">
      <p>O teu projeto <strong>${escapeHtml(name)}</strong> foi publicado
        (<strong>${escapeHtml(envLabel)}</strong>).</p>
      ${
        url
          ? `<p><a href="${escapeHtml(url)}" style="color:#2563eb">${escapeHtml(url)}</a></p>`
          : ''
      }
    </div>
  `;
  return sendEmail({ to, subject, html, text });
}

/**
 * Recibo após fulfill de billing (Pro / Turbo).
 */
export async function sendBillingReceiptEmail({
  to,
  productLabel,
  amount,
  credits,
  currency = 'BRL',
  transactionId,
  plan,
}) {
  const label = productLabel || plan || 'GoCreate';
  const amountStr =
    amount != null && amount !== ''
      ? `${currency === 'BRL' ? 'R$' : currency} ${Number(amount).toFixed(2)}`
      : null;
  const subject = `Recibo GoCreate — ${label}`;
  const text = [
    `Pagamento confirmado: ${label}.`,
    amountStr ? `Valor: ${amountStr}` : null,
    credits != null ? `Créditos: ${credits}` : null,
    transactionId ? `Transação: ${transactionId}` : null,
    'Obrigado por usares o GoCreate.',
  ]
    .filter(Boolean)
    .join('\n');
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#18181b">
      <p>Pagamento confirmado: <strong>${escapeHtml(label)}</strong>.</p>
      ${amountStr ? `<p>Valor: <strong>${escapeHtml(amountStr)}</strong></p>` : ''}
      ${credits != null ? `<p>Créditos: <strong>${escapeHtml(String(credits))}</strong></p>` : ''}
      ${
        transactionId
          ? `<p style="color:#52525b;font-size:14px">Transação: ${escapeHtml(String(transactionId))}</p>`
          : ''
      }
      <p>Obrigado por usares o GoCreate.</p>
    </div>
  `;
  return sendEmail({ to, subject, html, text });
}
