"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { upsertContactByEmail } from "@/lib/contacts";
import { nextNumber } from "@/lib/counters";
import { eventAvailability, markOrderPaid, registrationState } from "@/lib/events";
import { appUrl, paymentsMode, stripe } from "@/lib/payments";
import { getSettings } from "@/lib/settings";
import { randomCode } from "@/lib/utils";
import { computeTotals, discountLabel, type DiscountInfo } from "@/components/events/pricing";

export type RegState = { error?: string; fieldErrors?: Record<string, string> } | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const payloadSchema = z.object({
  eventId: z.string().min(1),
  tickets: z.array(z.object({ ticketTypeId: z.string().min(1), qty: z.number().int().min(0).max(50) })),
  buyer: z.object({
    firstName: z.string().trim().max(80),
    lastName: z.string().trim().max(80),
    email: z.string().trim().max(200),
    phone: z.string().trim().max(40).optional().default(""),
  }),
  attendees: z
    .array(
      z.object({
        ticketTypeId: z.string(),
        firstName: z.string().trim().max(80),
        lastName: z.string().trim().max(80),
        email: z.string().trim().max(200).optional().default(""),
        answers: z.record(z.string(), z.string().max(1000)).optional().default({}),
      }),
    )
    .optional()
    .default([]),
  sharedAnswers: z.record(z.string(), z.string().max(1000)).optional().default({}),
  discountCode: z.string().trim().max(40).optional().default(""),
  coverFee: z.boolean().optional().default(false),
  donationCents: z.number().int().min(0).max(100_000_00).optional().default(0),
});

type DiscountRow = { id: string; code: string; percentOff: number | null; amountOffCents: number | null };

async function findDiscount(eventId: string, code: string): Promise<DiscountRow | { error: string }> {
  const c = code.trim().toUpperCase();
  const row = await db.discountCode.findUnique({ where: { eventId_code: { eventId, code: c } } });
  if (!row || !row.active) return { error: "That discount code isn't valid for this event." };
  if (row.maxUses != null && row.timesUsed >= row.maxUses) return { error: "That discount code has been fully redeemed." };
  return row;
}

/** Called from the registration form to preview a discount before checkout. */
export async function checkDiscountCode(
  eventId: string,
  code: string,
): Promise<{ ok: true; discount: NonNullable<DiscountInfo>; label: string } | { ok: false; message: string }> {
  if (!code.trim()) return { ok: false, message: "Enter a code." };
  const res = await findDiscount(eventId, code);
  if ("error" in res) return { ok: false, message: res.error };
  const discount = { code: res.code, percentOff: res.percentOff, amountOffCents: res.amountOffCents };
  return { ok: true, discount, label: discountLabel(discount) };
}

export async function registerForEvent(_prev: RegState, formData: FormData): Promise<RegState> {
  let parsed: z.infer<typeof payloadSchema>;
  try {
    parsed = payloadSchema.parse(JSON.parse(String(formData.get("payload") ?? "{}")));
  } catch {
    return { error: "Something went wrong reading your registration. Please refresh and try again." };
  }

  const event = await db.event.findUnique({
    where: { id: parsed.eventId },
    include: { ticketTypes: true, questions: { orderBy: { sortOrder: "asc" } } },
  });
  if (!event) return { error: "This event no longer exists." };
  const avail = await eventAvailability(event.id);
  if (!avail) return { error: "This event no longer exists." };
  const state = registrationState(event, avail.soldOut);
  if (!state.open) return { error: state.reason };

  const fieldErrors: Record<string, string> = {};

  // ── Tickets (prices come from the DB, never the client) ──
  const lines: { tt: (typeof event.ticketTypes)[number]; qty: number }[] = [];
  let capacityNeeded = 0;
  for (const t of parsed.tickets) {
    if (t.qty <= 0) continue;
    const tt = event.ticketTypes.find((x) => x.id === t.ticketTypeId && x.active);
    if (!tt) return { error: "One of the selected tickets is no longer available. Please refresh." };
    const remaining = avail.tickets.find((x) => x.id === tt.id)?.remaining;
    if (remaining != null && t.qty > remaining) {
      fieldErrors[`qty_${tt.id}`] = remaining === 0 ? "Sold out" : `Only ${remaining} left`;
    }
    if (tt.countsTowardCapacity) capacityNeeded += t.qty * Math.max(1, tt.attendeesPerTicket);
    lines.push({ tt, qty: t.qty });
  }
  if (!lines.length) return { error: "Please choose at least one ticket." };
  if (avail.capacityRemaining != null && capacityNeeded > avail.capacityRemaining) {
    return { error: `Only ${avail.capacityRemaining} spot${avail.capacityRemaining === 1 ? "" : "s"} left for this event.` };
  }

  // ── Buyer ──
  const buyer = parsed.buyer;
  if (!buyer.firstName) fieldErrors["buyer.firstName"] = "Required";
  if (!buyer.lastName) fieldErrors["buyer.lastName"] = "Required";
  if (!EMAIL_RE.test(buyer.email)) fieldErrors["buyer.email"] = "Enter a valid email";

  // ── Attendee slots ──
  const slots: { ticketTypeId: string }[] = [];
  for (const l of lines) for (let q = 0; q < l.qty; q++) for (let a = 0; a < Math.max(1, l.tt.attendeesPerTicket); a++) slots.push({ ticketTypeId: l.tt.id });

  const checkAnswers = (answers: Record<string, string>, prefix: string) => {
    const clean: Record<string, string> = {};
    for (const q of event.questions) {
      const v = (answers[q.id] ?? "").trim();
      if (q.required && !v) fieldErrors[`${prefix}q_${q.id}`] = "Required";
      if (q.type === "SELECT" && v) {
        const opts = (q.options ?? "").split("\n").map((o) => o.trim()).filter(Boolean);
        if (!opts.includes(v)) fieldErrors[`${prefix}q_${q.id}`] = "Choose an option";
      }
      if (v) clean[q.id] = q.type === "CHECKBOX" ? "Yes" : v;
    }
    return clean;
  };

  const buyerName = { firstName: buyer.firstName, lastName: buyer.lastName };
  let attendees: { ticketTypeId: string; firstName: string; lastName: string; email: string | null; answers: Record<string, string> }[];
  if (event.collectAttendeeInfo) {
    if (parsed.attendees.length !== slots.length) return { error: "Please fill in the details for every attendee." };
    attendees = parsed.attendees.map((a, i) => {
      if (a.ticketTypeId !== slots[i]!.ticketTypeId) fieldErrors[`att_${i}`] = "Ticket mismatch — please refresh";
      if (!a.firstName) fieldErrors[`att_${i}.firstName`] = "Required";
      if (!a.lastName) fieldErrors[`att_${i}.lastName`] = "Required";
      if (a.email && !EMAIL_RE.test(a.email)) fieldErrors[`att_${i}.email`] = "Enter a valid email";
      return {
        ticketTypeId: slots[i]!.ticketTypeId,
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email ? a.email.toLowerCase() : null,
        answers: checkAnswers(a.answers, `att_${i}.`),
      };
    });
  } else {
    const shared = checkAnswers(parsed.sharedAnswers, "shared.");
    attendees = slots.map((s, i) => ({
      ticketTypeId: s.ticketTypeId,
      firstName: buyerName.firstName,
      lastName: i === 0 ? buyerName.lastName : `${buyerName.lastName} (guest ${i})`,
      email: i === 0 ? buyer.email.toLowerCase() : null,
      answers: shared,
    }));
  }

  // ── Discount, fee, donation ──
  let discountRow: DiscountRow | null = null;
  if (parsed.discountCode) {
    const res = await findDiscount(event.id, parsed.discountCode);
    if ("error" in res) fieldErrors["discountCode"] = res.error;
    else discountRow = res;
  }

  if (Object.keys(fieldErrors).length) return { error: "Please fix the highlighted fields.", fieldErrors };

  const settings = await getSettings();
  const subtotalCents = lines.reduce((s, l) => s + l.tt.priceCents * l.qty, 0);
  const totals = computeTotals({
    subtotalCents,
    discount: discountRow ? { code: discountRow.code, percentOff: discountRow.percentOff, amountOffCents: discountRow.amountOffCents } : null,
    coverFee: event.coverFeeEnabled && parsed.coverFee,
    donationCents: event.allowDonation ? parsed.donationCents : 0,
    feePercent: settings.feePercent,
    feeFixedCents: settings.feeFixedCents,
  });

  // ── Create the order (PENDING) ──
  const order = await db.$transaction(async (tx) => {
    const contact = await upsertContactByEmail(
      { email: buyer.email, firstName: buyer.firstName, lastName: buyer.lastName, phone: buyer.phone || null, source: "EVENT" },
      tx,
    );
    const attendeeContacts = new Map<string, string>();
    attendeeContacts.set(buyer.email.toLowerCase(), contact.id);
    for (const a of attendees) {
      if (a.email && !attendeeContacts.has(a.email)) {
        const c = await upsertContactByEmail({ email: a.email, firstName: a.firstName, lastName: a.lastName, source: "EVENT" }, tx);
        attendeeContacts.set(a.email, c.id);
      }
    }
    const number = await nextNumber("order", tx);
    return tx.eventOrder.create({
      data: {
        number,
        eventId: event.id,
        contactId: contact.id,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        feeCents: totals.feeCents,
        donationCents: totals.donationCents,
        totalCents: totals.totalCents,
        status: "PENDING",
        discountCodeId: discountRow?.id ?? null,
        attendees: {
          create: attendees.map((a) => ({
            eventId: event.id,
            ticketTypeId: a.ticketTypeId,
            contactId: a.email ? attendeeContacts.get(a.email) ?? null : null,
            firstName: a.firstName,
            lastName: a.lastName,
            email: a.email,
            ticketCode: randomCode(8),
            answers: Object.keys(a.answers).length ? JSON.stringify(a.answers) : null,
          })),
        },
      },
    });
  });

  const mode = paymentsMode();
  if (order.totalCents === 0 || mode === "demo") {
    await markOrderPaid(order.id, { isTest: mode === "demo" && order.totalCents > 0 });
    redirect(`/events/order/${order.id}`);
  }

  // ── Stripe Checkout ──
  let url: string | null = null;
  try {
    const s = stripe()!;
    const line_items: NonNullable<Parameters<typeof s.checkout.sessions.create>[0]>["line_items"] = [];
    if (totals.discountCents > 0) {
      const desc = lines.map((l) => `${l.qty} × ${l.tt.name}`).join(", ") + ` (code ${discountRow!.code})`;
      if (totals.subtotalCents - totals.discountCents > 0) {
        line_items.push({
          quantity: 1,
          price_data: { currency: "usd", unit_amount: totals.subtotalCents - totals.discountCents, product_data: { name: `${event.title} — tickets`, description: desc } },
        });
      }
    } else {
      for (const l of lines) {
        if (l.tt.priceCents <= 0) continue;
        line_items.push({
          quantity: l.qty,
          price_data: { currency: "usd", unit_amount: l.tt.priceCents, product_data: { name: `${event.title} — ${l.tt.name}` } },
        });
      }
    }
    if (totals.donationCents > 0) {
      line_items.push({ quantity: 1, price_data: { currency: "usd", unit_amount: totals.donationCents, product_data: { name: "Tax-deductible donation" } } });
    }
    if (totals.feeCents > 0) {
      line_items.push({ quantity: 1, price_data: { currency: "usd", unit_amount: totals.feeCents, product_data: { name: "Processing fee (covered by you — thank you!)" } } });
    }
    const metadata = { kind: "event_order", orderId: order.id };
    const session = await s.checkout.sessions.create({
      mode: "payment",
      customer_email: buyer.email,
      line_items,
      metadata,
      payment_intent_data: { metadata, description: `${event.title} — order #${order.number}` },
      success_url: `${appUrl()}/events/order/${order.id}?paid=1`,
      cancel_url: `${appUrl()}/events/${event.slug}?canceled=1`,
    });
    await db.eventOrder.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });
    url = session.url;
  } catch (e) {
    console.error("Stripe checkout failed", e);
    await db.eventOrder.update({ where: { id: order.id }, data: { status: "CANCELED" } });
    return { error: "We couldn't start the secure checkout. Please try again in a moment." };
  }
  if (!url) return { error: "We couldn't start the secure checkout. Please try again in a moment." };
  redirect(url);
}
