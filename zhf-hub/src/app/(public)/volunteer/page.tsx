import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, Clock, HandHeart, LogIn, Sparkles, UserPlus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { getVolunteer } from "@/lib/auth";
import { LinkButton } from "@/components/ui";
import { HOLDS_SPOT, PROGRAM_COLORS, hoursSince, shiftTimeLabel, startOfYear } from "@/lib/volunteers";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Volunteer" };

export default async function VolunteerHome() {
  const now = new Date();
  const [vol, shifts, programs, hoursYear, activeVolunteers] = await Promise.all([
    getVolunteer(),
    db.shift.findMany({
      where: { startAt: { gte: now }, opportunity: { status: "PUBLISHED" } },
      orderBy: { startAt: "asc" },
      include: { opportunity: { include: { program: true } }, registrations: { where: { status: { in: HOLDS_SPOT } }, select: { id: true } } },
      take: 30,
    }),
    db.program.findMany({
      orderBy: { name: "asc" },
      include: { opportunities: { where: { status: "PUBLISHED", shifts: { some: { startAt: { gte: now } } } }, select: { id: true } } },
    }),
    hoursSince(startOfYear(now)),
    db.contact.count({ where: { volunteerStatus: "APPROVED" } }),
  ]);
  const seen = new Set<string>();
  const upcoming = shifts
    .filter((s) => s.registrations.length < s.capacity)
    .filter((s) => (seen.has(s.opportunityId) ? false : (seen.add(s.opportunityId), true)))
    .slice(0, 4);

  return (
    <>
      <section className="relative overflow-hidden bg-brand-800 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(114,147,178,.55),transparent_50%),radial-gradient(circle_at_0%_100%,rgba(245,184,63,.18),transparent_45%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 md:py-20">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-200">Volunteer with ZHF</p>
          <h1 className="mx-auto mt-3 max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">Join our volunteer community</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-brand-100">
            Help make a lasting impact. Every hour you give supports meaningful change for young adults and families affected by addiction.
          </p>
          <div className="mx-auto mt-8 flex max-w-md flex-wrap justify-center gap-6 text-left">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/20"><Clock className="size-5" /></span>
              <div>
                <p className="text-2xl font-semibold leading-none">{Math.round(hoursYear).toLocaleString()}</p>
                <p className="text-xs text-brand-200">hours given in {now.getFullYear()}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/20"><Users className="size-5" /></span>
              <div>
                <p className="text-2xl font-semibold leading-none">{activeVolunteers}</p>
                <p className="text-xs text-brand-200">active volunteers</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto -mt-10 grid max-w-4xl gap-4 px-4 sm:grid-cols-2 sm:px-6">
        <Link href="/volunteer/apply" className="group relative rounded-2xl border border-sand bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent/20 text-accent-600 transition group-hover:bg-accent group-hover:text-ink">
            <UserPlus className="size-6" />
          </span>
          <p className="mt-4 text-lg font-semibold text-slate-900">Become a volunteer</p>
          <p className="mt-1 text-sm text-slate-600">A quick 3-step application. We&apos;ll review it within a few days.</p>
          <ArrowRight className="absolute right-6 top-7 size-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-brand-600" />
        </Link>
        <Link
          href={vol ? "/volunteer/portal" : "/volunteer/login"}
          className="group relative rounded-2xl border border-sand bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 transition group-hover:bg-brand-700 group-hover:text-white">
            <LogIn className="size-6" />
          </span>
          <p className="mt-4 text-lg font-semibold text-slate-900">{vol ? `Welcome back, ${vol.name.split(" ")[0]}` : "Existing volunteer"}</p>
          <p className="mt-1 text-sm text-slate-600">{vol ? "Go to your portal — shifts, hours and badges." : "Sign in to sign up for shifts and log your hours."}</p>
          <ArrowRight className="absolute right-6 top-7 size-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-brand-600" />
        </Link>
      </section>

      <section className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-brand-500">Coming up</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-900">Upcoming opportunities</h2>
            </div>
            <Link href="/volunteer/opportunities" className="text-sm font-medium text-brand-700 hover:underline">
              View all →
            </Link>
          </div>
          <div className="mt-6 space-y-3">
            {upcoming.map((s) => {
              const left = s.capacity - s.registrations.length;
              return (
                <Link
                  key={s.id}
                  href={`/volunteer/opportunities/${s.opportunityId}`}
                  className="flex items-center gap-4 rounded-2xl border border-sand bg-white p-4 transition hover:shadow-md"
                >
                  <div className="grid w-14 shrink-0 place-items-center rounded-xl bg-brand-50 py-2 text-center">
                    <p className="text-[10px] font-semibold uppercase text-brand-500">{format(s.startAt, "MMM")}</p>
                    <p className="text-lg font-semibold leading-none text-slate-900">{format(s.startAt, "d")}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{s.opportunity.title}</p>
                    <p className="truncate text-sm text-slate-500">
                      {format(s.startAt, "EEE")} · {shiftTimeLabel(s)} · {s.opportunity.city ?? s.opportunity.location}
                    </p>
                  </div>
                  <span className={cn("shrink-0 text-sm font-medium", left <= Math.max(1, s.capacity * 0.2) ? "text-amber-700" : "text-emerald-700")}>
                    {left} spot{left === 1 ? "" : "s"} left
                  </span>
                </Link>
              );
            })}
            {!upcoming.length && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                All current shifts are full — new opportunities are posted often. <Link href="/volunteer/apply" className="font-medium text-brand-700">Apply now</Link> so you&apos;re ready.
              </div>
            )}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-500">Find your fit</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Our programs</h2>
          <div className="mt-6 grid gap-3">
            {programs.map((p) => (
              <Link
                key={p.id}
                href={`/volunteer/opportunities?program=${p.id}`}
                className="group flex items-start gap-4 rounded-2xl border border-sand bg-white p-4 transition hover:shadow-md"
              >
                <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", PROGRAM_COLORS[p.color] ?? PROGRAM_COLORS.blue)}>
                  {p.name.toLowerCase().includes("virtual") ? <Sparkles className="size-5" /> : <HandHeart className="size-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 group-hover:text-brand-700">{p.name}</p>
                  {p.description ? <p className="mt-0.5 text-sm text-slate-500">{p.description}</p> : null}
                  <p className="mt-1.5 text-xs font-medium text-brand-600">
                    {p.opportunities.length} open opportunit{p.opportunities.length === 1 ? "y" : "ies"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-6 rounded-2xl bg-sand/70 p-5">
            <p className="font-semibold text-slate-900">Questions about volunteering?</p>
            <p className="mt-1 text-sm text-slate-600">Our volunteer coordinator is happy to help you find the right fit.</p>
            <LinkButton href="/volunteer/apply" size="sm" className="mt-4 rounded-full">
              Start your application
            </LinkButton>
          </div>
        </div>
      </section>
    </>
  );
}
