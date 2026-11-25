import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ContactForm } from "@/components/admin/contact-form";
import { createContact } from "../actions";

export const metadata = { title: "New constituent" };

export default async function NewConstituent() {
  await requireStaff();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New constituent" breadcrumbs={[{ label: "Constituents", href: "/admin/constituents" }, { label: "New" }]} />
      <ContactForm action={createContact} cancelHref="/admin/constituents" />
    </div>
  );
}
