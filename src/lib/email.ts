import "server-only";
import { Resend } from "resend";

let client: Resend | null = null;

function ensureConfigured() {
  if (client) return client;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  client = new Resend(apiKey);
  return client;
}

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Sends an email with an optional attachment. Silently no-ops (logging a
 * warning) when RESEND_API_KEY isn't set, so the rest of the app keeps
 * working without email configured — see DEPLOY.md.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  attachment?: { filename: string; content: Buffer };
}) {
  const resend = ensureConfigured();
  if (!resend) {
    console.warn(`RESEND_API_KEY is not set — skipped sending email to ${params.to}: ${params.subject}`);
    return { sent: false as const };
  }

  const from = process.env.EMAIL_FROM || "Baza ERP <onboarding@resend.dev>";

  const { error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    attachments: params.attachment
      ? [{ filename: params.attachment.filename, content: params.attachment.content }]
      : undefined,
  });

  if (error) {
    console.error("Failed to send email:", error);
    return { sent: false as const, error };
  }
  return { sent: true as const };
}
