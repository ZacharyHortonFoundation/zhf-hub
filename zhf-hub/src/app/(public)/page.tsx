import Link from "next/link";
import { ArrowRight, CalendarDays, HandHeart, Heart, MapPin, ShieldCheck, Users } from "lucide-react";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { LinkButton, Progress } from "@/components/ui";
import { fmtDate, money, pct } from "@/lib/utils";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const now = new Date();
  const settings = await getSettings();
  const [events, campaign, shifts] = await Promise.all([
    db.event.findMany({
      where: { status: "PUBLISHED", startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: 3,
    }),
    db.campaign.findFirst({
      where: { active: true, goalCents: { not: null }, OR: [{ endDate: null }, { endDate: { gte: now } }], startDate: { lte: now } },
      orderBy: { goalCents: "desc" },
    }),
    db.shift.findMany({
      where: { startAt: { gte: now }, opportunity: { status: "PUBLISHED" } },
      orderBy: { startAt: "asc" },
      include: { opportunity: true, _count: { select: { registrations: { where: { status: "REGISTERED" } } } } },
      take: 12,
    }),
  ]);
  const raised = campaign
    ? (await db.donation.aggregate({ where: { campaignId: campaign.id, status: "SUCCEEDED" }, _sum: { amountCents: true } }))._sum.amountCents ?? 0
    : 0;
  const donors = campaign ? (await db.donation.groupBy({ by: ["contactId"], where: { campaignId: campaign.id, status: "SUCCEEDED" } })).length : 0;
  const seenOpp = new Set<string>();
  const opps = shifts.filter((s) => (seenOpp.has(s.opportunityId) ? false : (seenOpp.add(s.opportunityId), true))).slice(0, 3);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-800 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(114,147,178,.55),transparent_50%),radial-gradient(circle_at_90%_90%,rgba(245,184,63,.22),transparent_45%)]" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1.2fr_1fr] md:py-24">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-200">{settings.orgName}</p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.1] sm:text-5xl">
              Breaking the stigma
              <br />
              of <span className="relative whitespace-nowrap">addiction<span className="absolute -bottom-1 left-0 h-1.5 w-full rounded-full bg-accent/80" /></span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-brand-100">
              In memory of Zachary John Horton, we provide resources, support and hope for young adults and families affected by addiction. Here&apos;s how you can be part of it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/donate" variant="accent" size="lg" className="rounded-full">
                <Heart className="size-5 fill-current" /> Give today
              </LinkButton>
              <LinkButton href="/volunteer" variant="white" size="lg" className="rounded-full">
                Volunteer with us
              </LinkButton>
            </div>
          </div>

          {campaign ? (
            <div className="self-end rounded-3xl bg-white/10 p-6 ring-1 ring-white/20 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">Current campaign</p>
              <p className="mt-2 text-xl font-semibold">{campaign.name}</p>
              {campaign.description ? <p className="mt-1 text-sm text-brand-100">{campaign.description}</p> : null}
              <div className="mt-6 flex items-end justify-between">
                <div>
                  <p className="text-3xl font-semibold">{money(raised, { decimals: false })}</p>
                  <p className="text-sm text-brand-200">raised of {money(campaign.goalCents, { decimals: false })} goal</p>
                </div>
                <p className="text-sm text-brand-100">{donors} donors</p>
              </div>
              <Progress value={pct(raised, campaign.goalCents ?? 0)} tone="accent" className="mt-3 h-2.5 bg-white/15" />
              <LinkButton href={`/donate?campaign=${campaign.slug}`} variant="white" className="mt-6 w-full rounded-full">
                Support this campaign <ArrowRight className="size-4" />
              </LinkButton>
            </div>
          ) : null}
        </div>
      </section>

      {/* Three ways */}
      <section className="mx-auto -mt-10 grid max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-3">
        {[
          { href: "/donate", icon: <Heart className="size-6" />, title: "Donate", text: "One-time or monthly gifts fund outreach, Narcan, recovery scholarships and family support." },
          { href: "/events", icon: <CalendarDays className="size-6" />, title: "Attend an event", text: "Summits, remembrance nights, our golf tournament and community outreach days." },
          { href: "/volunteer", icon: <HandHeart className="size-6" />, title: "Volunteer", text: "Deliver care packages, staff a booth, or lend your design, social or web skills." },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="group relative rounded-2xl border border-sand bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
            <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 transition group-hover:bg-brand-700 group-hover:text-white">{c.icon}</span>
            <p className="mt-4 text-lg font-semibold text-slate-900">{c.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{c.text}</p>
            <ArrowRight className="absolute right-6 top-7 size-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-brand-600" />
          </Link>
        ))}
      </section>

      {/* Upcoming events */}
      <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-500">Join us</p>
            <h2 className="mt-1 text-3xl font-semibold text-slate-900">Upcoming events</h2>
          </div>
          <Link href="/events" className="hidden text-sm font-medium text-brand-700 hover:underline sm:block">
            All events →
          </Link>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {events.map((e) => (
            <Link key={e.id} href={`/events/${e.slug}`} className="group overflow-hidden rounded-2xl border border-sand bg-white transition hover:shadow-lg">
              <div className="relative h-36 bg-gradient-to-br from-brand-600 to-brand-800">
                {e.imageUrl ? <img src={e.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
                <div className="absolute left-4 top-4 rounded-xl bg-white px-3 py-1.5 text-center shadow">
                  <p className="text-[10px] font-semibold uppercase text-brand-500">{format(e.startAt, "MMM")}</p>
                  <p className="text-xl font-semibold leading-none text-slate-900">{format(e.startAt, "d")}</p>
                </div>
                <span className="absolute bottom-3 left-4 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur">{e.category}</span>
              </div>
              <div className="p-5">
                <p className="font-semibold text-slate-900 group-hover:text-brand-700">{e.title}</p>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
                  <MapPin className="size-3.5" /> {e.venueName ?? e.city} · {format(e.startAt, "EEE h:mm a")}
                </p>
              </div>
            </Link>
          ))}
          {!events.length && <p className="text-slate-500">New events are coming soon.</p>}
        </div>
      </section>

      {/* Volunteer */}
      <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-8 rounded-3xl bg-sand/70 p-5 sm:p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:p-12">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-500">Volunteer</p>
            <h2 className="mt-1 text-3xl font-semibold text-slate-900">Show up for someone today</h2>
            <p className="mt-3 text-slate-600">Every hour you give supports meaningful change. Sign up for a single shift or make it a habit — we&apos;ll track your hours and celebrate your milestones.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <LinkButton href="/volunteer/apply" className="rounded-full">Become a volunteer</LinkButton>
              <LinkButton href="/volunteer/opportunities" variant="outline" className="rounded-full">Browse opportunities</LinkButton>
            </div>
          </div>
          <div className="min-w-0 space-y-3">
            {opps.map((s) => {
              const left = Math.max(0, s.capacity - s._count.registrations);
              return (
                <Link key={s.id} href={`/volunteer/opportunities/${s.opportunityId}`} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm transition hover:shadow-md">
                  <div className="grid w-14 shrink-0 place-items-center rounded-xl bg-brand-50 py-2 text-center">
                    <p className="text-[10px] font-semibold uppercase text-brand-500">{format(s.startAt, "MMM")}</p>
                    <p className="text-lg font-semibold leading-none text-slate-900">{format(s.startAt, "d")}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{s.opportunity.title}</p>
                    <p className="text-sm text-slate-500">{format(s.startAt, "h:mm a")} · {s.opportunity.city}</p>
                  </div>
                  <span className={left ? "text-sm font-medium text-emerald-700" : "text-sm font-medium text-slate-400"}>{left ? `${left} spots left` : "Full"}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
        <div className="grid gap-6 text-center sm:grid-cols-3">
          {[
            { icon: <ShieldCheck className="size-6" />, title: "Secure giving", text: "Payments are processed by Stripe. We never see or store your card number." },
            { icon: <Users className="size-6" />, title: "Local impact", text: "Your support stays in the Central Valley — Fresno, Clovis and beyond." },
            { icon: <Heart className="size-6" />, title: "Tax-deductible", text: `${settings.orgName} is a 501(c)(3). You'll get a receipt by email instantly.` },
          ].map((t) => (
            <div key={t.title} className="rounded-2xl p-4">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-white text-brand-600 shadow-sm">{t.icon}</span>
              <p className="mt-3 font-semibold text-slate-900">{t.title}</p>
              <p className="mt-1 text-sm text-slate-600">{t.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">Updated {fmtDate(now)}</p>
      </section>
    </>
  );
}
