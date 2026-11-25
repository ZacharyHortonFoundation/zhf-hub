import { notFound } from "next/navigation";
import { verifyToken } from "@/lib/session";
import { StatementView } from "@/components/statement-view";
import { PrintButton } from "@/components/client-ui";

export const metadata = { title: "Giving statement", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Donor-facing statement link (signed token emailed with the year-end statement). */
export default async function PublicStatement({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await verifyToken<{ t: string; contactId: string; year: number }>(token);
  if (!p || p.t !== "statement") notFound();
  return (
    <div className="min-h-screen bg-cream px-4 py-10">
      <div className="no-print mx-auto mb-4 flex max-w-3xl justify-end">
        <PrintButton>Print / save as PDF</PrintButton>
      </div>
      <StatementView contactId={p.contactId} year={p.year} />
    </div>
  );
}
