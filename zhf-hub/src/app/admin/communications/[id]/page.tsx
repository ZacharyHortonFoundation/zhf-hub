import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { TemplateEditor } from "@/components/admin/template-editor";
import { MERGE_FIELDS } from "@/lib/email";
import { SAMPLE_VARS } from "@/lib/email-samples";
import { getSettings } from "@/lib/settings";
import { saveTemplate } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditTemplate({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const t = await db.emailTemplate.findUnique({ where: { id } });
  if (!t) notFound();
  const settings = await getSettings();
  const fields = [...MERGE_FIELDS.Common, ...(MERGE_FIELDS[t.category] ?? [])];
  // include any extra placeholders already used in this template
  for (const m of `${t.subject} ${t.body}`.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) if (!fields.includes(m[1]!)) fields.push(m[1]!);
  return (
    <>
      <PageHeader
        title={t.name}
        description={<span className="font-mono text-xs">{t.key}</span>}
        breadcrumbs={[{ label: "Email templates", href: "/admin/communications" }, { label: t.name }]}
      />
      <TemplateEditor action={saveTemplate.bind(null, t.id)} initial={{ subject: t.subject, body: t.body, enabled: t.enabled }} fields={fields} sample={SAMPLE_VARS} orgName={settings.orgName} />
    </>
  );
}
