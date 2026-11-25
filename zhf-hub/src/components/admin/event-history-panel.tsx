import Link from "next/link";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, EmptyState, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { money } from "@/lib/utils";

/** Constituent profile panel: events this person bought tickets for or attended. */
export async function EventHistoryPanel({ contactId }: { contactId: string }) {
  const [orders, guestOf] = await Promise.all([
    db.eventOrder.findMany({
      where: { contactId },
      orderBy: { createdAt: "desc" },
      include: { event: { select: { id: true, title: true, startAt: true } }, attendees: { select: { checkedInAt: true } } },
    }),
    // tickets on someone else's order that are linked to this person
    db.attendee.findMany({
      where: { contactId, order: { contactId: { not: contactId }, status: "PAID" } },
      orderBy: { createdAt: "desc" },
      include: { event: { select: { id: true, title: true, startAt: true } }, ticketType: { select: { name: true } }, order: { select: { number: true } } },
    }),
  ]);

  const paidOrders = orders.filter((o) => o.status === "PAID");
  const eventsAttended = new Set([
    ...paidOrders.filter((o) => o.attendees.some((a) => a.checkedInAt)).map((o) => o.event.id),
    ...guestOf.filter((a) => a.checkedInAt).map((a) => a.event.id),
  ]).size;
  const spent = paidOrders.reduce((s, o) => s + o.totalCents, 0);

  return (
    <Card>
      <CardHeader
        title="Events"
        description={
          orders.length || guestOf.length
            ? `${paidOrders.length} order${paidOrders.length === 1 ? "" : "s"} · ${money(spent)} · attended ${eventsAttended} event${eventsAttended === 1 ? "" : "s"}`
            : undefined
        }
      />
      {orders.length === 0 && guestOf.length === 0 ? (
        <EmptyState icon={<CalendarDays className="size-6" />} title="No event registrations yet" className="py-10" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Event</TH>
              <TH>Date</TH>
              <TH className="text-right">Tickets</TH>
              <TH className="text-right">Total</TH>
              <TH>Status</TH>
              <TH>Checked in</TH>
            </tr>
          </THead>
          <tbody>
            {orders.map((o) => {
              const checked = o.attendees.filter((a) => a.checkedInAt).length;
              return (
                <TR key={o.id}>
                  <TD>
                    <Link href={`/admin/events/${o.event.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {o.event.title}
                    </Link>
                    <p className="text-xs text-slate-500">Order #{o.number}</p>
                  </TD>
                  <TD className="whitespace-nowrap">{format(o.event.startAt, "MMM d, yyyy")}</TD>
                  <TD className="text-right tabular-nums">{o.attendees.length}</TD>
                  <TD className="text-right tabular-nums">{o.totalCents ? money(o.totalCents, { decimals: true }) : "Free"}</TD>
                  <TD>
                    <StatusBadge status={o.status} />
                  </TD>
                  <TD className="text-sm">
                    {o.status !== "PAID" ? (
                      <span className="text-slate-400">—</span>
                    ) : checked ? (
                      <span className="text-emerald-700">
                        {checked} of {o.attendees.length}
                      </span>
                    ) : (
                      <span className="text-slate-400">Not yet</span>
                    )}
                  </TD>
                </TR>
              );
            })}
            {guestOf.map((a) => (
              <TR key={a.id}>
                <TD>
                  <Link href={`/admin/events/${a.event.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                    {a.event.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    Guest on order #{a.order.number} · {a.ticketType.name}
                  </p>
                </TD>
                <TD className="whitespace-nowrap">{format(a.event.startAt, "MMM d, yyyy")}</TD>
                <TD className="text-right tabular-nums">1</TD>
                <TD className="text-right text-slate-400">—</TD>
                <TD>
                  <Badge tone="blue">Guest</Badge>
                </TD>
                <TD className="text-sm">{a.checkedInAt ? <span className="text-emerald-700">Yes</span> : <span className="text-slate-400">Not yet</span>}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
