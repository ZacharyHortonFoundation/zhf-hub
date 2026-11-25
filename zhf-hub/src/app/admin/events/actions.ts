"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { EVENT_CATEGORIES, EVENT_STATUS } from "@/lib/constants";
import { markOrderPaid } from "@/lib/events";
import { bool, optDate, optInt, optStr, slugify, str, toCents } from "@/lib/utils";

const enc = encodeURIComponent;

function back(eventId: string, tab: string, msg: string, kind: "ok" | "err" = "ok", extra = ""): never {
  redirect(`/admin/events/${eventId}?tab=${tab}${extra}&${kind}=${enc(msg)}`);
}

async function uniqueSlug(base: string, excludeId?: string) {
  const root = slugify(base) || "event";
  let slug = root;
  for (let i = 2; ; i++) {
    const hit = await db.event.findUnique({ where: { slug } });
    if (!hit || hit.id === excludeId) return slug;
    slug = `${root}-${i}`;
  }
}

function eventFields(fd: FormData) {
  const title = str(fd.get("title"));
  const startAt = optDate(fd.get("startAt"));
  const category = str(fd.get("category"));
  const status = str(fd.get("status"));
  const errors: string[] = [];
  if (!title) errors.push("Title is required");
  if (!startAt) errors.push("Start date & time is required");
  const endAt = optDate(fd.get("endAt"));
  if (startAt && endAt && endAt < startAt) errors.push("End must be after start");
  return {
    errors,
    data: {
      title,
      summary: optStr(fd.get("summary")),
      description: optStr(fd.get("description")),
      imageUrl: optStr(fd.get("imageUrl")),
      category: (EVENT_CATEGORIES as readonly string[]).includes(category) ? category : "Community",
      startAt: startAt ?? new Date(),
      endAt,
      venueName: optStr(fd.get("venueName")),
      address: optStr(fd.get("address")),
      city: optStr(fd.get("city")),
      capacity: optInt(fd.get("capacity")),
      registrationDeadline: optDate(fd.get("registrationDeadline")),
      status: (EVENT_STATUS as readonly string[]).includes(status) ? status : "DRAFT",
      coverFeeEnabled: bool(fd.get("coverFeeEnabled")),
      allowDonation: bool(fd.get("allowDonation")),
      collectAttendeeInfo: bool(fd.get("collectAttendeeInfo")),
      coordinatorName: optStr(fd.get("coordinatorName")),
      coordinatorEmail: optStr(fd.get("coordinatorEmail")),
      campaignId: optStr(fd.get("campaignId")),
    },
  };
}

// ── Events ─────────────────────────────────────────────

export async function createEvent(fd: FormData) {
  await requireStaff();
  const { errors, data } = eventFields(fd);
  if (errors.length) redirect(`/admin/events/new?err=${enc(errors.join(". "))}`);
  const slug = await uniqueSlug(str(fd.get("slug")) || data.title);
  const ev = await db.event.create({
    data: {
      ...data,
      slug,
      ticketTypes: { create: [{ name: "General admission", priceCents: 0, sortOrder: 0 }] },
    },
  });
  revalidatePath("/admin/events");
  redirect(`/admin/events/${ev.id}?tab=tickets&ok=${enc("Event created — now set up tickets")}`);
}

export async function updateEvent(fd: FormData) {
  await requireStaff();
  const id = str(fd.get("id"));
  const { errors, data } = eventFields(fd);
  if (errors.length) back(id, "details", errors.join(". "), "err");
  const slug = await uniqueSlug(str(fd.get("slug")) || data.title, id);
  await db.event.update({ where: { id }, data: { ...data, slug } });
  revalidatePath("/admin/events");
  revalidatePath(`/events/${slug}`);
  back(id, "details", "Event saved");
}

export async function setEventStatus(fd: FormData) {
  await requireStaff();
  const id = str(fd.get("id"));
  const status = str(fd.get("status"));
  if (!(EVENT_STATUS as readonly string[]).includes(status)) back(id, "overview", "Invalid status", "err");
  await db.event.update({ where: { id }, data: { status } });
  revalidatePath("/admin/events");
  back(id, "overview", status === "PUBLISHED" ? "Event published — it's live on the website" : status === "CANCELED" ? "Event canceled" : "Event moved to draft");
}

export async function deleteEvent(fd: FormData) {
  await requireStaff();
  const id = str(fd.get("id"));
  const orders = await db.eventOrder.count({ where: { eventId: id } });
  if (orders > 0) back(id, "overview", "This event has orders — cancel it instead of deleting", "err");
  await db.event.delete({ where: { id } });
  revalidatePath("/admin/events");
  redirect(`/admin/events?ok=${enc("Event deleted")}`);
}

export async function duplicateEvent(fd: FormData) {
  await requireStaff();
  const id = str(fd.get("id"));
  const src = await db.event.findUnique({ where: { id }, include: { ticketTypes: true, questions: true } });
  if (!src) redirect("/admin/events?err=Event+not+found");
  const plusYear = (d: Date | null) => (d ? new Date(d.getFullYear() + 1, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()) : null);
  const yearMatch = src.title.match(/\b(20\d{2})\b/);
  const title = yearMatch ? src.title.replace(yearMatch[1]!, String(Number(yearMatch[1]) + 1)) : src.title;
  const copy = await db.event.create({
    data: {
      title,
      slug: await uniqueSlug(`${title} ${src.startAt.getFullYear() + 1}`),
      summary: src.summary,
      description: src.description,
      imageUrl: src.imageUrl,
      category: src.category,
      startAt: plusYear(src.startAt)!,
      endAt: plusYear(src.endAt),
      venueName: src.venueName,
      address: src.address,
      city: src.city,
      capacity: src.capacity,
      registrationDeadline: plusYear(src.registrationDeadline),
      status: "DRAFT",
      coverFeeEnabled: src.coverFeeEnabled,
      allowDonation: src.allowDonation,
      collectAttendeeInfo: src.collectAttendeeInfo,
      coordinatorName: src.coordinatorName,
      coordinatorEmail: src.coordinatorEmail,
      ticketTypes: {
        create: src.ticketTypes.map((t) => ({
          name: t.name,
          description: t.description,
          priceCents: t.priceCents,
          quantity: t.quantity,
          attendeesPerTicket: t.attendeesPerTicket,
          countsTowardCapacity: t.countsTowardCapacity,
          active: t.active,
          sortOrder: t.sortOrder,
        })),
      },
      questions: { create: src.questions.map((q) => ({ label: q.label, type: q.type, options: q.options, required: q.required, sortOrder: q.sortOrder })) },
    },
  });
  revalidatePath("/admin/events");
  redirect(`/admin/events/${copy.id}?tab=details&ok=${enc("Copied as a draft for next year — review the dates and campaign")}`);
}

// ── Ticket types ───────────────────────────────────────

export async function saveTicketType(fd: FormData) {
  await requireStaff();
  const eventId = str(fd.get("eventId"));
  const id = str(fd.get("id"));
  const name = str(fd.get("name"));
  if (!name) back(eventId, "tickets", "Ticket name is required", "err");
  const price = str(fd.get("price"));
  const priceCents = price ? toCents(price) : 0;
  if (Number.isNaN(priceCents) || priceCents < 0) back(eventId, "tickets", "Enter a valid price", "err");
  const data = {
    name,
    description: optStr(fd.get("description")),
    priceCents,
    quantity: optInt(fd.get("quantity")),
    attendeesPerTicket: Math.max(1, optInt(fd.get("attendeesPerTicket")) ?? 1),
    countsTowardCapacity: bool(fd.get("countsTowardCapacity")),
    active: bool(fd.get("active")),
    sortOrder: optInt(fd.get("sortOrder")) ?? 0,
  };
  if (id) await db.ticketType.update({ where: { id }, data });
  else await db.ticketType.create({ data: { ...data, eventId } });
  revalidatePath(`/admin/events/${eventId}`);
  back(eventId, "tickets", id ? "Ticket updated" : "Ticket added");
}

export async function deleteTicketType(fd: FormData) {
  await requireStaff();
  const eventId = str(fd.get("eventId"));
  const id = str(fd.get("id"));
  const used = await db.attendee.count({ where: { ticketTypeId: id } });
  if (used > 0) {
    await db.ticketType.update({ where: { id }, data: { active: false } });
    back(eventId, "tickets", "Ticket has sales, so it was hidden instead of deleted");
  }
  await db.ticketType.delete({ where: { id } });
  back(eventId, "tickets", "Ticket deleted");
}

// ── Questions ──────────────────────────────────────────

export async function saveQuestion(fd: FormData) {
  await requireStaff();
  const eventId = str(fd.get("eventId"));
  const id = str(fd.get("id"));
  const label = str(fd.get("label"));
  if (!label) back(eventId, "questions", "Question text is required", "err");
  const type = ["TEXT", "SELECT", "CHECKBOX"].includes(str(fd.get("type"))) ? str(fd.get("type")) : "TEXT";
  const options = str(fd.get("options"))
    .split(/\r?\n/)
    .map((o) => o.trim())
    .filter(Boolean)
    .join("\n");
  if (type === "SELECT" && !options) back(eventId, "questions", "Add at least one option (one per line)", "err");
  const data = { label, type, options: type === "SELECT" ? options : null, required: bool(fd.get("required")), sortOrder: optInt(fd.get("sortOrder")) ?? 0 };
  if (id) await db.eventQuestion.update({ where: { id }, data });
  else await db.eventQuestion.create({ data: { ...data, eventId } });
  back(eventId, "questions", id ? "Question updated" : "Question added");
}

export async function deleteQuestion(fd: FormData) {
  await requireStaff();
  const eventId = str(fd.get("eventId"));
  await db.eventQuestion.delete({ where: { id: str(fd.get("id")) } });
  back(eventId, "questions", "Question deleted");
}

// ── Discount codes ─────────────────────────────────────

export async function saveDiscount(fd: FormData) {
  await requireStaff();
  const eventId = str(fd.get("eventId"));
  const id = str(fd.get("id"));
  const code = str(fd.get("code")).toUpperCase().replace(/\s+/g, "");
  if (!code) back(eventId, "discounts", "Code is required", "err");
  const kind = str(fd.get("kind"));
  const value = str(fd.get("value"));
  let percentOff: number | null = null;
  let amountOffCents: number | null = null;
  if (kind === "amount") {
    amountOffCents = toCents(value);
    if (Number.isNaN(amountOffCents) || amountOffCents <= 0) back(eventId, "discounts", "Enter a valid dollar amount", "err");
  } else {
    percentOff = parseInt(value, 10);
    if (!Number.isFinite(percentOff) || percentOff <= 0 || percentOff > 100) back(eventId, "discounts", "Percent must be between 1 and 100", "err");
  }
  const dup = await db.discountCode.findUnique({ where: { eventId_code: { eventId, code } } });
  if (dup && dup.id !== id) back(eventId, "discounts", `Code ${code} already exists`, "err");
  const data = { code, percentOff, amountOffCents, maxUses: optInt(fd.get("maxUses")), active: bool(fd.get("active")) };
  if (id) await db.discountCode.update({ where: { id }, data });
  else await db.discountCode.create({ data: { ...data, eventId } });
  back(eventId, "discounts", id ? "Discount updated" : "Discount code created");
}

export async function deleteDiscount(fd: FormData) {
  await requireStaff();
  const eventId = str(fd.get("eventId"));
  const id = str(fd.get("id"));
  const used = await db.eventOrder.count({ where: { discountCodeId: id } });
  if (used) {
    await db.discountCode.update({ where: { id }, data: { active: false } });
    back(eventId, "discounts", "Code has been used, so it was deactivated instead of deleted");
  }
  await db.discountCode.delete({ where: { id } });
  back(eventId, "discounts", "Discount code deleted");
}

// ── Attendees & orders ─────────────────────────────────

export async function toggleCheckIn(fd: FormData) {
  await requireStaff();
  const id = str(fd.get("id"));
  const a = await db.attendee.findUnique({ where: { id } });
  if (!a) redirect("/admin/events?err=Attendee+not+found");
  await db.attendee.update({ where: { id }, data: { checkedInAt: a.checkedInAt ? null : new Date() } });
  const returnTo = str(fd.get("returnTo"));
  const msg = a.checkedInAt ? `Check-in undone for ${a.firstName}` : `${a.firstName} ${a.lastName} checked in`;
  if (returnTo.startsWith("/admin/")) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}ok=${enc(msg)}`);
  back(a.eventId, "attendees", msg);
}

export async function adminMarkOrderPaid(fd: FormData) {
  await requireStaff();
  const id = str(fd.get("id"));
  const order = await db.eventOrder.findUnique({ where: { id } });
  if (!order) redirect("/admin/events?err=Order+not+found");
  if (order.status === "CANCELED" || order.status === "REFUNDED") {
    await db.eventOrder.update({ where: { id }, data: { status: "PENDING" } });
  }
  await markOrderPaid(id);
  revalidatePath(`/admin/events/${order.eventId}`);
  back(order.eventId, "orders", `Order #${order.number} marked as paid`);
}

export async function cancelOrder(fd: FormData) {
  await requireStaff();
  const id = str(fd.get("id"));
  const order = await db.eventOrder.findUnique({ where: { id }, include: { donation: true } });
  if (!order) redirect("/admin/events?err=Order+not+found");
  await db.eventOrder.update({ where: { id }, data: { status: "CANCELED" } });
  revalidatePath(`/admin/events/${order.eventId}`);
  back(
    order.eventId,
    "orders",
    order.status === "PAID" && order.totalCents > 0 && !order.isTest
      ? `Order #${order.number} canceled — remember to refund the payment in Stripe`
      : `Order #${order.number} canceled`,
  );
}
