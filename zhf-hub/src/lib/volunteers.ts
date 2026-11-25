import { format, isSameDay } from "date-fns";
import { db } from "./db";
import { sendTemplate } from "./email";
import { awardHourBadges } from "./badges";
import { fullName, hoursBetween } from "./utils";
import type { Tone } from "@/components/ui";

/* ───────────────────────── Status helpers ───────────────────────── */

/** Registration statuses that occupy a spot on a shift. */
export const HOLDS_SPOT = ["REGISTERED", "ATTENDED"];

export type OppStatus = "OPEN" | "FEW" | "FULL" | "CLOSED" | "PAST" | "CANCELED" | "DRAFT";

export const OPP_STATUS_META: Record<OppStatus, { label: string; tone: Tone }> = {
  OPEN: { label: "Open", tone: "green" },
  FEW: { label: "Few spots left", tone: "amber" },
  FULL: { label: "Full", tone: "red" },
  CLOSED: { label: "Registration closed", tone: "gray" },
  PAST: { label: "Past", tone: "gray" },
  CANCELED: { label: "Canceled", tone: "gray" },
  DRAFT: { label: "Draft", tone: "gray" },
};

export const SETTING_LABEL: Record<string, string> = { INDOOR: "Indoor", OUTDOOR: "Outdoor", VIRTUAL: "Virtual" };

export const PROGRAM_COLORS: Record<string, string> = {
  blue: "bg-brand-50 text-brand-700",
  green: "bg-emerald-50 text-emerald-700",
  violet: "bg-violet-50 text-violet-700",
  amber: "bg-amber-50 text-amber-800",
  rose: "bg-rose-50 text-rose-700",
  teal: "bg-teal-50 text-teal-700",
  slate: "bg-slate-100 text-slate-700",
};

export const TIER_STYLES: Record<string, { ring: string; bg: string; text: string; label: string }> = {
  BRONZE: { ring: "ring-orange-200", bg: "bg-gradient-to-br from-orange-100 to-amber-200", text: "text-orange-900", label: "Bronze" },
  SILVER: { ring: "ring-slate-300", bg: "bg-gradient-to-br from-slate-100 to-slate-300", text: "text-slate-800", label: "Silver" },
  GOLD: { ring: "ring-amber-300", bg: "bg-gradient-to-br from-amber-100 to-yellow-300", text: "text-amber-900", label: "Gold" },
};

type ShiftLike = {
  id: string;
  startAt: Date;
  endAt: Date;
  capacity: number;
  registrations: { status: string }[];
};
type OppLike = {
  status: string;
  registrationCloseAt: Date | null;
  shifts: ShiftLike[];
};

export function shiftFilled(s: { registrations: { status: string }[] }) {
  return s.registrations.filter((r) => HOLDS_SPOT.includes(r.status)).length;
}

export type ShiftState = "OPEN" | "FULL" | "CLOSED" | "PAST";

export function shiftState(s: ShiftLike, closeAt: Date | null, now = new Date()): ShiftState {
  if (s.startAt <= now) return "PAST";
  if (closeAt && closeAt < now) return "CLOSED";
  if (shiftFilled(s) >= s.capacity) return "FULL";
  return "OPEN";
}

/** Roll an opportunity's shifts up into a single status + capacity summary. */
export function summarizeOpportunity(o: OppLike, now = new Date()) {
  const shifts = [...o.shifts].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const upcoming = shifts.filter((s) => s.startAt > now);
  const considered = upcoming.length ? upcoming : shifts;
  const capacity = considered.reduce((a, s) => a + s.capacity, 0);
  const filled = considered.reduce((a, s) => a + shiftFilled(s), 0);
  const remaining = Math.max(0, capacity - filled);
  const firstStart = shifts[0]?.startAt ?? null;
  const lastEnd = shifts.length ? shifts.reduce((m, s) => (s.endAt > m ? s.endAt : m), shifts[0]!.endAt) : null;
  const nextShift = upcoming[0] ?? null;

  let status: OppStatus;
  if (o.status === "DRAFT") status = "DRAFT";
  else if (o.status === "CANCELED") status = "CANCELED";
  else if (!upcoming.length) status = "PAST";
  else if (o.registrationCloseAt && o.registrationCloseAt < now) status = "CLOSED";
  else if (remaining <= 0) status = "FULL";
  else if (remaining <= Math.max(1, Math.floor(capacity * 0.2))) status = "FEW";
  else status = "OPEN";

  return { status, capacity, filled, remaining, firstStart, lastEnd, nextShift, shiftCount: shifts.length, upcomingCount: upcoming.length };
}

/** "Sat, Dec 5, 2026 · 9:00 AM – 3:00 PM" or "Jan 7 – Jan 28, 2027 · 4 shifts" */
export function opportunityWhen(shifts: { startAt: Date; endAt: Date }[]) {
  if (!shifts.length) return { date: "Dates to be announced", time: "" };
  const sorted = [...shifts].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const lastEnd = sorted.reduce((m, s) => (s.endAt > m ? s.endAt : m), first.endAt);
  if (isSameDay(first.startAt, lastEnd)) {
    return {
      date: format(first.startAt, "EEE, MMM d, yyyy"),
      time: `${format(first.startAt, "h:mm a")} – ${format(lastEnd, "h:mm a")}${sorted.length > 1 ? ` · ${sorted.length} shifts` : ""}`,
    };
  }
  return {
    date: `${format(first.startAt, "MMM d")} – ${format(last.startAt, "MMM d, yyyy")}`,
    time: `${sorted.length} shift${sorted.length === 1 ? "" : "s"} · ${format(first.startAt, "h:mm a")} start`,
  };
}

export function shiftTimeLabel(s: { startAt: Date; endAt: Date }) {
  return `${format(s.startAt, "h:mm a")} – ${format(s.endAt, "h:mm a")}`;
}

export function shiftHours(s: { startAt: Date; endAt: Date }) {
  return hoursBetween(s.startAt, s.endAt);
}

export function portalUrl() {
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/volunteer/portal`;
}

export function mapsUrl(parts: (string | null | undefined)[]) {
  const q = parts.filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Standard prisma include for computing opportunity status. */
export const shiftsWithSpots = {
  orderBy: { startAt: "asc" as const },
  include: { registrations: { where: { status: { not: "CANCELED" } }, select: { status: true, contactId: true } } },
};

/* ───────────────────────── Email vars ───────────────────────── */

function shiftVars(
  shift: { startAt: Date; endAt: Date },
  opp: { title: string; location: string | null; address: string | null; city: string | null },
) {
  return {
    opportunity_title: opp.title,
    shift_date: format(shift.startAt, "EEEE, MMMM d, yyyy"),
    shift_time: shiftTimeLabel(shift),
    location: [opp.location, opp.address, opp.city].filter(Boolean).join(", "),
    portal_url: portalUrl(),
  };
}

/* ───────────────────────── Registration ───────────────────────── */

/**
 * Register a volunteer for a shift. Returns an error message, or null on success.
 * `staffOverride` lets staff add people to full / closed shifts.
 */
export async function registerForShift(contactId: string, shiftId: string, opts: { staffOverride?: boolean } = {}) {
  const now = new Date();
  const shift = await db.shift.findUnique({
    where: { id: shiftId },
    include: { opportunity: true, registrations: { where: { status: { not: "CANCELED" } } } },
  });
  if (!shift) return "That shift no longer exists.";
  const existing = shift.registrations.find((r) => r.contactId === contactId);
  if (existing) return "You're already signed up for this shift.";
  if (!opts.staffOverride) {
    if (shift.opportunity.status !== "PUBLISHED") return "This opportunity isn't open for sign-ups.";
    if (shift.startAt <= now) return "This shift has already started.";
    if (shift.opportunity.registrationCloseAt && shift.opportunity.registrationCloseAt < now) return "Registration for this opportunity has closed.";
    if (shiftFilled(shift) >= shift.capacity) return "Sorry — this shift just filled up.";
  }
  await db.registration.upsert({
    where: { shiftId_contactId: { shiftId, contactId } },
    create: { shiftId, contactId, status: "REGISTERED" },
    update: { status: "REGISTERED", createdAt: now },
  });
  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (contact && !opts.staffOverride) {
    await sendTemplate({
      templateKey: "volunteer.registration_confirmed",
      to: contact.email,
      toName: fullName(contact),
      contactId,
      vars: { first_name: contact.firstName, last_name: contact.lastName, ...shiftVars(shift, shift.opportunity) },
    });
  }
  return null;
}

export async function cancelRegistration(contactId: string, shiftId: string, opts: { notify?: boolean } = {}) {
  const reg = await db.registration.findUnique({
    where: { shiftId_contactId: { shiftId, contactId } },
    include: { shift: { include: { opportunity: true } }, contact: true },
  });
  if (!reg || reg.status === "CANCELED") return "That registration was not found.";
  await db.registration.update({ where: { id: reg.id }, data: { status: "CANCELED" } });
  if (opts.notify !== false) {
    await sendTemplate({
      templateKey: "volunteer.registration_canceled",
      to: reg.contact.email,
      toName: fullName(reg.contact),
      contactId,
      vars: { first_name: reg.contact.firstName, last_name: reg.contact.lastName, ...shiftVars(reg.shift, reg.shift.opportunity) },
    });
  }
  return null;
}

/* ───────────────────────── Hours ───────────────────────── */

/** Send badge-awarded emails for newly earned badges. */
export async function notifyBadges(contactId: string, badgeNames: string[]) {
  if (!badgeNames.length) return;
  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact) return;
  for (const name of badgeNames) {
    await sendTemplate({
      templateKey: "volunteer.badge_awarded",
      to: contact.email,
      toName: fullName(contact),
      contactId,
      vars: { first_name: contact.firstName, last_name: contact.lastName, badge_name: name, portal_url: portalUrl() },
    });
  }
}

/** Approve hour entries; awards hour badges and emails the volunteer(s). Returns count approved. */
export async function approveHourEntries(ids: string[], reviewer: string) {
  const rows = await db.volunteerHour.findMany({ where: { id: { in: ids }, status: { not: "APPROVED" } }, include: { contact: true } });
  if (!rows.length) return 0;
  await db.volunteerHour.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { status: "APPROVED", reviewedBy: reviewer, reviewedAt: new Date() },
  });
  const byContact = new Map<string, { contact: (typeof rows)[number]["contact"]; hours: number }>();
  for (const r of rows) {
    const cur = byContact.get(r.contactId) ?? { contact: r.contact, hours: 0 };
    cur.hours += r.hours;
    byContact.set(r.contactId, cur);
  }
  for (const [contactId, { contact, hours }] of byContact) {
    await sendTemplate({
      templateKey: "volunteer.hours_approved",
      to: contact.email,
      toName: fullName(contact),
      contactId,
      vars: { first_name: contact.firstName, last_name: contact.lastName, hours: Math.round(hours * 100) / 100, portal_url: portalUrl() },
    });
    const awarded = await awardHourBadges(contactId);
    await notifyBadges(contactId, awarded);
  }
  return rows.length;
}

export async function rejectHourEntry(id: string, reviewer: string, note: string | null) {
  const row = await db.volunteerHour.findUnique({ where: { id }, include: { contact: true } });
  if (!row) return;
  await db.volunteerHour.update({ where: { id }, data: { status: "REJECTED", reviewedBy: reviewer, reviewedAt: new Date() } });
  await sendTemplate({
    templateKey: "volunteer.hours_rejected",
    to: row.contact.email,
    toName: fullName(row.contact),
    contactId: row.contactId,
    vars: { first_name: row.contact.firstName, last_name: row.contact.lastName, hours: row.hours, review_notes: note ?? "", portal_url: portalUrl() },
  });
}

/**
 * Create APPROVED hours for a staff entry (or attended shift) and award badges.
 * If a shift is given and hours already exist for that volunteer + shift, nothing is created.
 */
export async function createApprovedHours(args: {
  contactId: string;
  hours: number;
  date: Date;
  reviewer: string;
  shiftId?: string | null;
  opportunityId?: string | null;
  description?: string | null;
}) {
  if (args.shiftId) {
    const dup = await db.volunteerHour.findFirst({ where: { contactId: args.contactId, shiftId: args.shiftId, status: { not: "REJECTED" } } });
    if (dup) {
      if (dup.status === "PENDING") await approveHourEntries([dup.id], args.reviewer);
      return false;
    }
  }
  const row = await db.volunteerHour.create({
    data: {
      contactId: args.contactId,
      hours: args.hours,
      date: args.date,
      shiftId: args.shiftId ?? null,
      opportunityId: args.opportunityId ?? null,
      description: args.description ?? null,
      status: "PENDING",
    },
  });
  await approveHourEntries([row.id], args.reviewer);
  return true;
}

/* ───────────────────────── Stats ───────────────────────── */

export async function hoursSince(since: Date, contactId?: string) {
  const agg = await db.volunteerHour.aggregate({
    where: { status: "APPROVED", date: { gte: since }, ...(contactId ? { contactId } : {}) },
    _sum: { hours: true },
  });
  return Math.round((agg._sum.hours ?? 0) * 10) / 10;
}

export function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1);
}

export function fmtHours(h: number) {
  const r = Math.round(h * 10) / 10;
  return `${r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)} hr${r === 1 ? "" : "s"}`;
}
