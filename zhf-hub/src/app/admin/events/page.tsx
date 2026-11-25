import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { format, startOfYear } from "date-fns";
import { CalendarDays, DollarSign, Plus, ScanLine, Search, Ticket, UserCheck } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Progress, Stat, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { cn, money, moneyCompact, pct } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events" };

const FILTERS = [
  { v: "upcoming", label: "Upcoming" },
  { v: "past", label: "Past" },
  { v: "draft", label: "Drafts" },
  { v: "all", label: "All" },
] as const;

export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const filter = FILTERS.some((f) => f.v === sp.filter) ? sp.filter! : "upcoming";
  const q = (sp.q ?? "").trim();
  const now = new Date();
  const in90 = new Date(now.getTime() + 90 * 864e5);

  const where: Prisma.EventWhereInput = {};
  const and: Prisma.EventWhereInput[] = [];
  if (filter === "upcoming") and.push({ status: { not: "DRAFT" }, OR: [{ endAt: { gte: now } }, { endAt: null, startAt: { gte: now } }] });
  if (filter === "past") and.push({ status: { not: "DRAFT" }, OR: [{ endAt: { lt: now } }, { endAt: null, startAt: { lt: now } }] });
  if (filter === "draft") and.push({ status: "DRAFT" });
  if (q) and.push({ OR: [{ title: { contains: q } }, { venueName: { contains: q } }, { city: { contains: q } }] });
  where.AND = and;

  const [events, upcomingCount, ticketsNext90, revenueYTD, sold, checked, capUsed, revenue] = await Promise.all([
    db.event.findMany({ where, orderBy: { startAt: filter === "past" || filter === "all" ? "desc" : "asc" }, take: 200 }),
    db.event.count({ where: { status: "PUBLISHED", startAt: { gte: now } } }),
    db.attendee.count({ where: { order: { status: "PAID" }, event: { startAt: { gte: now, lte: in90 } } } }),
    db.eventOrder.aggregate({ where: { status: "PAID", createdAt: { gte: startOfYear(now) } }, _sum: { totalCents: true } }),
    db.attendee.groupBy({ by: ["eventId"], where: { order: { status: "PAID" } }, _count: true }),
    db.attendee.groupBy({ by: ["eventId"], where: { order: { status: "PAID" }, checkedInAt: { not: null } }, _count: true }),
    db.attendee.groupBy({ by: ["eventId"], where: { order: { status: "PAID" }, ticketType: { countsTowardCapacity: true } }, _count: true }),
    db.eventOrder.groupBy({ by: ["eventId"], where: { status: "PAID" }, _sum: { totalCents: true } }),
  ]);
  const soldBy = new Map(sold.map((r) => [r.eventId, r._count]));
  const checkedBy = new Map(checked.map((r) => [r.eventId, r._count]));
  const capBy = new Map(capUsed.map((r) => [r.eventId, r._count]));
  const revBy = new Map(revenue.map((r) => [r.eventId, r._sum.totalCents ?? 0]));

  // Attendance rate across past events that had registrations
  const pastIds = (
    await db.event.findMany({ where: { status: "PUBLISHED", startAt: { lt: now, gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) } }, select: { id: true } })
  ).map((e) => e.id);
  const rates = pastIds.filter((id) => (soldBy.get(id) ?? 0) > 0).map((id) => (checkedBy.get(id) ?? 0) / (soldBy.get(id) ?? 1));
  const avgRate = rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) : null;

  const hrefFor = (f: string) => {
    const p = new URLSearchParams();
    if (f !== "upcoming") p.set("filter", f);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/admin/events?${s}` : "/admin/events";
  };

  return (
    <>
      <PageHeader
        title="Events"
        description="Ticketing, registrations and check-in for every ZHF event."
        actions={
          <>
            <LinkButton href="/admin/check-in" variant="outline">
              <ScanLine className="size-4" /> Check-in
            </LinkButton>
            <LinkButton href="/admin/events/new">
              <Plus className="size-4" /> New event
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Upcoming events" value={upcomingCount} icon={<CalendarDays className="size-5" />} hint="published" />
        <Stat label="Tickets sold · next 90 days" value={ticketsNext90} icon={<Ticket className="size-5" />} hint="attendees registered" />
        <Stat label="Event revenue this year" value={moneyCompact(revenueYTD._sum.totalCents ?? 0)} icon={<DollarSign className="size-5" />} hint="tickets, fees & add-on gifts" />
        <Stat label="Avg. attendance rate" value={avgRate === null ? "—" : `${avgRate}%`} icon={<UserCheck className="size-5" />} hint="checked in ÷ registered, past 12 mo." />
      </div>

      <Card className="mt-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Link
                key={f.v}
                href={hrefFor(f.v)}
                className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition", filter === f.v ? "bg-brand-50 text-brand-800" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800")}
              >
                {f.label}
              </Link>
            ))}
          </div>
          <form className="relative sm:w-72">
            {filter !== "upcoming" ? <input type="hidden" name="filter" value={filter} /> : null}
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search events…"
              className="h-9 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
            />
          </form>
        </div>

        {events.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="size-6" />}
            title={q ? "No events match your search" : filter === "draft" ? "No draft events" : "No events here yet"}
            description="Create an event to start selling tickets and taking RSVPs."
            action={<LinkButton href="/admin/events/new">New event</LinkButton>}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Event</TH>
                <TH>Date</TH>
                <TH>Status</TH>
                <TH className="min-w-[180px]">Registrations</TH>
                <TH className="text-right">Checked in</TH>
                <TH className="text-right">Revenue</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {events.map((e) => {
                const s = soldBy.get(e.id) ?? 0;
                const cap = capBy.get(e.id) ?? 0;
                const ci = checkedBy.get(e.id) ?? 0;
                const past = (e.endAt ?? e.startAt) < now;
                return (
                  <TR key={e.id}>
                    <TD>
                      <Link href={`/admin/events/${e.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {e.title}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {e.category} · {e.venueName ?? e.city ?? "TBA"}
                      </p>
                    </TD>
                    <TD className="whitespace-nowrap">
                      <p className="text-slate-900">{format(e.startAt, "MMM d, yyyy")}</p>
                      <p className="text-xs text-slate-500">{format(e.startAt, "EEE h:mm a")}</p>
                    </TD>
                    <TD>
                      {past && e.status === "PUBLISHED" ? <Badge tone="gray">Ended</Badge> : <StatusBadge status={e.status} label={e.status === "PUBLISHED" ? "Live" : undefined} />}
                    </TD>
                    <TD>
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span className="font-medium text-slate-900">{s} registered</span>
                        {e.capacity ? <span>{cap}/{e.capacity}</span> : <span className="text-slate-400">no limit</span>}
                      </div>
                      {e.capacity ? <Progress value={pct(cap, e.capacity)} className="mt-1.5 h-1.5" tone={cap >= e.capacity ? "accent" : "brand"} /> : null}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {s ? (
                        <>
                          {ci} <span className="text-xs text-slate-400">({pct(ci, s)}%)</span>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">{revBy.get(e.id) ? money(revBy.get(e.id)!) : <span className="text-slate-400">—</span>}</TD>
                    <TD className="whitespace-nowrap text-right">
                      <LinkButton href={`/admin/events/${e.id}`} variant="ghost" size="sm">
                        Manage
                      </LinkButton>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
