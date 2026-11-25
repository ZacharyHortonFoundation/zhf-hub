import Link from "next/link";
import { notFound } from "next/navigation";
import { format, startOfWeek } from "date-fns";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { Card, CardBody, CardHeader, LinkButton, PageHeader, Progress, Table, TD, TH, THead, TR } from "@/components/ui";
import { CopyButton } from "@/components/client-ui";
import { ColumnChart } from "@/components/admin/charts";
import { CampaignForm } from "@/components/admin/campaign-form";
import { appUrl } from "@/lib/payments";
import { fmtDate, fullName, money, pct } from "@/lib/utils";
import { saveCampaign } from "../actions";

export const dynamic = "force-dynamic";

export default async function CampaignDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff(["ADMIN", "STAFF"]);
  const { id } = await params;
  const c = await db.campaign.findUnique({ where: { id } });
  if (!c) notFound();
  const gifts = await db.donation.findMany({ where: { campaignId: id, status: "SUCCEEDED" }, orderBy: { receivedAt: "desc" }, include: { contact: true } });
  const raised = gifts.reduce((a, g) => a + g.amountCents, 0);
  const donors = new Map<string, { name: string; total: number; count: number }>();
  for (const g of gifts) {
    const cur = donors.get(g.contactId) ?? { name: fullName(g.contact), total: 0, count: 0 };
    cur.total += g.amountCents;
    cur.count++;
    donors.set(g.contactId, cur);
  }
  const top = [...donors.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 10);
  const weekly = new Map<string, number>();
  for (const g of [...gifts].reverse()) {
    const k = format(startOfWeek(g.receivedAt), "MMM d");
    weekly.set(k, (weekly.get(k) ?? 0) + g.amountCents / 100);
  }
  const weeklyData = [...weekly.entries()].slice(-16).map(([name, value]) => ({ name, value }));
  const link = `${appUrl()}/donate?campaign=${c.slug}`;

  return (
    <>
      <PageHeader
        title={c.name}
        breadcrumbs={[{ label: "Campaigns", href: "/admin/campaigns" }, { label: c.name }]}
        description={c.startDate ? `${fmtDate(c.startDate)} – ${fmtDate(c.endDate)}` : "Ongoing campaign"}
        actions={<LinkButton href={`/admin/donations?campaign=${c.id}`} variant="outline">View gifts</LinkButton>}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { l: "Raised", v: money(raised) },
          { l: "Goal", v: c.goalCents ? money(c.goalCents) : "—" },
          { l: "Donors", v: donors.size },
          { l: "Average gift", v: money(gifts.length ? Math.round(raised / gifts.length) : 0, { decimals: false }) },
        ].map((s) => (
          <Card key={s.l} className="px-4 py-3">
            <p className="text-xs text-slate-500">{s.l}</p>
            <p className="text-xl font-semibold">{s.v}</p>
          </Card>
        ))}
      </div>
      {c.goalCents ? (
        <Card className="mb-6 p-5">
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-medium text-slate-700">{pct(raised, c.goalCents)}% of goal</span>
            <span className="text-slate-500">{money(Math.max(0, c.goalCents - raised))} to go</span>
          </div>
          <Progress value={pct(raised, c.goalCents)} className="h-3" tone={raised >= c.goalCents ? "green" : "brand"} />
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Gifts by week" />
            <CardBody>{weeklyData.length ? <ColumnChart data={weeklyData} /> : <p className="text-sm text-slate-500">No gifts yet.</p>}</CardBody>
          </Card>
          <Card>
            <CardHeader title="Top donors" />
            <Table>
              <THead>
                <tr>
                  <TH>Donor</TH>
                  <TH className="text-right">Gifts</TH>
                  <TH className="text-right">Total</TH>
                </tr>
              </THead>
              <tbody>
                {top.map(([cid, d]) => (
                  <TR key={cid}>
                    <TD>
                      <Link href={`/admin/constituents/${cid}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {d.name}
                      </Link>
                    </TD>
                    <TD className="text-right">{d.count}</TD>
                    <TD className="text-right font-semibold">{money(d.total)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Share this campaign" description="Gifts through this link are credited automatically." />
            <CardBody className="space-y-3">
              <p className="break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">{link}</p>
              <CopyButton text={link}>Copy donate link</CopyButton>
            </CardBody>
          </Card>
          <CampaignForm action={saveCampaign.bind(null, c.id)} campaign={c} />
        </div>
      </div>
    </>
  );
}
