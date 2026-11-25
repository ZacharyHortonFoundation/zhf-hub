import { createHash } from "crypto";
import { db } from "./db";
import { signToken, verifyToken } from "./session";
import { sendTemplate } from "./email";
import { appUrl } from "./payments";

/**
 * Volunteer portal "set your password" links (new accounts for existing constituents,
 * migrated volunteers, and forgot-password). Links expire after 2 days and stop working
 * once the password changes (the token carries a fingerprint of the current hash).
 */
const fingerprint = (hash: string | null) => createHash("sha256").update(hash ?? "none").digest("hex").slice(0, 16);

export async function passwordLink(contactId: string) {
  const c = await db.contact.findUnique({ where: { id: contactId } });
  if (!c) return null;
  const token = await signToken({ t: "vol-pw", cid: c.id, fp: fingerprint(c.portalPasswordHash) }, 2);
  return `${appUrl()}/volunteer/reset/${token}`;
}

export async function sendPortalPasswordLink(contactId: string) {
  const c = await db.contact.findUnique({ where: { id: contactId } });
  const url = await passwordLink(contactId);
  if (!c?.email || !url) return;
  await sendTemplate({
    templateKey: "account.portal_invite",
    to: c.email,
    toName: `${c.firstName} ${c.lastName}`.trim(),
    contactId: c.id,
    vars: { first_name: c.firstName || "there", portal_url: url },
  });
}

export async function readPasswordToken(token: string) {
  const p = await verifyToken<{ t: string; cid: string; fp: string }>(token);
  if (!p || p.t !== "vol-pw") return null;
  const contact = await db.contact.findUnique({ where: { id: p.cid } });
  if (!contact || fingerprint(contact.portalPasswordHash) !== p.fp) return null;
  return { contact };
}
