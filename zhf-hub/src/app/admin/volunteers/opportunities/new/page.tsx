import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { OpportunityForm } from "@/components/volunteer/opportunity-form";

export const metadata = { title: "New opportunity" };

export default async function NewOpportunityPage() {
  await requireStaff();
  const [programs, skills] = await Promise.all([db.program.findMany({ orderBy: { name: "asc" } }), db.skill.findMany({ orderBy: { name: "asc" } })]);
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="New volunteer opportunity"
        breadcrumbs={[
          { label: "Volunteers", href: "/admin/volunteers" },
          { label: "Opportunities", href: "/admin/volunteers/opportunities" },
          { label: "New" },
        ]}
      />
      <OpportunityForm programs={programs} skills={skills} />
    </div>
  );
}
