import Link from "next/link";
import { Mail } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { Badge, Card, CardHeader, Notice, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Email templates" };
export const dynamic = "force-dynamic";

const ORDER = ["Donations", "Events", "Volunteers", "Account"];

export default async function Templates() {
  await requireStaff();
  const [templates, counts] = await Promise.all([
    db.emailTemplate.findMany({ orderBy: { name: "asc" } }),
    db.emailLog.groupBy({ by: ["templateKey"], _count: true }),
  ]);
  const sent = Object.fromEntries(counts.map((c) => [c.templateKey, c._count]));
  const resend = Boolean(process.env.RESEND_API_KEY);

  return (
    <>
      <PageHeader title="Email templates" description="Automatic emails sent for gifts, tickets and volunteering. Edit the wording any time — no developer needed." />
      {!resend ? (
        <Notice tone="amber" className="mb-6">
          Email delivery isn&apos;t connected yet, so messages are saved to the <Link href="/admin/communications/outbox" className="font-medium underline">Outbox</Link> instead of being sent. Add a Resend API key to go live.
        </Notice>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        {ORDER.map((cat) => (
          <Card key={cat}>
            <CardHeader title={cat} />
            <ul className="divide-y divide-slate-100">
              {templates
                .filter((t) => t.category === cat)
                .map((t) => (
                  <li key={t.id}>
                    <Link href={`/admin/communications/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                      <Mail className="size-4 shrink-0 text-brand-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{t.name}</p>
                        <p className="truncate text-xs text-slate-500">{t.subject}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        {t.enabled ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {sent[t.key] ?? 0} sent · edited {fmtDate(t.updatedAt, "MMM d")}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
