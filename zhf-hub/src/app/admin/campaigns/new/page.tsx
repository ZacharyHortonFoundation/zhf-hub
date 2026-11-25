import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { CampaignForm } from "@/components/admin/campaign-form";
import { saveCampaign } from "../actions";

export const metadata = { title: "New campaign" };

export default async function NewCampaign() {
  await requireStaff(["ADMIN", "STAFF"]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New campaign" breadcrumbs={[{ label: "Campaigns", href: "/admin/campaigns" }, { label: "New" }]} />
      <CampaignForm action={saveCampaign.bind(null, null)} />
    </div>
  );
}
