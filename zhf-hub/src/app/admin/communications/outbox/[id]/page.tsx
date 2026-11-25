import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { Card, DescriptionList, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EmailView({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const e = await db.emailLog.findUnique({ where: { id } });
  if (!e) notFound();
  const s = await getSettings();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={e.subject} breadcrumbs={[{ label: "Outbox", href: "/admin/communications/outbox" }, { label: "Email" }]} />
      <Card className="mb-6 p-5">
        <DescriptionList
          items={[
            { label: "To", value: `${e.toName ? e.toName + " · " : ""}${e.toEmail}` },
            { label: "Status", value: <StatusBadge status={e.status} /> },
            { label: "Template", value: <span className="font-mono text-xs">{e.templateKey ?? "manual"}</span> },
            { label: "Created", value: fmtDateTime(e.createdAt) },
          ]}
        />
        {e.error ? <Notice tone="red" className="mt-4">{e.error}</Notice> : null}
      </Card>
      <div className="overflow-hidden rounded-2xl border border-[#eee6d8] bg-white shadow-sm">
        <div className="bg-brand-700 px-6 py-4 font-semibold text-white">{s.orgName}</div>
        <div className="whitespace-pre-line px-6 py-6 text-[15px] leading-relaxed text-slate-800">{e.body}</div>
        <div className="bg-sand px-6 py-4 text-xs text-slate-500">{s.receiptFooter}</div>
      </div>
    </div>
  );
}
