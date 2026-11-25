import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { CalendarDays, LayoutGrid, List, Search } from "lucide-react";
import { db } from "@/lib/db";
import { MonthCalendar, type CalendarItem } from "@/components/month-calendar";
import { OpportunityCard } from "@/components/volunteer/opportunity-card";
import { AutoSubmitSelect } from "@/components/client-ui";
import { buttonClass } from "@/components/ui";
import { shiftFilled, shiftsWithSpots, summarizeOpportunity } from "@/lib/volunteers";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Volunteer opportunities" };

type SP = {
  view?: string;
  month?: string;
  q?: string;
  program?: string;
  skill?: string;
  setting?: string;
  accessible?: string;
  show?: string;
};

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const view = sp.view === "list" || sp.view === "calendar" ? sp.view : "grid";
  const includePast = sp.show === "past";
  const now = new Date();

  const where: Prisma.OpportunityWhereInput = { status: "PUBLISHED" };
  const and: Prisma.OpportunityWhereInput[] = [];
  if (sp.q) and.push({ OR: [{ title: { contains: sp.q } }, { summary: { contains: sp.q } }, { city: { contains: sp.q } }] });
  if (sp.program) and.push({ programId: sp.program });
  if (sp.skill) and.push({ skills: { some: { id: sp.skill } } });
  if (sp.setting) and.push({ setting: sp.setting });
  if (sp.accessible === "1") and.push({ wheelchairAccessible: true });
  if (and.length) where.AND = and;

  const [opps, programs, skills] = await Promise.all([
    db.opportunity.findMany({ where, include: { program: true, shifts: shiftsWithSpots } }),
    db.program.findMany({ orderBy: { name: "asc" } }),
    db.skill.findMany({ orderBy: { name: "asc" } }),
  ]);

  const withSummary = opps.map((o) => ({ o, s: summarizeOpportunity(o, now) }));
  const upcoming = withSummary
    .filter((x) => x.s.upcomingCount > 0)
    .sort((a, b) => (a.s.nextShift!.startAt.getTime() - b.s.nextShift!.startAt.getTime()));
  const past = withSummary
    .filter((x) => x.s.upcomingCount === 0 && x.o.shifts.length)
    .sort((a, b) => (b.s.firstStart?.getTime() ?? 0) - (a.s.firstStart?.getTime() ?? 0));
  const list = includePast ? [...upcoming, ...past] : upcoming;

  const month = (() => {
    if (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) {
      const [y, m] = sp.month.split("-").map(Number);
      return new Date(y!, m! - 1, 1);
    }
    const first = upcoming[0]?.s.nextShift?.startAt ?? now;
    return new Date(first.getFullYear(), first.getMonth(), 1);
  })();

  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/volunteer/opportunities?${s}` : "/volunteer/opportunities";
  };

  const calendarItems: CalendarItem[] = opps.flatMap((o) =>
    o.shifts.map((s) => {
      const full = shiftFilled(s) >= s.capacity;
      return {
        id: s.id,
        date: s.startAt,
        title: o.title,
        href: `/volunteer/opportunities/${o.id}`,
        tone: s.startAt < now ? ("gray" as const) : full ? ("accent" as const) : ("brand" as const),
      };
    }),
  );

  const filtersActive = !!(sp.q || sp.program || sp.skill || sp.setting || sp.accessible);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/volunteer" className="text-sm font-medium text-brand-600 hover:underline">
            ← Volunteer home
          </Link>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Volunteer opportunities</h1>
          <p className="mt-1 text-slate-600">Find a shift that fits your schedule and skills.</p>
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {[
            { v: "grid", label: "Grid", icon: <LayoutGrid className="size-4" /> },
            { v: "list", label: "List", icon: <List className="size-4" /> },
            { v: "calendar", label: "Calendar", icon: <CalendarDays className="size-4" /> },
          ].map((t) => (
            <Link
              key={t.v}
              href={qs({ view: t.v === "grid" ? undefined : t.v, month: undefined })}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                view === t.v ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {t.icon} {t.label}
            </Link>
          ))}
        </div>
      </div>

      <form className="mt-6 grid gap-3 rounded-2xl border border-sand bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto]" action="/volunteer/opportunities">
        {view !== "grid" ? <input type="hidden" name="view" value={view} /> : null}
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="Search opportunities…"
            className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
        </label>
        <AutoSubmitSelect name="program" defaultValue={sp.program ?? ""} aria-label="Program">
          <option value="">All programs</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="skill" defaultValue={sp.skill ?? ""} aria-label="Skill">
          <option value="">All skills</option>
          {skills.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="setting" defaultValue={sp.setting ?? ""} aria-label="Indoor or outdoor">
          <option value="">Indoor / outdoor / virtual</option>
          <option value="INDOOR">Indoor</option>
          <option value="OUTDOOR">Outdoor</option>
          <option value="VIRTUAL">Virtual</option>
        </AutoSubmitSelect>
        <button type="submit" className={buttonClass("primary", "md")}>
          Search
        </button>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm sm:col-span-2 lg:col-span-5">
          <label className="flex items-center gap-2 text-slate-700">
            <input type="checkbox" name="accessible" value="1" defaultChecked={sp.accessible === "1"} className="size-4 accent-brand-600" />
            Wheelchair accessible
          </label>
          {view !== "calendar" ? (
            <label className="flex items-center gap-2 text-slate-700">
              <input type="checkbox" name="show" value="past" defaultChecked={includePast} className="size-4 accent-brand-600" />
              Include past opportunities
            </label>
          ) : null}
          {filtersActive ? (
            <Link href={view === "grid" ? "/volunteer/opportunities" : `/volunteer/opportunities?view=${view}`} className="text-brand-700 hover:underline">
              Clear filters
            </Link>
          ) : null}
          <span className="ml-auto text-slate-500">
            {view === "calendar" ? `${calendarItems.length} shifts` : `${list.length} opportunit${list.length === 1 ? "y" : "ies"}`}
          </span>
        </div>
      </form>

      <div className="mt-6">
        {view === "calendar" ? (
          <MonthCalendar month={month} items={calendarItems} makeHref={(ym) => qs({ month: ym })} />
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <p className="font-medium text-slate-900">No opportunities match your filters</p>
            <p className="mt-1 text-sm text-slate-500">Try clearing a filter{includePast ? "" : " or include past opportunities"}.</p>
          </div>
        ) : view === "list" ? (
          <div className="space-y-3">
            {list.map(({ o }) => (
              <OpportunityCard key={o.id} opp={o} layout="list" />
            ))}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {list.map(({ o }) => (
              <OpportunityCard key={o.id} opp={o} />
            ))}
          </div>
        )}
        {view !== "calendar" && !includePast && past.length > 0 ? (
          <p className="mt-6 text-center text-sm text-slate-500">
            <Link href={qs({ show: "past" })} className="font-medium text-brand-700 hover:underline">
              Show {past.length} past opportunit{past.length === 1 ? "y" : "ies"}
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
