import { notFound } from "next/navigation";
import { Mail } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { LinkButton, PageHeader } from "@/components/ui";
import { PrintButton, SubmitButton } from "@/components/client-ui";
import { StatementView } from "@/components/statement-view";
import { fullName } from "@/lib/utils";
import { emailStatement } from "../../actions";

export const dynamic = "force-dynamic";

export default async function StatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const year = parseInt(sp.year ?? "", 10) || new Date().getFullYear();
  const c = await db.contact.findUnique({ where: { id } });
  if (!c) notFound();
  return (
    <>
      <div className="no-print">
        <PageHeader
          title={`${year} giving statement`}
          breadcrumbs={[{ label: "Constituents", href: "/admin/constituents" }, { label: fullName(c), href: `/admin/constituents/${id}` }, { label: "Statement" }]}
          actions={
            <>
              <LinkButton href={`?year=${year - 1}`} variant="ghost">
                ← {year - 1}
              </LinkButton>
              <LinkButton href={`?year=${year + 1}`} variant="ghost">
                {year + 1} →
              </LinkButton>
              <PrintButton>Print / save PDF</PrintButton>
              <form action={emailStatement.bind(null, id, year)}>
                <SubmitButton disabled={!c.email} pendingText="Sending…">
                  <Mail className="size-4" /> Email to donor
                </SubmitButton>
              </form>
            </>
          }
        />
      </div>
      <StatementView contactId={id} year={year} />
    </>
  );
}
