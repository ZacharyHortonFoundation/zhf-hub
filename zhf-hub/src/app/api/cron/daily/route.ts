import { NextResponse, type NextRequest } from "next/server";
import { addDays, endOfDay, format, startOfDay, subDays } from "date-fns";
import { db } from "@/lib/db";
import { sendTemplate } from "@/lib/email";
import { appUrl } from "@/lib/payments";
import { fmtRange } from "@/lib/utils";

/**
 * Daily automation (replaces AHA's scheduled reminder workflows).
 * Schedule once a day, e.g. Vercel Cron: { "path": "/api/cron/daily", "schedule": "0 15 * * *" }
 * Auth: Authorization: Bearer $CRON_SECRET
 *
 * - Event reminders 7 days and 1 day before; follow-up the day after
 * - Volunteer shift reminders 3 days and 1 day before; follow-up the day after
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });

  const today = startOfDay(new Date());
  const day = (offset: number) => ({ gte: startOfDay(addDays(today, offset)), lte: endOfDay(addDays(today, offset)) });
  const sent: Record<string, number> = {};
  const bump = (k: string) => (sent[k] = (sent[k] ?? 0) + 1);

  // ── Events ──
  const eventJobs: [string, { gte: Date; lte: Date }][] = [
    ["event.reminder_1", day(7)],
    ["event.reminder_2", day(1)],
    ["event.follow_up", { gte: startOfDay(subDays(today, 1)), lte: endOfDay(subDays(today, 1)) }],
  ];
  for (const [key, range] of eventJobs) {
    const orders = await db.eventOrder.findMany({
      where: { status: "PAID", event: { startAt: range, status: "PUBLISHED" } },
      include: { event: true, contact: true, _count: { select: { attendees: true } } },
    });
    for (const o of orders) {
      if (!o.contact.email || o.contact.doNotEmail) continue;
      await sendTemplate({
        templateKey: key,
        to: o.contact.email,
        toName: `${o.contact.firstName} ${o.contact.lastName}`,
        contactId: o.contactId,
        vars: {
          first_name: o.contact.firstName,
          event_title: o.event.title,
          event_date: fmtRange(o.event.startAt, o.event.endAt),
          event_location: [o.event.venueName, o.event.address, o.event.city].filter(Boolean).join(", "),
          tickets_url: `${appUrl()}/events/order/${o.id}`,
          ticket_count: o._count.attendees,
        },
      });
      bump(key);
    }
  }

  // ── Volunteer shifts ──
  const shiftJobs: [string, { gte: Date; lte: Date }, string][] = [
    ["volunteer.reminder_1", day(3), "REGISTERED"],
    ["volunteer.reminder_2", day(1), "REGISTERED"],
    ["volunteer.follow_up", { gte: startOfDay(subDays(today, 1)), lte: endOfDay(subDays(today, 1)) }, "ATTENDED|REGISTERED"],
  ];
  for (const [key, range, statuses] of shiftJobs) {
    const regs = await db.registration.findMany({
      where: { status: { in: statuses.split("|") }, shift: { startAt: range } },
      include: { contact: true, shift: { include: { opportunity: true } } },
    });
    for (const r of regs) {
      if (!r.contact.email || r.contact.doNotEmail) continue;
      const o = r.shift.opportunity;
      await sendTemplate({
        templateKey: key,
        to: r.contact.email,
        toName: `${r.contact.firstName} ${r.contact.lastName}`,
        contactId: r.contactId,
        vars: {
          first_name: r.contact.firstName,
          opportunity_title: o.title,
          shift_date: format(r.shift.startAt, "EEE, MMM d, yyyy"),
          shift_time: `${format(r.shift.startAt, "h:mm a")} – ${format(r.shift.endAt, "h:mm a")}`,
          location: [o.location, o.address, o.city].filter(Boolean).join(", "),
          portal_url: `${appUrl()}/volunteer/portal`,
        },
      });
      bump(key);
    }
  }

  return NextResponse.json({ ok: true, sent });
}
