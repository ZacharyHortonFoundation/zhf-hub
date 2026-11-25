import { db } from "./db";
import { getSettings } from "./settings";

/**
 * Email delivery.
 * - Templates live in the EmailTemplate table (editable in Admin → Communications).
 * - Bodies are plain text with {{merge_fields}}; we wrap them in a branded HTML shell.
 * - If RESEND_API_KEY is set we send through Resend's REST API, otherwise the
 *   message is written to the Outbox (EmailLog) with status LOGGED so staff can
 *   preview exactly what would have gone out.
 */

export type MergeVars = Record<string, string | number | null | undefined>;

export function render(text: string, vars: MergeVars) {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, k: string) => {
    const v = vars[k];
    return v === null || v === undefined ? "" : String(v);
  });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function toHtml(body: string, orgName: string, footer: string) {
  const paragraphs = escapeHtml(body)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${p.replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#4e7599">$1</a>')}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#fbf9f5;font-family:Poppins,Segoe UI,Arial,sans-serif;color:#1d1c1c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #eee6d8">
<tr><td style="background:#ffffff;padding:24px 32px 20px;border-bottom:3px solid #33506b"><img src="${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/brand/zhf-logo.png" alt="${escapeHtml(orgName)}" width="180" height="62" style="display:block;border:0;height:auto;max-width:180px"></td></tr>
<tr><td style="padding:32px;font-size:15px">${paragraphs}</td></tr>
<tr><td style="padding:20px 32px;background:#f4efe6;color:#5b6472;font-size:12px;line-height:1.5">${escapeHtml(footer)}</td></tr>
</table></td></tr></table></body></html>`;
}

type SendArgs = {
  templateKey: string;
  to: string | null | undefined;
  toName?: string | null;
  contactId?: string | null;
  vars: MergeVars;
};

export async function sendTemplate({ templateKey, to, toName, contactId, vars }: SendArgs) {
  if (!to) return { status: "SKIPPED" as const };
  const tpl = await db.emailTemplate.findUnique({ where: { key: templateKey } });
  if (!tpl || !tpl.enabled) return { status: "SKIPPED" as const };

  const settings = await getSettings();
  const allVars: MergeVars = {
    org_name: settings.orgName,
    org_phone: settings.phone,
    org_email: settings.email,
    org_address: settings.address,
    org_ein: settings.ein,
    app_url: process.env.APP_URL ?? "http://localhost:3000",
    ...vars,
  };
  const subject = render(tpl.subject, allVars);
  const body = render(tpl.body, allVars);
  return deliver({ to, toName, subject, body, templateKey, contactId, footer: settings.receiptFooter, orgName: settings.orgName });
}

export async function deliver(args: {
  to: string;
  toName?: string | null;
  subject: string;
  body: string;
  templateKey?: string | null;
  contactId?: string | null;
  footer?: string;
  orgName?: string;
}) {
  const settings = args.footer && args.orgName ? null : await getSettings();
  const orgName = args.orgName ?? settings!.orgName;
  const footer = args.footer ?? settings!.receiptFooter;
  const key = process.env.RESEND_API_KEY;
  let status: "SENT" | "LOGGED" | "FAILED" = "LOGGED";
  let error: string | null = null;

  if (key) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM ?? `${orgName} <onboarding@resend.dev>`,
          to: [args.toName ? `${args.toName} <${args.to}>` : args.to],
          subject: args.subject,
          text: args.body,
          html: toHtml(args.body, orgName, footer),
        }),
      });
      if (res.ok) status = "SENT";
      else {
        status = "FAILED";
        error = `${res.status} ${(await res.text()).slice(0, 300)}`;
      }
    } catch (e) {
      status = "FAILED";
      error = e instanceof Error ? e.message : String(e);
    }
  }

  await db.emailLog.create({
    data: {
      templateKey: args.templateKey ?? null,
      toEmail: args.to,
      toName: args.toName ?? null,
      subject: args.subject,
      body: args.body,
      status,
      error,
      contactId: args.contactId ?? null,
    },
  });
  return { status };
}

/** Merge fields available per template category — shown in the template editor. */
export const MERGE_FIELDS: Record<string, string[]> = {
  Common: ["first_name", "last_name", "org_name", "org_phone", "org_email", "org_address", "app_url"],
  Donations: ["amount", "total", "fee_covered", "frequency", "receipt_number", "date", "campaign", "fund", "dedication", "payment_method", "org_ein"],
  Events: ["event_title", "event_date", "event_location", "order_number", "ticket_count", "total", "tickets_url"],
  Volunteers: ["opportunity_title", "shift_date", "shift_time", "location", "hours", "portal_url", "review_notes"],
  Account: ["portal_url"],
};
