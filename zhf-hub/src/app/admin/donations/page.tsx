import Link from "next/link";
import { Download, Heart, Plus, Repeat, Search } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { buildDonationWhere, type DonationFilter } from "@/lib/queries";
import { Badge, Card, EmptyState, Input, LinkButton, PageHeader, Pagination, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { AutoSubmitSelect } from "@/components/client-ui";
import { METHOD_LABEL, PAYMENT_METHODS } from "@/lib/constants";
import { fmtDate, fullName, money } from "@/lib/utils";

export const metadata = { title: "Donations" };
export const dynamic = "force-dynamic";
const PAGE = 30;

export default async function Donations({ searchParams }: { searchParams: Promise<DonationFilter & { page?: string }> }) {
  await requireStaff(["ADMIN", "STAFF"]);
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const where = buildDonationWhere(sp);
  const [rows, agg, donorGroups, campaigns, funds] = await Promise.all([
    db.donation.findMany({ where, orderBy: { receivedAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { contact: true, campaign: true, fund: true } }),
    db.donation.aggregate({ where, _sum: { amountCents: true }, _count: true, _avg: { amountCents: true } }),
    db.donation.groupBy({ by: ["contactId"], where }),
    db.campaign.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.fund.findMany({ orderBy: { name: "asc" } }),
  ]);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Donations"
        description="Every gift — online, by check, cash, in-kind and event add-ons"
        actions={
          <>
            <LinkButton href={`/admin/donations/export${qs({ page: undefined })}`} variant="outline" prefetch={false}>
              <Download className="size-4" /> Export CSV
            </LinkButton>
            <LinkButton href="/admin/donations/new">
              <Plus className="size-4" /> Record gift
            </LinkButton>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { l: "Total", v: money(agg._sum.amountCents ?? 0) },
          { l: "Gifts", v: agg._count.toLocaleString() },
          { l: "Donors", v: donorGroups.length.toLocaleString() },
          { l: "Average gift", v: money(Math.round(agg._avg.amountCents ?? 0), { decimals: false }) },
        ].map((s) => (
          <Card key={s.l} className="px-4 py-3">
            <p className="text-xs text-slate-500">{s.l}</p>
            <p className="text-xl font-semibold text-slate-900">{s.v}</p>
          </Card>
        ))}
      </div>

      <Card>
        <form className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-3 xl:grid-cols-7">
          <div className="relative md:col-span-3 xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={sp.q} placeholder="Donor, email, receipt # or check #" className="pl-9" />
          </div>
          <AutoSubmitSelect name="range" defaultValue={sp.range ?? ""}>
            <option value="">All time</option>
            <option value="today">Today</option>
            <option value="month">This month</option>
            <option value="year">This year</option>
            <option value="last-year">Last year</option>
          </AutoSubmitSelect>
          <AutoSubmitSelect name="campaign" defaultValue={sp.campaign ?? ""}>
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </AutoSubmitSelect>
          <AutoSubmitSelect name="fund" defaultValue={sp.fund ?? ""}>
            <option value="">All funds</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </AutoSubmitSelect>
          <AutoSubmitSelect name="method" defaultValue={sp.method ?? ""}>
            <option value="">Any method</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </AutoSubmitSelect>
          <AutoSubmitSelect name="status" defaultValue={sp.status ?? ""}>
            <option value="">Completed + refunded</option>
            <option value="SUCCEEDED">Succeeded</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="REFUNDED">Refunded</option>
          </AutoSubmitSelect>
        </form>

        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Receipt</TH>
                <TH>Donor</TH>
                <TH className="text-right">Amount</TH>
                <TH className="hidden lg:table-cell">Campaign</TH>
                <TH className="hidden md:table-cell">Method</TH>
                <TH>Date</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <Link href={`/admin/donations/${d.id}`} className="font-medium text-brand-700 hover:underline">
                      #{d.number}
                    </Link>
                  </TD>
                  <TD>
                    <Link href={`/admin/constituents/${d.contactId}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {fullName(d.contact)}
                    </Link>
                    {d.anonymous ? <Badge className="ml-1.5">Anon</Badge> : null}
                    {d.dedicationName ? <span className="block text-xs text-slate-400">{d.dedicationType === "MEMORY" ? "In memory of" : "In honor of"} {d.dedicationName}</span> : null}
                  </TD>
                  <TD className="text-right font-semibold text-slate-900">
                    {money(d.amountCents)}
                    {d.frequency !== "ONE_TIME" ? <Repeat className="ml-1 inline size-3.5 text-brand-400" /> : null}
                  </TD>
                  <TD className="hidden max-w-[220px] truncate lg:table-cell">
                    {d.campaign?.name ?? "—"}
                    <span className="block text-xs text-slate-400">{d.fund?.name}</span>
                  </TD>
                  <TD className="hidden md:table-cell text-slate-500">
                    {METHOD_LABEL[d.method]}
                    {d.checkNumber ? ` #${d.checkNumber}` : ""}
                    {d.source === "EVENT" ? <span className="block text-xs">Event add-on</span> : null}
                  </TD>
                  <TD className="whitespace-nowrap text-slate-500">{fmtDate(d.receivedAt)}</TD>
                  <TD>
                    <StatusBadge status={d.status} />
                    {d.isTest ? <Badge className="ml-1">Test</Badge> : null}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Heart className="size-5" />} title="No gifts match these filters" />
        )}
        <Pagination page={page} pageCount={Math.ceil(agg._count / PAGE)} makeHref={(p) => qs({ page: String(p) })} />
      </Card>
    </>
  );
}
