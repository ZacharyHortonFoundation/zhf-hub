import { db } from "./db";
import { nextNumber } from "./counters";
import { recomputeContactGiving } from "./rollups";
import { sendTemplate } from "./email";
import { appUrl } from "./payments";
import { fmtRange, money } from "./utils";

/** How long an unpaid (PENDING) order holds its seats while the buyer is on Stripe Checkout. */
export const PENDING_HOLD_MINUTES = 30;

function holdCutoff() {
  return new Date(Date.now() - PENDING_HOLD_MINUTES * 60_000);
}

/** Orders that currently occupy capacity: PAID, plus PENDING ones created within the hold window. */
export function capacityOrderWhere() {
  return {
    OR: [{ status: "PAID" }, { status: "PENDING", createdAt: { gte: holdCutoff() } }],
  };
}

export function eventLocation(e: { venueName?: string | null; address?: string | null; city?: string | null }) {
  return [e.venueName, e.address, e.city].filter((x, i, arr) => x && arr.indexOf(x) === i).join(", ");
}

/**
 * Mark an event order as paid. Idempotent — calling it twice (e.g. Stripe webhook +
 * success redirect) only does the work once.
 * - creates the linked add-on Donation (if any) and refreshes the buyer's giving roll-ups
 * - increments the discount code usage
 * - emails the event.confirmation template with a link to the tickets page
 */
export async function markOrderPaid(orderId: string, opts: { stripeSessionId?: string; isTest?: boolean } = {}) {
  const order = await db.eventOrder.findUnique({
    where: { id: orderId },
    include: { event: true, contact: true, donation: true, _count: { select: { attendees: true } } },
  });
  if (!order) throw new Error(`Event order ${orderId} not found`);
  if (order.status === "PAID") return order;

  // Atomic state transition guards against concurrent webhook + redirect calls.
  const res = await db.eventOrder.updateMany({
    where: { id: orderId, status: { not: "PAID" } },
    data: {
      status: "PAID",
      ...(opts.stripeSessionId ? { stripeSessionId: opts.stripeSessionId } : {}),
      ...(opts.isTest !== undefined ? { isTest: opts.isTest } : {}),
    },
  });
  if (res.count === 0) return order;

  if (order.donationCents > 0 && !order.donation) {
    const [defaultCampaign, defaultFund] = await Promise.all([
      order.event.campaignId ? null : db.campaign.findFirst({ where: { isDefault: true } }),
      db.fund.findFirst({ where: { isDefault: true } }),
    ]);
    await db.donation.create({
      data: {
        number: await nextNumber("donation"),
        contactId: order.contactId,
        amountCents: order.donationCents,
        totalCents: order.donationCents,
        method: "CARD",
        source: "EVENT",
        status: "SUCCEEDED",
        eventOrderId: order.id,
        campaignId: order.event.campaignId ?? defaultCampaign?.id ?? null,
        fundId: defaultFund?.id ?? null,
        isTest: opts.isTest ?? order.isTest,
        stripeSessionId: null,
        receiptSentAt: new Date(),
        comments: `Add-on gift with ${order.event.title} order #${order.number}`,
      },
    });
    await recomputeContactGiving(order.contactId);
  }

  if (order.discountCodeId) {
    await db.discountCode.update({ where: { id: order.discountCodeId }, data: { timesUsed: { increment: 1 } } });
  }

  await sendTemplate({
    templateKey: "event.confirmation",
    to: order.contact.email,
    toName: `${order.contact.firstName} ${order.contact.lastName}`.trim(),
    contactId: order.contactId,
    vars: {
      first_name: order.contact.firstName,
      last_name: order.contact.lastName,
      event_title: order.event.title,
      event_date: fmtRange(order.event.startAt, order.event.endAt),
      event_location: eventLocation(order.event),
      order_number: order.number,
      ticket_count: order._count.attendees,
      total: money(order.totalCents, { decimals: true }),
      tickets_url: `${appUrl()}/events/order/${order.id}`,
    },
  });

  return db.eventOrder.findUnique({ where: { id: orderId } });
}

/** Headline numbers for one event. */
export async function eventStats(eventId: string) {
  const [sold, capacityUsed, checkedIn, revenue] = await Promise.all([
    db.attendee.count({ where: { eventId, order: { status: "PAID" } } }),
    db.attendee.count({ where: { eventId, order: { status: "PAID" }, ticketType: { countsTowardCapacity: true } } }),
    db.attendee.count({ where: { eventId, checkedInAt: { not: null }, order: { status: "PAID" } } }),
    db.eventOrder.aggregate({ where: { eventId, status: "PAID" }, _sum: { totalCents: true }, _count: true }),
  ]);
  return {
    sold,
    capacityUsed,
    checkedIn,
    revenueCents: revenue._sum.totalCents ?? 0,
    orders: revenue._count,
  };
}

/**
 * Live availability for the public registration form and the server-side checkout check.
 * Counts PAID orders plus PENDING orders still inside the checkout hold window.
 */
export async function eventAvailability(eventId: string) {
  const event = await db.event.findUnique({ where: { id: eventId }, include: { ticketTypes: true } });
  if (!event) return null;
  const rows = await db.attendee.groupBy({
    by: ["ticketTypeId"],
    where: { eventId, order: capacityOrderWhere() },
    _count: true,
  });
  const attendeesByType = new Map(rows.map((r) => [r.ticketTypeId, r._count]));
  let capacityUsed = 0;
  for (const tt of event.ticketTypes) if (tt.countsTowardCapacity) capacityUsed += attendeesByType.get(tt.id) ?? 0;
  const capacityRemaining = event.capacity == null ? null : Math.max(0, event.capacity - capacityUsed);

  const tickets = event.ticketTypes.map((tt) => {
    const per = Math.max(1, tt.attendeesPerTicket);
    const ticketsSold = Math.ceil((attendeesByType.get(tt.id) ?? 0) / per);
    const byQuantity = tt.quantity == null ? Infinity : Math.max(0, tt.quantity - ticketsSold);
    const byCapacity = !tt.countsTowardCapacity || capacityRemaining == null ? Infinity : Math.floor(capacityRemaining / per);
    const remaining = Math.min(byQuantity, byCapacity);
    return { id: tt.id, ticketsSold, remaining: Number.isFinite(remaining) ? remaining : null };
  });
  const soldOut =
    event.ticketTypes.filter((t) => t.active).length > 0 &&
    tickets.filter((t) => event.ticketTypes.find((x) => x.id === t.id)?.active).every((t) => t.remaining === 0);
  return { capacityUsed, capacityRemaining, tickets, soldOut };
}

export type RegistrationState = { open: true } | { open: false; reason: string };

export function registrationState(
  event: { status: string; startAt: Date; endAt: Date | null; registrationDeadline: Date | null },
  soldOut: boolean,
  now = new Date(),
): RegistrationState {
  if (event.status === "CANCELED") return { open: false, reason: "This event has been canceled." };
  if (event.status !== "PUBLISHED") return { open: false, reason: "Registration is not open yet." };
  if ((event.endAt ?? event.startAt) < now) return { open: false, reason: "This event has ended." };
  if (event.startAt < now) return { open: false, reason: "This event has already started." };
  if (event.registrationDeadline && event.registrationDeadline < now) return { open: false, reason: "Registration has closed." };
  if (soldOut) return { open: false, reason: "This event is sold out." };
  return { open: true };
}

/** "Free" / "From $25" summary for cards. */
export function priceSummary(tickets: { priceCents: number; active: boolean }[]) {
  const active = tickets.filter((t) => t.active);
  if (!active.length) return "Free";
  const paid = active.filter((t) => t.priceCents > 0).map((t) => t.priceCents);
  if (!paid.length) return "Free";
  const min = Math.min(...paid);
  return active.length > 1 || paid.length !== active.length ? `From ${money(min)}` : money(min);
}

/** Google Calendar "add event" link. */
export function googleCalendarUrl(e: { title: string; startAt: Date; endAt: Date | null; summary?: string | null; venueName?: string | null; address?: string | null; city?: string | null }, url?: string) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = e.endAt ?? new Date(e.startAt.getTime() + 2 * 36e5);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${fmt(e.startAt)}/${fmt(end)}`,
    details: [e.summary, url].filter(Boolean).join("\n\n"),
    location: eventLocation(e),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function mapsUrl(e: { venueName?: string | null; address?: string | null; city?: string | null }) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(eventLocation(e) || "Fresno, CA")}`;
}
