import { getStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugify, toCsv } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaff();
  if (!staff || staff.kind !== "staff") return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const event = await db.event.findUnique({ where: { id }, include: { questions: { orderBy: { sortOrder: "asc" } } } });
  if (!event) return new Response("Not found", { status: 404 });

  const attendees = await db.attendee.findMany({
    where: { eventId: id, order: { status: { in: ["PAID", "PENDING"] } } },
    include: { ticketType: true, order: { include: { contact: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const qCols = event.questions.map((q) => q.label);
  const rows = attendees.map((a) => {
    let answers: Record<string, string> = {};
    try {
      answers = a.answers ? (JSON.parse(a.answers) as Record<string, string>) : {};
    } catch {
      /* ignore */
    }
    const row: Record<string, unknown> = {
      "First name": a.firstName,
      "Last name": a.lastName,
      Email: a.email ?? "",
      Ticket: a.ticketType.name,
      "Ticket code": a.ticketCode,
      "Order #": a.order.number,
      "Order status": a.order.status,
      "Buyer name": `${a.order.contact.firstName} ${a.order.contact.lastName}`.trim(),
      "Buyer email": a.order.contact.email ?? "",
      "Buyer phone": a.order.contact.phone ?? "",
      "Registered at": a.createdAt.toISOString(),
      "Checked in at": a.checkedInAt ? a.checkedInAt.toISOString() : "",
    };
    for (const q of event.questions) row[q.label] = answers[q.id] ?? "";
    return row;
  });

  const columns = ["First name", "Last name", "Email", "Ticket", "Ticket code", "Order #", "Order status", "Buyer name", "Buyer email", "Buyer phone", "Registered at", "Checked in at", ...qCols];
  const csv = toCsv(rows, columns);
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slugify(event.title)}-attendees.csv"`,
    },
  });
}
