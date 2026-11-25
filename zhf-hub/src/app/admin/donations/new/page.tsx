import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { Card, CardBody, CardHeader, Checkbox, LinkButton, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";
import { ContactPicker } from "@/components/admin/contact-picker";
import { DonationFields } from "@/components/admin/donation-form";
import { createDonation } from "../actions";
import { fullName } from "@/lib/utils";

export const metadata = { title: "Record a gift" };

export default async function NewDonation({ searchParams }: { searchParams: Promise<{ contact?: string }> }) {
  await requireStaff(["ADMIN", "STAFF"]);
  const sp = await searchParams;
  const [campaigns, funds, contact] = await Promise.all([
    db.campaign.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.fund.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    sp.contact ? db.contact.findUnique({ where: { id: sp.contact } }) : null,
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Record a gift"
        description="Checks, cash, in-kind, stock or any gift that didn't come through the website"
        breadcrumbs={[{ label: "Donations", href: "/admin/donations" }, { label: "Record gift" }]}
      />
      <form action={createDonation} className="space-y-6">
        <Card>
          <CardHeader title="Donor" />
          <CardBody>
            <ContactPicker allowNew initial={contact ? { id: contact.id, name: fullName(contact), email: contact.email, no: contact.constituentNo } : null} />
          </CardBody>
        </Card>
        <DonationFields campaigns={campaigns} funds={funds} />
        <Card>
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Checkbox name="sendReceipt" label="Email a receipt to the donor" defaultChecked />
            <div className="flex gap-2">
              <LinkButton href="/admin/donations" variant="ghost">
                Cancel
              </LinkButton>
              <SubmitButton name="another" value="1" variant="outline">
                Save & add another
              </SubmitButton>
              <SubmitButton pendingText="Saving…">Save gift</SubmitButton>
            </div>
          </CardBody>
        </Card>
      </form>
    </div>
  );
}
