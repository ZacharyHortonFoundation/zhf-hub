import Link from "next/link";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { Card, CardBody, CardHeader, LinkButton, PageHeader, Stat, Table, TD, TH, THead, TR } from "@/components/ui";
import { AutoSubmitSelect } from "@/components/client-ui";
import { ColumnChart, DonutChart, HBarChart } from "@/components/admin/charts";
import { METHOD_LABEL } from "@/lib/constants";
import { delta, fullName, money, moneyCompact, pct } from "@/lib/utils";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const BANDS = [
  { name: "$1–99", min: 0, max: 99_99 },
  { name: "$100–249", min: 100_00, max: 249_99 },
  { name: "$250–999", min: 250_00, max: 999_99 },
  { name: "$1k–4.9k", min: 1000_00, max: 4999_99 },
  { name: "$5k+", min: 5000_00, max: Infinity },
];

export default async function Reports({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  await requireStaff(["ADMIN", "STAFF"]);
  const sp = await searchParams;
  const nowYear = new Date().getFullYear();
  const year = parseInt(sp.year ?? "", 10) || nowYear;
  const ys = new Date(year, 0, 1);
  const ye = new Date(year + 1, 0, 1);
  const pys = new Date(year - 1, 0, 1);

  const [gifts, prevGifts, everBefore, campaigns, funds, orders, hours, firstYear] = await Promise.all([
    db.donation.findMany({ where: { status: "SUCCEEDED", receivedAt: { gte: ys, lt: ye } }, select: { amountCents: true, receivedAt: true, contactId: true, campaignId: true, fundId: true, method: true, source: true, frequency: true } }),
    db.donation.findMany({ where: { status: "SUCCEEDED", receivedAt: { gte: pys, lt: ys } }, select: { amountCents: true, contactId: true } }),
    db.donation.findMany({ where: { status: "SUCCEEDED", receivedAt: { lt: ys } }, select: { contactId: true }, distinct: ["contactId"] }),
    db.campaign.findMany({ select: { id: true, name: true } }),
    db.fund.findMany({ select: { id: true, name: true } }),
    db.eventOrder.findMany({ where: { status: "PAID", event: { startAt: { gte: ys, lt: ye } } }, include: { event: true, _count: { select: { attendees: true } } } }),
    db.volunteerHour.findMany({ where: { status: "APPROVED", date: { gte: ys, lt: ye } }, include: { contact: true, opportunity: { include: { program: true } } } }),
    db.donation.findFirst({ orderBy: { receivedAt: "asc" }, select: { receivedAt: true } }),
  ]);

  const total = gifts.reduce((a, g) => a + g.amountCents, 0);
  const prevTotal = prevGifts.reduce((a, g) => a + g.amountCents, 0);
  const donors = new Set(gifts.map((g) => g.contactId));
  const prevDonors = new Set(prevGifts.map((g) => g.contactId));
  const retained = [...prevDonors].filter((d) => donors.has(d)).length;
  const priorEver = new Set(everBefore.map((d) => d.contactId));
  const newDonors = [...donors].filter((d) => !priorEver.has(d)).length;
  const recurringTotal = gifts.filter((g) => g.frequency !== "ONE_TIME").reduce((a, g) => a + g.amountCents, 0);

  const byMonth = Array.from({ length: 12 }, (_, m) => ({
    name: format(new Date(year, m, 1), "MMM"),
    value: gifts.filter((g) => g.receivedAt.getMonth() === m).reduce((a, g) => a + g.amountCents, 0) / 100,
  }));
  const group = <K extends string | null>(key: (g: (typeof gifts)[number]) => K) => {
    const m = new Map<K, { total: number; count: number; donors: Set<string> }>();
    for (const g of gifts) {
      const k = key(g);
      const cur = m.get(k) ?? { total: 0, count: 0, donors: new Set<string>() };
      cur.total += g.amountCents;
      cur.count++;
      cur.donors.add(g.contactId);
      m.set(k, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  };
  const cName = Object.fromEntries(campaigns.map((c) => [c.id, c.name]));
  const fName = Object.fromEntries(funds.map((f) => [f.id, f.name]));
  const byCampaign = group((g) => g.campaignId);
  const byFund = group((g) => g.fundId);
  const byMethod = group((g) => g.method).map(([k, v]) => ({ name: METHOD_LABEL[k] ?? k, value: v.total / 100 }));

  // donor pyramid: by each donor's total for the year
  const perDonor = new Map<string, number>();
  for (const g of gifts) perDonor.set(g.contactId, (perDonor.get(g.contactId) ?? 0) + g.amountCents);
  const pyramid = BANDS.map((b) => {
    const ds = [...perDonor.values()].filter((v) => v >= b.min && v <= b.max);
    return { ...b, donors: ds.length, total: ds.reduce((a, v) => a + v, 0) };
  });

  const eventRows = Object.values(
    orders.reduce<Record<string, { id: string; title: string; date: Date; revenue: number; attendees: number; orders: number }>>((acc, o) => {
      const r = (acc[o.eventId] ??= { id: o.eventId, title: o.event.title, date: o.event.startAt, revenue: 0, attendees: 0, orders: 0 });
      r.revenue += o.totalCents;
      r.attendees += o._count.attendees;
      r.orders++;
      return acc;
    }, {}),
  ).sort((a, b) => b.revenue - a.revenue || b.attendees - a.attendees);

  const totalHours = hours.reduce((a, h) => a + h.hours, 0);
  const volunteers = new Map<string, { name: string; hours: number }>();
  for (const h of hours) {
    const cur = volunteers.get(h.contactId) ?? { name: fullName(h.contact), hours: 0 };
    cur.hours += h.hours;
    volunteers.set(h.contactId, cur);
  }
  const hoursByProgram = Object.entries(
    hours.reduce<Record<string, number>>((acc, h) => {
      const k = h.opportunity?.program?.name ?? "Other";
      acc[k] = (acc[k] ?? 0) + h.hours;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }));
  const years = Array.from({ length: nowYear - (firstYear?.receivedAt.getFullYear() ?? nowYear) + 1 }, (_, i) => nowYear - i);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Year-at-a-glance for the board, grant reports and planning"
        actions={
          <>
            <form>
              <AutoSubmitSelect name="year" defaultValue={String(year)}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </AutoSubmitSelect>
            </form>
            <LinkButton href={`/admin/donations/export?range=custom&from=${year}-01-01&to=${year}-12-31`} variant="outline" prefetch={false}>
              <Download className="size-4" /> Gifts CSV
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={`Total raised ${year}`} value={moneyCompact(total)} delta={delta(total, prevTotal)} hint={`vs. ${moneyCompact(prevTotal)} in ${year - 1}`} />
        <Stat label="Donors" value={donors.size} delta={delta(donors.size, prevDonors.size)} hint={`${newDonors} new this year`} />
        <Stat label="Donor retention" value={`${pct(retained, prevDonors.size)}%`} hint={`${retained} of ${prevDonors.size} ${year - 1} donors gave again`} />
        <Stat label="Recurring share" value={`${pct(recurringTotal, total)}%`} hint={`${moneyCompact(recurringTotal)} from recurring gifts`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Giving by month" />
          <CardBody>
            <ColumnChart data={byMonth} height={260} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="By payment method" />
          <CardBody>
            <DonutChart data={byMethod} money />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="By campaign" />
          <Table>
            <THead>
              <tr>
                <TH>Campaign</TH>
                <TH className="text-right">Donors</TH>
                <TH className="text-right">Gifts</TH>
                <TH className="text-right">Total</TH>
              </tr>
            </THead>
            <tbody>
              {byCampaign.map(([id, v]) => (
                <TR key={id ?? "none"}>
                  <TD className="max-w-[240px] truncate">{id ? <Link href={`/admin/campaigns/${id}`} className="hover:text-brand-700">{cName[id]}</Link> : "Unassigned"}</TD>
                  <TD className="text-right">{v.donors.size}</TD>
                  <TD className="text-right">{v.count}</TD>
                  <TD className="text-right font-semibold">{money(v.total)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="By fund (designation)" />
          <Table>
            <THead>
              <tr>
                <TH>Fund</TH>
                <TH className="text-right">Gifts</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Share</TH>
              </tr>
            </THead>
            <tbody>
              {byFund.map(([id, v]) => (
                <TR key={id ?? "none"}>
                  <TD>{id ? fName[id] : "Unassigned"}</TD>
                  <TD className="text-right">{v.count}</TD>
                  <TD className="text-right font-semibold">{money(v.total)}</TD>
                  <TD className="text-right text-slate-500">{pct(v.total, total)}%</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Gift pyramid" description="Donors grouped by their total giving this year" />
          <Table>
            <THead>
              <tr>
                <TH>Range</TH>
                <TH className="text-right">Donors</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">% of revenue</TH>
              </tr>
            </THead>
            <tbody>
              {[...pyramid].reverse().map((b) => (
                <TR key={b.name}>
                  <TD className="font-medium">{b.name}</TD>
                  <TD className="text-right">{b.donors}</TD>
                  <TD className="text-right">{money(b.total)}</TD>
                  <TD className="text-right text-slate-500">{pct(b.total, total)}%</TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <CardBody className="border-t border-slate-100 text-sm text-slate-600">
            Follow up with lapsed donors:{" "}
            <Link href="/admin/constituents?filter=lybunt" className="font-medium text-brand-700 hover:underline">
              LYBUNT list →
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={`Events in ${year}`} />
          <Table>
            <THead>
              <tr>
                <TH>Event</TH>
                <TH className="text-right">Attendees</TH>
                <TH className="text-right">Revenue</TH>
              </tr>
            </THead>
            <tbody>
              {eventRows.map((e) => (
                <TR key={e.id}>
                  <TD>
                    <Link href={`/admin/events/${e.id}`} className="font-medium hover:text-brand-700">
                      {e.title}
                    </Link>
                    <span className="block text-xs text-slate-400">{format(e.date, "MMM d")}</span>
                  </TD>
                  <TD className="text-right">{e.attendees}</TD>
                  <TD className="text-right font-semibold">{e.revenue ? money(e.revenue) : "Free"}</TD>
                </TR>
              ))}
              {!eventRows.length ? (
                <TR>
                  <TD colSpan={3} className="text-center text-slate-500">
                    No events this year
                  </TD>
                </TR>
              ) : null}
            </tbody>
          </Table>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Volunteer impact" />
          <CardBody>
            <p className="text-3xl font-semibold text-slate-900">{Math.round(totalHours).toLocaleString()} hours</p>
            <p className="text-sm text-slate-500">
              from {volunteers.size} volunteers · ≈ {money(Math.round(totalHours * 34.79 * 100), { decimals: false })} in donated time*
            </p>
            <p className="mt-3 text-xs text-slate-400">*Independent Sector value of a volunteer hour (2024 national estimate, $34.79). Update for grant reports as needed.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Hours by program" />
          <CardBody>{hoursByProgram.length ? <DonutChart data={hoursByProgram} /> : <p className="text-sm text-slate-500">No approved hours yet.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Top volunteers" />
          <CardBody>
            <HBarChart data={[...volunteers.values()].sort((a, b) => b.hours - a.hours).slice(0, 6).map((v) => ({ name: v.name, value: v.hours }))} money={false} height={200} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
