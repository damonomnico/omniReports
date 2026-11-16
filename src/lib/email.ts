import "server-only";
import { emailConfigured } from "./env";

export type EmailAttachment = { filename: string; content: Buffer };

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
};

export type EmailResult =
  | { delivered: true }
  | { delivered: false; reason: "not_configured" | "failed"; error?: string };

/**
 * Sends through Resend when RESEND_API_KEY is set. Without a key nothing is
 * sent: the message is logged to the server console and the caller is told,
 * so the UI can fall back to showing a copyable link.
 */
export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  if (!emailConfigured()) {
    console.info(
      `[email not configured] To: ${[msg.to].flat().join(", ")} | ${msg.subject}\n${msg.text}`,
    );
    return { delivered: false, reason: "not_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "omniReports <onboarding@resend.dev>",
        to: [msg.to].flat(),
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        attachments: msg.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString("base64"),
        })),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend responded ${res.status}: ${body.slice(0, 500)}`);
      return { delivered: false, reason: "failed", error: `Resend ${res.status}` };
    }
    return { delivered: true };
  } catch (err) {
    console.error("[email] send failed", err);
    return { delivered: false, reason: "failed", error: String(err) };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Branded wrapper for transactional emails. All inputs are escaped. */
export function renderEmail(opts: {
  heading: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  footnote?: string;
}): { html: string; text: string } {
  const paragraphs = opts.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#33474e">${escapeHtml(p)}</p>`,
    )
    .join("");
  const button = opts.button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(opts.button.url)}" style="display:inline-block;background:#1e3a44;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px">${escapeHtml(opts.button.label)}</a></p>
       <p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#6b7c82;word-break:break-all">Or paste this link into your browser: ${escapeHtml(opts.button.url)}</p>`
    : "";
  const footnote = opts.footnote
    ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#6b7c82">${escapeHtml(opts.footnote)}</p>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;background:#f5f7f4;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f4;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e3e8e5">
<tr><td style="background:#0f2129;border-radius:12px 12px 0 0;padding:18px 28px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em">omni<span style="color:#bfff36">Reports</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0d1f26">${escapeHtml(opts.heading)}</h1>
${paragraphs}${button}${footnote}
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#8a999e">Sent by omniReports, the reporting platform from omniSEO.</p>
</td></tr></table></body></html>`;

  const text = [
    opts.heading,
    "",
    ...opts.paragraphs,
    ...(opts.button ? ["", `${opts.button.label}: ${opts.button.url}`] : []),
    ...(opts.footnote ? ["", opts.footnote] : []),
  ].join("\n");

  return { html, text };
}
