import { requireStaff } from "@/lib/auth";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { ImportForm } from "@/components/admin/import-form";

export const metadata = { title: "Import data" };
// large CSV imports can take a while on serverless hosts
export const maxDuration = 300;

export default async function ImportPage() {
  await requireStaff(["ADMIN"]);
  return (
    <>
      <PageHeader title="Import data" description="Bring constituents and gift history over from Dynamics / AHA (or any spreadsheet)." />
      <Card className="mb-6">
        <CardHeader title="How to export from Dynamics 365" />
        <CardBody>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
            <li>
              In the Aha Impact app open <strong>Contacts</strong> (or <strong>Transactions → One Time Donations</strong>), choose the view “All”, then click <strong>Export to Excel</strong>.
            </li>
            <li>Open the file in Excel and use <strong>File → Save As → CSV UTF-8</strong>.</li>
            <li>Upload it below with <em>Dry run</em> ticked to check the column mapping, then run it again without dry run.</li>
            <li>Records are matched on the Dynamics ID first, then email — so re-running an import won&apos;t create duplicates.</li>
          </ol>
          <p className="mt-3 text-xs text-slate-500">For a full automated migration (events, volunteers, hours and badges too) use the scripted Dataverse migration described in docs/03-migration-plan.md.</p>
        </CardBody>
      </Card>
      <ImportForm />
    </>
  );
}
