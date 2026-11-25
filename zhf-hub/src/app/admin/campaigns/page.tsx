import Link from "next/link";
import { Plus, Target } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { Badge, Card, CardBody, CardHeader, Checkbox, EmptyState, Field, Input, LinkButton, PageHeader, Progress, Table, TD, TH, THead, TR } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";
import { cn, fmtDate, money, pct } from "@/lib/utils";
import { saveFund } from "./actions";

export const metadata = { title: "Campaigns & funds" };
export const dynamic = "force-dynamic";

export default async function Campaigns({ searchParams }: { searchParams: Promise<{ tab?: string; show?: string }> }) {
  await requireStaff(["ADMIN", "STAFF"]);
  const sp = await searchParams;
  const tab = sp.tab === "funds" ? "funds" : "campaigns";
  const [campaigns, funds, byCampaign, byFund] = await Promise.all([
    db.campaign.findMany({ where: sp.show === "all" ? {} : { active: true }, orderBy: [{ isDefault: "desc" }, { startDate: { sort: "desc", nulls: "last" } }] }),
    db.fund.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    db.donation.groupBy({ by: ["campaignId"], where: { status: "SUCCEEDED" }, _sum: { amountCents: true }, _count: true }),
    db.donation.groupBy({ by: ["fundId"], where: { status: "SUCCEEDED" }, _sum: { amountCents: true }, _count: true }),
  ]);
  const cStats = Object.fromEntries(byCampaign.map((r) => [r.campaignId, r]));
  const fStats = Object.fromEntries(byFund.map((r) => [r.fundId, r]));
  const inactive = await db.campaign.count({ where: { active: false } });

  return (
    <>
      <PageHeader
        title="Campaigns & funds"
        description="Campaigns track why people gave; funds (designations) track where the money goes."
        actions={tab === "campaigns" ? <LinkButton href="/admin/campaigns/new"><Plus className="size-4" /> New campaign</LinkButton> : null}
      />
      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {[
          { k: "campaigns", l: "Campaigns" },
          { k: "funds", l: "Funds / designations" },
        ].map((t) => (
          <Link key={t.k} href={`?tab=${t.k}`} className={cn("-mb-px border-b-2 px-4 py-2.5 text-sm font-medium", tab === t.k ? "border-brand-600 text-brand-800" : "border-transparent text-slate-500 hover:text-slate-800")}>
            {t.l}
          </Link>
        ))}
      </div>

      {tab === "campaigns" ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {campaigns.map((c) => {
              const raised = cStats[c.id]?._sum.amountCents ?? 0;
              return (
                <Link key={c.id} href={`/admin/campaigns/${c.id}`}>
                  <Card className="h-full p-5 transition hover:border-brand-200 hover:shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-900">{c.name}</p>
                      {c.isDefault ? <Badge tone="blue">Default</Badge> : !c.active ? <Badge>Inactive</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {c.startDate ? `${fmtDate(c.startDate)} – ${fmtDate(c.endDate)}` : "Ongoing"}
                    </p>
                    <p className="mt-4 text-2xl font-semibold text-slate-900">{money(raised)}</p>
                    <p className="text-sm text-slate-500">
                      {cStats[c.id]?._count ?? 0} gifts{c.goalCents ? ` · ${pct(raised, c.goalCents)}% of ${money(c.goalCents)}` : ""}
                    </p>
                    {c.goalCents ? <Progress value={pct(raised, c.goalCents)} className="mt-3" tone={raised >= c.goalCents ? "green" : "brand"} /> : null}
                  </Card>
                </Link>
              );
            })}
          </div>
          {!campaigns.length ? <EmptyState icon={<Target className="size-5" />} title="No active campaigns" /> : null}
          {inactive && sp.show !== "all" ? (
            <p className="mt-6 text-center text-sm">
              <Link href="?show=all" className="text-brand-700 hover:underline">
                Show {inactive} inactive / past campaigns
              </Link>
            </p>
          ) : null}
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <Table>
              <THead>
                <tr>
                  <TH>Fund</TH>
                  <TH className="text-right">Raised (all time)</TH>
                  <TH className="text-right">Gifts</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <tbody>
                {funds.map((f) => (
                  <TR key={f.id}>
                    <TD>
                      <details>
                        <summary className="cursor-pointer list-none">
                          <span className="font-medium text-slate-900">{f.name}</span>
                          {f.isDefault ? <Badge tone="blue" className="ml-2">Default</Badge> : null}
                          <span className="block text-xs text-slate-500">{f.description}</span>
                        </summary>
                        <form action={saveFund.bind(null, f.id)} className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3">
                          <Input name="name" defaultValue={f.name} className="h-9" />
                          <Input name="description" defaultValue={f.description ?? ""} placeholder="Description" className="h-9" />
                          <div className="flex flex-wrap items-center gap-4">
                            <Checkbox name="active" label="Active" defaultChecked={f.active} />
                            <Checkbox name="isDefault" label="Default" defaultChecked={f.isDefault} />
                            <SubmitButton size="sm" className="ml-auto">Save</SubmitButton>
                          </div>
                        </form>
                      </details>
                    </TD>
                    <TD className="text-right font-semibold">{money(fStats[f.id]?._sum.amountCents ?? 0)}</TD>
                    <TD className="text-right">{fStats[f.id]?._count ?? 0}</TD>
                    <TD>{f.active ? <Badge tone="green">Active</Badge> : <Badge>Hidden</Badge>}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card className="h-fit">
            <CardHeader title="Add a fund" description="Active funds appear in the donation form's designation list." />
            <CardBody>
              <form action={saveFund.bind(null, null)} className="space-y-3">
                <Field label="Name" required>
                  <Input name="name" required />
                </Field>
                <Field label="Description">
                  <Input name="description" />
                </Field>
                <Checkbox name="isDefault" label="Make this the default" />
                <SubmitButton className="w-full">Add fund</SubmitButton>
              </form>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
