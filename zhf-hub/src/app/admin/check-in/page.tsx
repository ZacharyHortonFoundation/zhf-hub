import Link from "next/link";
import { format, startOfDay, subDays } from "date-fns";
import { CalendarDays, Search, Undo2, Users } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, EmptyState, LinkButton, PageHeader, Progress } from "@/components/ui";
import { AutoSubmitSelect, SubmitButton } from "@/components/client-ui";
import { QrScanner } from "@/components/events/qr-scanner";
import { cn, pct } from "@/lib/utils";
import { toggleCheckIn } from "../events/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check-in" };

export default async function CheckInPage({ searchParams }: { searchParams: Promise<{ event?: string; q?: string; all?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const now = new Date();
  const today = startOfDay(now);

  const events = await db.event.findMany({
    where: { status: { not: "DRAFT" }, startAt: { gte: subDays(today, 3) } },
    orderBy: { startAt: "asc" },
    take: 25,
    select: { id: true, title: true, startAt: true, endAt: true },
  });
  let selected = sp.event ? await db.event.findUnique({ where: { id: sp.event }, select: { id: true, title: true, startAt: true, endAt: true, venueName: true, city: true } }) : null;
  if (!selected) {
    const def =
      events.find((e) => (e.endAt ?? e.startAt) >= today) ??
      (await db.event.findFirst({ where: { status: { not: "DRAFT" }, startAt: { lt: today } }, orderBy: { startAt: "desc" }, select: { id: true } }));
    if (def) selected = await db.event.findUnique({ where: { id: def.id }, select: { id: true, title: true, startAt: true, endAt: true, venueName: true, city: true } });
  }
  if (selected && !events.some((e) => e.id === selected!.id)) events.unshift({ id: selected.id, title: selected.title, startAt: selected.startAt, endAt: selected.endAt });

  if (!selected) {
    return (
      <>
        <PageHeader title="Check-in" />
        <Card>
          <EmptyState icon={<CalendarDays className="size-6" />} title="No events to check in" description="Publish an event first." action={<LinkButton href="/admin/events/new">New event</LinkButton>} />
        </Card>
      </>
    );
  }

  const term = (sp.q ?? "").trim();
  const showAll = sp.all === "1";
  const [total, checkedIn] = await Promise.all([
    db.attendee.count({ where: { eventId: selected.id, order: { status: "PAID" } } }),
    db.attendee.count({ where: { eventId: selected.id, order: { status: "PAID" }, checkedInAt: { not: null } } }),
  ]);
  const list = await db.attendee.findMany({
    where: {
      eventId: selected.id,
      order: { status: "PAID" },
      ...(term
        ? { OR: [{ firstName: { contains: term } }, { lastName: { contains: term } }, { email: { contains: term.toLowerCase() } }, { ticketCode: { contains: term.toUpperCase() } }] }
        : showAll
          ? {}
          : { checkedInAt: { not: null } }),
    },
    include: { ticketType: { select: { name: true } }, order: { select: { number: true } } },
    orderBy: term || showAll ? [{ lastName: "asc" }, { firstName: "asc" }] : [{ checkedInAt: "desc" }],
    take: term || showAll ? 300 : 8,
  });

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ event: selected!.id });
    const merged = { q: term || undefined, all: showAll ? "1" : undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/admin/check-in?${p.toString()}`;
  };
  const returnTo = qs({});

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Check-in" description="Scan QR codes at the door or search by name." breadcrumbs={[{ label: "Events", href: "/admin/events" }, { label: "Check-in" }]} />

      <form className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Event</label>
        <AutoSubmitSelect name="event" defaultValue={selected.id} className="h-12 w-full text-base">
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {format(e.startAt, "MMM d")} · {e.title}
            </option>
          ))}
        </AutoSubmitSelect>
      </form>

      <Card className="mb-4 p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm text-slate-500">Checked in</p>
            <p className="text-4xl font-semibold tabular-nums text-slate-900">
              {checkedIn}
              <span className="text-xl font-normal text-slate-400"> / {total}</span>
            </p>
          </div>
          <p className="text-right text-sm text-slate-500">
            {format(selected.startAt, "EEE, MMM d · h:mm a")}
            <br />
            {selected.venueName ?? selected.city ?? ""}
          </p>
        </div>
        <Progress value={pct(checkedIn, total)} tone="green" className="mt-3 h-3" />
      </Card>

      <Card className="mb-4 p-5">
        <QrScanner eventId={selected.id} />
      </Card>

      <Card>
        <form className="border-b border-slate-100 p-4" action="/admin/check-in">
          <input type="hidden" name="event" value={selected.id} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={term}
              placeholder="Search name, email or code…"
              className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-slate-500">{term ? `${list.length} match${list.length === 1 ? "" : "es"}` : showAll ? `All ${total} attendees` : "Recently checked in"}</span>
            {term ? (
              <Link href={qs({ q: undefined })} className="font-medium text-brand-700">
                Clear
              </Link>
            ) : (
              <Link href={qs({ all: showAll ? undefined : "1" })} className="font-medium text-brand-700">
                {showAll ? "Show recent only" : "Show everyone"}
              </Link>
            )}
          </div>
        </form>
        {list.length === 0 ? (
          <EmptyState icon={<Users className="size-6" />} title={term ? "Nobody matches that search" : "No one checked in yet"} className="py-10" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((a) => (
              <li key={a.id} className={cn("flex items-center gap-3 px-4 py-3", a.checkedInAt && "bg-emerald-50/40")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">
                    {a.firstName} {a.lastName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {a.ticketType.name} · <span className="font-mono">{a.ticketCode}</span> · #{a.order.number}
                  </p>
                </div>
                <form action={toggleCheckIn}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  {a.checkedInAt ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-emerald-700">✓ {format(a.checkedInAt, "h:mm a")}</span>
                      <SubmitButton variant="ghost" size="sm" aria-label="Undo check-in">
                        <Undo2 className="size-4" />
                      </SubmitButton>
                    </div>
                  ) : (
                    <SubmitButton size="md" className="min-w-28">
                      Check in
                    </SubmitButton>
                  )}
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
