import Link from "next/link";
import { Inbox, Search } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { Card, EmptyState, Input, PageHeader, Pagination, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { AutoSubmitSelect } from "@/components/client-ui";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Email outbox" };
export const dynamic = "force-dynamic";
const PAGE = 40;

export default async function Outbox({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const where: Prisma.EmailLogWhereInput = {
    ...(sp.status ? { status: sp.status } : {}),
    ...(sp.q ? { OR: [{ toEmail: { contains: sp.q.toLowerCase() } }, { subject: { contains: sp.q } }, { toName: { contains: sp.q } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.emailLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.emailLog.count({ where }),
  ]);
  const qs = (p: number) => `?${new URLSearchParams(Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <>
      <PageHeader title="Email outbox" description="A log of every email the system has sent (or would have sent while email delivery is off)." />
      <Card>
        <form className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={sp.q} placeholder="Recipient or subject" className="pl-9" />
          </div>
          <AutoSubmitSelect name="status" defaultValue={sp.status ?? ""} className="md:w-48">
            <option value="">All statuses</option>
            <option value="SENT">Sent</option>
            <option value="LOGGED">Logged (not sent)</option>
            <option value="FAILED">Failed</option>
          </AutoSubmitSelect>
        </form>
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <TH>To</TH>
                <TH>Subject</TH>
                <TH className="hidden md:table-cell">Template</TH>
                <TH>Status</TH>
                <TH>When</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((e) => (
                <TR key={e.id}>
                  <TD>
                    {e.contactId ? (
                      <Link href={`/admin/constituents/${e.contactId}?tab=emails`} className="font-medium text-slate-900 hover:text-brand-700">
                        {e.toName || e.toEmail}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-900">{e.toName || e.toEmail}</span>
                    )}
                    <span className="block text-xs text-slate-400">{e.toEmail}</span>
                  </TD>
                  <TD>
                    <Link href={`/admin/communications/outbox/${e.id}`} className="text-slate-800 hover:text-brand-700">
                      {e.subject}
                    </Link>
                  </TD>
                  <TD className="hidden font-mono text-xs text-slate-500 md:table-cell">{e.templateKey ?? "—"}</TD>
                  <TD>
                    <StatusBadge status={e.status} />
                  </TD>
                  <TD className="whitespace-nowrap text-slate-500">{fmtDateTime(e.createdAt)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Inbox className="size-5" />} title="No emails yet" />
        )}
        <Pagination page={page} pageCount={Math.ceil(total / PAGE)} makeHref={qs} />
      </Card>
    </>
  );
}
