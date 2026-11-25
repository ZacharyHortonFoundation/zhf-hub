"use server";

import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";

export type ScanResult = {
  status: "ok" | "already" | "not_found" | "wrong_event" | "unpaid";
  attendeeId?: string;
  name?: string;
  ticket?: string;
  eventTitle?: string;
  checkedInAt?: string;
};

/** Check an attendee in by the code printed on / encoded in their ticket QR. */
export async function checkInByCode(eventId: string, rawCode: string): Promise<ScanResult> {
  await requireStaff();
  // Accept a bare code or anything that ends in one (e.g. a URL)
  const code = rawCode.trim().toUpperCase().split(/[/?=#\s]/).filter(Boolean).pop() ?? "";
  if (!code) return { status: "not_found" };
  const a = await db.attendee.findUnique({
    where: { ticketCode: code },
    include: { ticketType: { select: { name: true } }, event: { select: { id: true, title: true } }, order: { select: { status: true } } },
  });
  if (!a) return { status: "not_found" };
  const base = { attendeeId: a.id, name: `${a.firstName} ${a.lastName}`, ticket: a.ticketType.name, eventTitle: a.event.title };
  if (a.event.id !== eventId) return { ...base, status: "wrong_event" };
  if (a.order.status !== "PAID") return { ...base, status: "unpaid" };
  if (a.checkedInAt) return { ...base, status: "already", checkedInAt: a.checkedInAt.toISOString() };
  const updated = await db.attendee.update({ where: { id: a.id }, data: { checkedInAt: new Date() } });
  return { ...base, status: "ok", checkedInAt: updated.checkedInAt!.toISOString() };
}

export async function undoCheckIn(attendeeId: string) {
  await requireStaff();
  await db.attendee.update({ where: { id: attendeeId }, data: { checkedInAt: null } });
  return { ok: true };
}
