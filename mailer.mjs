import nodemailer from "nodemailer";

const smtpEnabled = String(process.env.SMTP_ENABLED || "true").trim().toLowerCase() !== "false";
const smtpHost = String(process.env.SMTP_HOST || "").trim();
const smtpPort = Math.max(1, Number(process.env.SMTP_PORT || 587));
const smtpSecure = String(process.env.SMTP_SECURE || (smtpPort === 465 ? "true" : "false")).trim().toLowerCase() === "true";
const smtpUser = String(process.env.SMTP_USER || "").trim();
const smtpPass = String(process.env.SMTP_PASS || "");
const smtpFrom = String(process.env.SMTP_FROM || "").trim();
const smtpReplyTo = String(process.env.SMTP_REPLY_TO || "").trim();
const smtpTimeoutMs = Math.max(3_000, Number(process.env.SMTP_TIMEOUT_MS || 15_000));

let transporter;

function smtpConfigured() {
  return smtpEnabled && Boolean(smtpHost && smtpUser && smtpPass && smtpFrom);
}

function smtpNotConfiguredError() {
  const error = new Error("SMTP não está configurado. Defina SMTP_HOST, SMTP_USER, SMTP_PASS e SMTP_FROM.");
  error.code = "smtp-not-configured";
  return error;
}

function getTransporter() {
  if (!smtpConfigured()) throw smtpNotConfiguredError();
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPass },
      connectionTimeout: smtpTimeoutMs,
      greetingTimeout: smtpTimeoutMs,
      socketTimeout: smtpTimeoutMs,
      tls: { minVersion: "TLSv1.2" },
    });
  }
  return transporter;
}

export function smtpStatus() {
  return {
    enabled: smtpEnabled,
    configured: smtpConfigured(),
    host: smtpHost || null,
    port: smtpPort,
    secure: smtpSecure,
    from: smtpFrom || null,
    replyTo: smtpReplyTo || null,
  };
}

export async function verifySmtp() {
  const current = smtpStatus();
  if (!current.configured) return { ...current, verified: false, errorCode: "smtp-not-configured" };
  try {
    await getTransporter().verify();
    return { ...current, verified: true };
  } catch (error) {
    return { ...current, verified: false, errorCode: error?.code || "smtp-verify-failed", error: error?.message || String(error) };
  }
}

export async function sendEmail({ to, subject, text, html }) {
  const recipient = String(to || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    const error = new Error("Destinatário de e-mail inválido.");
    error.code = "invalid-email-recipient";
    throw error;
  }
  const cleanSubject = String(subject || "").trim().slice(0, 180);
  if (!cleanSubject) throw new Error("Assunto de e-mail vazio.");
  const cleanText = String(text || "").trim();
  const cleanHtml = html ? String(html) : undefined;
  if (!cleanText && !cleanHtml) throw new Error("Corpo de e-mail vazio.");
  const message = await getTransporter().sendMail({
    from: smtpFrom,
    to: recipient,
    replyTo: smtpReplyTo || undefined,
    subject: cleanSubject,
    text: cleanText || undefined,
    html: cleanHtml,
  });
  return { messageId: message.messageId, accepted: message.accepted, rejected: message.rejected };
}

export async function sendGroupInviteEmail({ to, displayName, groupName, baseUrl }) {
  const recipientName = String(displayName || "").trim() || "pessoa";
  const communityName = String(groupName || "um grupo").trim();
  const appUrl = String(baseUrl || "").trim().replace(/\/$/, "");
  const safeAppUrl = /^https?:\/\//i.test(appUrl) ? appUrl : "https://telai.tv.br";
  const text = `${recipientName}, você recebeu um convite para entrar no grupo "${communityName}" no Telai.\n\nAcesse ${safeAppUrl} para aceitar o convite.`;
  const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character]));
  const html = `<p>${escapeHtml(recipientName)},</p><p>Você recebeu um convite para entrar no grupo <strong>${escapeHtml(communityName)}</strong> no Telai.</p><p>Acesse o <a href="${escapeHtml(safeAppUrl)}">Telai</a> para aceitar o convite.</p>`;
  return sendEmail({ to, subject: `Convite para entrar no grupo ${communityName}`, text, html });
}

export function resetSmtpTransportForTests() {
  transporter = undefined;
}
