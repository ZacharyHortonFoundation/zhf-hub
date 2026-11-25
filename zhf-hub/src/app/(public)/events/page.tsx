import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { endOfMonth, startOfMonth } from "date-fns";
import { CalendarDays, LayoutGrid, List, Search } from "lucide-react";
import { db } from "@/lib/db";
import { EVENT_CATEGORIES } from "@/lib/constants";
import { eventAvailability, priceSummary, registrationState } from "@/lib/events";
import { EmptyState, LinkButton } from "@/components/ui";
import { MonthCalendar } from "@/components/month-calendar";
import { EventGridCard, EventListRow, type EventCardData } from "@/components/events/event-card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events" };

const PAGE_SIZE = 9;

type SP = { tab?: string; q?: string; category?: string; view?: string; month?: string; page?: string };

export default async function EventsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = sp.tab === "past" ? "past" : "upcoming";
  const view = sp.view === "list" || sp.view === "calendar" ? sp.view : "grid";
  const q = (sp.q ?? "").trim();
  const category = EVENT_CATEGORIES.includes(sp.category as (typeof EVENT_CATEGORIES)[number]) ? sp.category! : "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const now = new Date();

  const href = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { tab, view, q, category, month: sp.month, page: undefined as string | undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) {
      if (!v) continue;
      if (k === "tab" && v === "upcoming") continue;
      if (k === "view" && v === "grid") continue;
      p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `/events?${s}` : "/events";
  };

  const where: Prisma.EventWhereInput = { status: "PUBLISHED" };
  const and: Prisma.EventWhereInput[] = [];
  if (q) and.push({ OR: [{ title: { contains: q } }, { summary: { contains: q } }, { venueName: { contains: q } }, { city: { contains: q } }] });
  if (category) and.push({ category });

  let monthDate = startOfMonth(now);
  if (view === "calendar") {
    if (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) {
      const [y, m] = sp.month.split("-").map(Number);
      monthDate = new Date(y!, m! - 1, 1);
    }
    and.push({ startAt: { gte: startOfMonth(monthDate), lte: endOfMonth(monthDate) } });
  } else if (tab === "upcoming") {
    and.push({ OR: [{ endAt: { gte: now } }, { endAt: null, startAt: { gte: now } }] });
  } else {
    and.push({ OR: [{ endAt: { lt: now } }, { endAt: null, startAt: { lt: now } }] });
  }
  where.AND = and;

  const total = view === "calendar" ? 0 : await db.event.count({ where });
  const events = await db.event.findMany({
    where,
    include: { ticketTypes: true },
    orderBy: { startAt: tab === "past" && view !== "calendar" ? "desc" : "asc" },
    skip: view !== "calendar" && tab === "past" ? (page - 1) * PAGE_SIZE : 0,
    take: view === "calendar" ? 200 : tab === "past" ? PAGE_SIZE : 60,
  });
  const pageCount = tab === "past" ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;

  const cards: EventCardData[] = await Promise.all(
    events.map(async (e) => {
      let badge: EventCardData["badge"] = null;
      const ended = (e.endAt ?? e.startAt) < now;
      if (ended) badge = { text: "Ended", tone: "gray" };
      else {
        const avail = await eventAvailability(e.id);
        const st = registrationState(e, avail?.soldOut ?? false, now);
        if (!st.open) badge = { text: avail?.soldOut ? "Sold out" : "Registration closed", tone: avail?.soldOut ? "red" : "gray" };
        else if (avail?.capacityRemaining != null && avail.capacityRemaining <= 10) badge = { text: `${avail.capacityRemaining} spots left`, tone: "amber" };
      }
      return {
        slug: e.slug,
        title: e.title,
        summary: e.summary,
        category: e.category,
        imageUrl: e.imageUrl,
        startAt: e.startAt,
        endAt: e.endAt,
        venueName: e.venueName,
        city: e.city,
        price: priceSummary(e.ticketTypes),
        badge,
      };
    }),
  );

  return (
    <>
      <section className="bg-brand-800 text-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-200">Events</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Come together. Break the stigma.</h1>
          <p className="mt-3 max-w-2xl text-brand-100">
            Summits, remembrance nights, community outreach and our annual golf tournament — every event brings hope and resources to families in the Central Valley.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Toolbar */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-sand">
            {(["upcoming", "past"] as const).map((t) => (
              <Link
                key={t}
                href={href({ tab: t, view: view === "calendar" ? "grid" : view })}
                className={cn(
                  "rounded-full px-5 py-2 text-sm font-medium capitalize transition",
                  tab === t && view !== "calendar" ? "bg-brand-700 text-white" : "text-slate-600 hover:text-brand-800",
                )}
              >
                {t}
              </Link>
            ))}
          </div>

          <form action="/events" className="flex flex-1 flex-wrap items-center gap-2 lg:max-w-xl lg:justify-end">
            {tab === "past" ? <input type="hidden" name="tab" value="past" /> : null}
            {view !== "grid" ? <input type="hidden" name="view" value={view} /> : null}
            {sp.month && view === "calendar" ? <input type="hidden" name="month" value={sp.month} /> : null}
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search events…"
                className="h-10 w-full rounded-full border border-slate-300 bg-white pl-10 pr-4 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
              />
            </div>
            <select
              name="category"
              defaultValue={category}
              className="h-10 rounded-full border border-slate-300 bg-white px-4 pr-8 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="">All categories</option>
              {EVENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button className="h-10 rounded-full bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">Filter</button>
          </form>

          <div className="inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-sand">
            {[
              { v: "grid", icon: <LayoutGrid className="size-4" />, label: "Grid" },
              { v: "list", icon: <List className="size-4" />, label: "List" },
              { v: "calendar", icon: <CalendarDays className="size-4" />, label: "Calendar" },
            ].map((o) => (
              <Link
                key={o.v}
                href={href({ view: o.v })}
                aria-label={`${o.label} view`}
                className={cn("flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition", view === o.v ? "bg-brand-50 text-brand-800" : "text-slate-500 hover:text-brand-800")}
              >
                {o.icon}
                <span className="hidden sm:inline">{o.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {(q || category) && (
          <p className="mt-4 text-sm text-slate-500">
            {view === "calendar" ? cards.length : total} result{(view === "calendar" ? cards.length : total) === 1 ? "" : "s"}
            {q ? ` for “${q}”` : ""}
            {category ? ` in ${category}` : ""} ·{" "}
            <Link href={href({ q: "", category: "" })} className="font-medium text-brand-700 hover:underline">
              Clear filters
            </Link>
          </p>
        )}

        <div className="mt-8">
          {view === "calendar" ? (
            <MonthCalendar
              month={monthDate}
              makeHref={(ym) => href({ view: "calendar", month: ym })}
              items={cards.map((c) => ({
                id: c.slug,
                date: c.startAt,
                title: c.title,
                href: `/events/${c.slug}`,
                tone: (c.endAt ?? c.startAt) < now ? "gray" : c.category === "Fundraiser" ? "accent" : "brand",
              }))}
            />
          ) : cards.length === 0 ? (
            <div className="rounded-2xl border border-sand bg-white">
              <EmptyState
                icon={<CalendarDays className="size-6" />}
                title={tab === "upcoming" ? "No upcoming events right now" : "No past events found"}
                description={tab === "upcoming" ? "New events are added regularly — check back soon, or browse our past events." : "Try a different search or category."}
                action={
                  tab === "upcoming" ? (
                    <LinkButton href={href({ tab: "past", q: "", category: "" })} variant="outline" className="rounded-full">
                      See past events
                    </LinkButton>
                  ) : undefined
                }
              />
            </div>
          ) : view === "list" ? (
            <div className="space-y-3">
              {cards.map((c) => (
                <EventListRow key={c.slug} e={c} past={tab === "past"} />
              ))}
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((c) => (
                <EventGridCard key={c.slug} e={c} past={tab === "past"} />
              ))}
            </div>
          )}
        </div>

        {tab === "past" && view !== "calendar" && pageCount > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            {page > 1 ? (
              <LinkButton href={href({ page: String(page - 1) })} variant="outline" size="sm" className="rounded-full">
                ← Newer
              </LinkButton>
            ) : null}
            <span className="px-3 text-sm text-slate-500">
              Page {page} of {pageCount}
            </span>
            {page < pageCount ? (
              <LinkButton href={href({ page: String(page + 1) })} variant="outline" size="sm" className="rounded-full">
                Older →
              </LinkButton>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
