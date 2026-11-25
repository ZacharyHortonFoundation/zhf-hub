import Link from "next/link";
import { format, startOfDay, startOfMonth, startOfYear, subDays, subMonths, subYears } from "date-fns";
import { AlertTriangle, CalendarDays, CheckSquare, Clock, DollarSign, HandHeart, Heart, Plus, Repeat, UserPlus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, LinkButton, PageHeader, Progress, Stat } from "@/components/ui";
import { DonutChart, GivingTrendChart, HBarChart } from "@/components/admin/charts";
import { delta, fmtDate, fullName, money, moneyCompact, pct } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const sum = (rows: { amountCents: number }[]) => rows.reduce((a, r) => a + r.amountCents, 0);

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = subDays(today, 1);
  const dayBefore = subDays(today, 2);
  const monthStart = startOfMonth(now);
  const lastMonthStart = subMonths(monthStart, 1);
  const lastMonthSamePoint = subMonths(now, 1);
  const yearStart = startOfYear(now);
  const lastYearStart = subYears(yearStart, 1);
  const lastYearSamePoint = subYears(now, 1);

  const gifts = await db.donation.findMany({
    where: { status: "SUCCEEDED", receivedAt: { gte: lastYearStart } },
    select: { amountCents: true, receivedAt: true, contactId: true, campaignId: true },
  });
  const inRange = (a: Date, b: Date) => gifts.filter((g) => g.receivedAt >= a && g.receivedAt < b);

  const todayG = inRange(today, now);
  const yestG = inRange(yesterday, today);
  const dayBeforeG = inRange(dayBefore, yesterday);
  const monthG = inRange(monthStart, now);
  const lastMonthG = inRange(lastMonthStart, lastMonthSamePoint);
  const yearG = inRange(yearStart, now);
  const lastYearG = inRange(lastYearStart, lastYearSamePoint);
  const lastYearFull = inRange(lastYearStart, yearStart);
  const donorsYTD = new Set(yearG.map((g) => g.contactId)).size;
  const donorsLY = new Set(lastYearG.map((g) => g.contactId)).size;
  const avgYTD = yearG.length ? Math.round(sum(yearG) / yearG.length) : 0;
  const avgLY = lastYearG.length ? Math.round(sum(lastYearG) / lastYearG.length) : 0;

  // monthly trend
  const trend = Array.from({ length: 12 }, (_, m) => ({
    month: format(new Date(now.getFullYear(), m, 1), "MMM"),
    current: m <= now.getMonth() ? sum(yearG.filter((g) => g.receivedAt.getMonth() === m)) / 100 : (null as unknown as number),
    previous: sum(lastYearFull.filter((g) => g.receivedAt.getMonth() === m)) / 100,
  }));

  const [campaigns, levels, recent, upcomingEvents, shifts, pendingApps, pendingHours, pastDue, tasks, activePlans, topDonors] = await Promise.all([
    db.campaign.findMany({ select: { id: true, name: true } }),
    db.contact.groupBy({ by: ["donorLevel"], where: { donorLevel: { not: null } }, _count: true }),
    db.donation.findMany({
      where: { status: "SUCCEEDED" },
      orderBy: { receivedAt: "desc" },
      take: 7,
      include: { contact: true, campaign: true },
    }),
    db.event.findMany({
      where: { status: "PUBLISHED", startAt: { gte: today } },
      orderBy: { startAt: "asc" },
      take: 4,
      include: { attendees: { where: { order: { status: "PAID" } }, select: { id: true, ticketType: { select: { countsTowardCapacity: true } } } } },
    }),
    db.shift.findMany({
      where: { startAt: { gte: now, lte: new Date(now.getTime() + 30 * 864e5) } },
      orderBy: { startAt: "asc" },
      take: 30,
      include: { opportunity: { select: { id: true, title: true } }, _count: { select: { registrations: { where: { status: "REGISTERED" } } } } },
    }),
    db.volunteerApplication.count({ where: { status: "PENDING" } }),
    db.volunteerHour.count({ where: { status: "PENDING" } }),
    db.recurringPlan.count({ where: { status: "PAST_DUE" } }),
    db.activity.findMany({ where: { type: "TASK", done: false }, orderBy: { dueAt: "asc" }, take: 5, include: { contact: true } }),
    db.recurringPlan.findMany({ where: { status: "ACTIVE" }, select: { amountCents: true, frequency: true } }),
    db.contact.findMany({ where: { lifetimeCents: { gt: 0 } }, orderBy: { lifetimeCents: "desc" }, take: 5 }),
  ]);

  const campName = Object.fromEntries(campaigns.map((c) => [c.id, c.name]));
  const byCampaign = Object.entries(
    yearG.reduce<Record<string, number>>((acc, g) => {
      const k = g.campaignId ?? "none";
      acc[k] = (acc[k] ?? 0) + g.amountCents;
      return acc;
    }, {}),
  )
    .map(([id, cents]) => ({ name: (campName[id] ?? "Unassigned").replace(/^“?Hope Begins Here.*2025.*$/i, "Hope Begins Here 2025"), value: cents / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const levelOrder = ["Platinum", "Gold", "Silver", "Bronze", "Copper"];
  const levelData = levelOrder.map((l) => ({ name: l, value: levels.find((x) => x.donorLevel === l)?._count ?? 0 })).filter((x) => x.value);
  const monthlyEq = activePlans.reduce((a, p) => a + (p.frequency === "MONTHLY" ? p.amountCents : p.frequency === "QUARTERLY" ? p.amountCents / 3 : p.amountCents / 12), 0);
  const needPeople = shifts.filter((s) => s._count.registrations / s.capacity < 0.6).slice(0, 4);

  const hour = now.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        title={`${greet}, ${staff.name.split(" ")[0]}`}
        description={`Here's what's happening at ZHF · ${format(now, "EEEE, MMMM d")}`}
        actions={
          <>
            <LinkButton href="/admin/donations/new" variant="outline">
              <Plus className="size-4" /> Record gift
            </LinkButton>
            <LinkButton href="/admin/constituents/new">
              <Plus className="size-4" /> New constituent
            </LinkButton>
          </>
        }
      />
      {sp.denied ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Your role doesn&apos;t have access to that page.</div>
      ) : null}

      {/* KPI tiles — same measures AHA's dashboard showed */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Today's donations" value={money(sum(todayG))} delta={delta(sum(todayG), sum(yestG))} hint={`vs. yesterday ${money(sum(yestG))}`} icon={<Heart className="size-5" />} href="/admin/donations?range=today" />
        <Stat label="Yesterday's donations" value={money(sum(yestG))} delta={delta(sum(yestG), sum(dayBeforeG))} hint={`vs. previous day ${money(sum(dayBeforeG))}`} icon={<CalendarDays className="size-5" />} />
        <Stat label="This month" value={moneyCompact(sum(monthG))} delta={delta(sum(monthG), sum(lastMonthG))} hint={`vs. same point last month ${moneyCompact(sum(lastMonthG))}`} icon={<DollarSign className="size-5" />} href="/admin/donations?range=month" />
        <Stat label="This year" value={moneyCompact(sum(yearG))} delta={delta(sum(yearG), sum(lastYearG))} hint={`vs. same point last year ${moneyCompact(sum(lastYearG))}`} icon={<DollarSign className="size-5" />} href="/admin/donations?range=year" />
        <Stat label="Average gift (YTD)" value={money(avgYTD, { decimals: false })} delta={delta(avgYTD, avgLY)} hint={`last year ${money(avgLY, { decimals: false })}`} icon={<Heart className="size-5" />} />
        <Stat label="Donors this year" value={donorsYTD} delta={delta(donorsYTD, donorsLY)} hint={`vs. ${donorsLY} at this point last year`} icon={<Users className="size-5" />} href="/admin/constituents?filter=donors-ytd" />
      </div>

      {/* Work queue */}
      {(pendingApps || pendingHours || pastDue || tasks.length) > 0 ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QueueItem href="/admin/volunteers/applications" icon={<UserPlus className="size-4" />} label="Volunteer applications" count={pendingApps} />
          <QueueItem href="/admin/volunteers/hours" icon={<Clock className="size-4" />} label="Hours to approve" count={pendingHours} />
          <QueueItem href="/admin/recurring?status=PAST_DUE" icon={<AlertTriangle className="size-4" />} label="Past-due recurring gifts" count={pastDue} tone="red" />
          <QueueItem href="#tasks" icon={<CheckSquare className="size-4" />} label="Open tasks" count={tasks.length} />
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Giving by month" description={`${now.getFullYear()} vs. ${now.getFullYear() - 1}`} action={<LinkButton href="/admin/reports" variant="ghost" size="sm">Reports →</LinkButton>} />
          <CardBody>
            <GivingTrendChart data={trend} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Recurring giving" description="Active monthly-equivalent revenue" />
          <CardBody>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-semibold text-slate-900">{money(Math.round(monthlyEq), { decimals: false })}</p>
              <p className="pb-1 text-sm text-slate-500">/ month</p>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {activePlans.length} active plans · ≈ {moneyCompact(Math.round(monthlyEq * 12))} / year
            </p>
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="mb-3 text-sm font-medium text-slate-700">Donors by level</p>
              <DonutChart data={levelData} />
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Recent gifts" action={<LinkButton href="/admin/donations" variant="ghost" size="sm">All donations →</LinkButton>} />
          <ul className="divide-y divide-slate-100">
            {recent.map((d) => (
              <li key={d.id}>
                <Link href={`/admin/donations/${d.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <Avatar name={fullName(d.contact)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {fullName(d.contact)}
                      {d.anonymous ? <Badge className="ml-2">Anonymous</Badge> : null}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {d.campaign?.name ?? "—"} · {format(d.receivedAt, "MMM d, h:mm a")}
                    </p>
                  </div>
                  {d.frequency !== "ONE_TIME" ? <Repeat className="size-4 text-brand-400" /> : null}
                  <p className="text-sm font-semibold text-slate-900">{money(d.amountCents)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Top campaigns this year" />
          <CardBody>{byCampaign.length ? <HBarChart data={byCampaign} height={220} /> : <EmptyState title="No gifts yet this year" />}</CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Upcoming events" action={<LinkButton href="/admin/events" variant="ghost" size="sm">All →</LinkButton>} />
          <ul className="divide-y divide-slate-100">
            {upcomingEvents.map((e) => {
              const used = e.attendees.filter((a) => a.ticketType.countsTowardCapacity).length;
              return (
                <li key={e.id} className="px-5 py-3">
                  <Link href={`/admin/events/${e.id}`} className="block">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">{e.title}</p>
                      <span className="shrink-0 text-xs text-slate-500">{format(e.startAt, "MMM d")}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <Progress value={e.capacity ? pct(used, e.capacity) : 100} className="flex-1" tone={e.capacity && used >= e.capacity ? "accent" : "brand"} />
                      <span className="text-xs text-slate-500">
                        {used}
                        {e.capacity ? ` / ${e.capacity}` : " registered"}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
            {!upcomingEvents.length ? <EmptyState title="No upcoming events" /> : null}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Shifts that need people" description="Next 30 days" action={<LinkButton href="/admin/volunteers/opportunities" variant="ghost" size="sm">All →</LinkButton>} />
          <ul className="divide-y divide-slate-100">
            {needPeople.map((s) => (
              <li key={s.id} className="px-5 py-3">
                <Link href={`/admin/volunteers/opportunities/${s.opportunity.id}`} className="block">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-slate-900">{s.opportunity.title}</p>
                    <span className="shrink-0 text-xs text-slate-500">{format(s.startAt, "MMM d")}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <Progress value={pct(s._count.registrations, s.capacity)} className="flex-1" tone="green" />
                    <span className="text-xs text-slate-500">
                      {s._count.registrations} / {s.capacity}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
            {!needPeople.length ? <EmptyState icon={<HandHeart className="size-5" />} title="All upcoming shifts are well staffed" /> : null}
          </ul>
        </Card>
        <Card id="tasks">
          <CardHeader title="Top donors (lifetime)" />
          <ul className="divide-y divide-slate-100">
            {topDonors.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/constituents/${c.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50">
                  <Avatar name={fullName(c)} size="sm" />
                  <span className="flex-1 truncate text-sm font-medium text-slate-900">{fullName(c)}</span>
                  {c.donorLevel ? <Badge tone="blue">{c.donorLevel}</Badge> : null}
                  <span className="text-sm font-semibold">{moneyCompact(c.lifetimeCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {tasks.length ? (
            <div className="border-t border-slate-100">
              <p className="px-5 pt-4 text-sm font-semibold text-slate-900">Open tasks</p>
              <ul className="px-2 py-2">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <Link href={`/admin/constituents/${t.contactId}`} className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
                      <CheckSquare className="mt-0.5 size-4 text-slate-400" />
                      <span className="flex-1">
                        <span className="text-slate-800">{t.subject}</span>
                        <span className="block text-xs text-slate-500">
                          {fullName(t.contact)} · due {fmtDate(t.dueAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}

function QueueItem({ href, icon, label, count, tone = "amber" }: { href: string; icon: React.ReactNode; label: string; count: number; tone?: "amber" | "red" }) {
  if (!count) return null;
  return (
    <Link
      href={href}
      className={
        tone === "red"
          ? "flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 hover:bg-red-100"
          : "flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
      }
    >
      {icon}
      <span className="flex-1 font-medium">{label}</span>
      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold">{count}</span>
    </Link>
  );
}
