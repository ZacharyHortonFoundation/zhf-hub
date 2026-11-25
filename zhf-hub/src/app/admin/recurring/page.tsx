import Link from "next/link";
import { Repeat, Search } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { Badge, Card, EmptyState, Input, PageHeader, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { AutoSubmitSelect, ConfirmSubmit, SubmitButton } from "@/components/client-ui";
import { FREQ_LABEL } from "@/lib/constants";
import { fmtDate, fullName, money } from "@/lib/utils";
import { chargePlanNow, setPlanStatus } from "../donations/actions";
import { paymentsMode } from "@/lib/payments";

export const metadata = { title: "Recurring gifts" };
export const dynamic = "force-dynamic";

export default async function Recurring({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; frequency?: string }> }) {
  await requireStaff(["ADMIN", "STAFF"]);
  const sp = await searchParams;
  const where: Prisma.RecurringPlanWhereInput = {
    ...(sp.status ? { status: sp.status } : { status: { not: "PENDING" } }),
    ...(sp.frequency ? { frequency: sp.frequency } : {}),
    ...(sp.q
      ? { contact: { OR: [{ firstName: { contains: sp.q } }, { lastName: { contains: sp.q } }, { email: { contains: sp.q.toLowerCase() } }] } }
      : {}),
  };
  const [plans, active] = await Promise.all([
    db.recurringPlan.findMany({
      where,
      orderBy: [{ status: "asc" }, { amountCents: "desc" }],
      include: { contact: true, fund: true, _count: { select: { donations: { where: { status: "SUCCEEDED" } } } } },
    }),
    db.recurringPlan.findMany({ where: { status: "ACTIVE" } }),
  ]);
  const totals = await db.donation.groupBy({ by: ["recurringPlanId"], where: { recurringPlanId: { in: plans.map((p) => p.id) }, status: "SUCCEEDED" }, _sum: { amountCents: true } });
  const totalBy = Object.fromEntries(totals.map((t) => [t.recurringPlanId, t._sum.amountCents ?? 0]));
  const mrr = active.reduce((a, p) => a + (p.frequency === "MONTHLY" ? p.amountCents : p.frequency === "QUARTERLY" ? p.amountCents / 3 : p.amountCents / 12), 0);
  const demo = paymentsMode() === "demo";

  return (
    <>
      <PageHeader title="Recurring gifts" description="Monthly, quarterly and annual givers — the steady heartbeat of ZHF's budget" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { l: "Active plans", v: active.length },
          { l: "Monthly-equivalent", v: money(Math.round(mrr), { decimals: false }) },
          { l: "Annualized", v: money(Math.round(mrr * 12), { decimals: false }) },
          { l: "Avg monthly gift", v: money(active.length ? Math.round(mrr / active.length) : 0, { decimals: false }) },
        ].map((s) => (
          <Card key={s.l} className="px-4 py-3">
            <p className="text-xs text-slate-500">{s.l}</p>
            <p className="text-xl font-semibold text-slate-900">{s.v}</p>
          </Card>
        ))}
      </div>
      <Card>
        <form className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={sp.q} placeholder="Search donor" className="pl-9" />
          </div>
          <AutoSubmitSelect name="status" defaultValue={sp.status ?? ""} className="md:w-48">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="PAST_DUE">Past due</option>
            <option value="CANCELED">Canceled</option>
            <option value="PENDING">Awaiting first payment</option>
          </AutoSubmitSelect>
          <AutoSubmitSelect name="frequency" defaultValue={sp.frequency ?? ""} className="md:w-40">
            <option value="">Any frequency</option>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="ANNUAL">Annual</option>
          </AutoSubmitSelect>
        </form>
        {plans.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Donor</TH>
                <TH className="text-right">Amount</TH>
                <TH className="hidden md:table-cell">Fund</TH>
                <TH className="hidden lg:table-cell">Started</TH>
                <TH>Next charge</TH>
                <TH className="hidden md:table-cell text-right">Given to date</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {plans.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Link href={`/admin/constituents/${p.contactId}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {fullName(p.contact)}
                    </Link>
                    <span className="block text-xs text-slate-400">{p.contact.email}</span>
                  </TD>
                  <TD className="text-right font-semibold">
                    {money(p.amountCents)}
                    <span className="block text-xs font-normal text-slate-400">{FREQ_LABEL[p.frequency]}</span>
                  </TD>
                  <TD className="hidden md:table-cell text-slate-600">{p.fund?.name ?? "—"}</TD>
                  <TD className="hidden lg:table-cell text-slate-500">{fmtDate(p.startDate)}</TD>
                  <TD className="text-slate-600">{p.status === "ACTIVE" || p.status === "PAST_DUE" ? fmtDate(p.nextChargeAt) : "—"}</TD>
                  <TD className="hidden md:table-cell text-right">
                    {money(totalBy[p.id] ?? 0)}
                    <span className="block text-xs text-slate-400">{p._count.donations} payments</span>
                  </TD>
                  <TD>
                    <StatusBadge status={p.status} />
                    {p.isTest ? <Badge className="ml-1">Test</Badge> : null}
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1.5">
                      {p.status === "ACTIVE" ? (
                        <form action={setPlanStatus.bind(null, p.id, "PAUSED")}>
                          <SubmitButton variant="outline" size="xs">
                            Pause
                          </SubmitButton>
                        </form>
                      ) : null}
                      {p.status === "PAUSED" || p.status === "PAST_DUE" ? (
                        <form action={setPlanStatus.bind(null, p.id, "ACTIVE")}>
                          <SubmitButton variant="outline" size="xs">
                            Resume
                          </SubmitButton>
                        </form>
                      ) : null}
                      {(demo || !p.stripeSubscriptionId) && p.status === "ACTIVE" ? (
                        <form action={chargePlanNow.bind(null, p.id)}>
                          <SubmitButton variant="secondary" size="xs" title="Record the next installment (offline / demo plans)">
                            Record payment
                          </SubmitButton>
                        </form>
                      ) : null}
                      {p.status !== "CANCELED" ? (
                        <form action={setPlanStatus.bind(null, p.id, "CANCELED")}>
                          <ConfirmSubmit size="xs" confirmText="Confirm cancel">
                            Cancel
                          </ConfirmSubmit>
                        </form>
                      ) : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Repeat className="size-5" />} title="No recurring gifts match" />
        )}
      </Card>
    </>
  );
}
