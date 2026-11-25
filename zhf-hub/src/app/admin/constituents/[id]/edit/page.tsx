import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { ContactForm } from "@/components/admin/contact-form";
import { updateContact } from "../../actions";
import { fullName } from "@/lib/utils";

export default async function EditConstituent({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const c = await db.contact.findUnique({ where: { id } });
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Edit ${fullName(c)}`}
        breadcrumbs={[{ label: "Constituents", href: "/admin/constituents" }, { label: fullName(c), href: `/admin/constituents/${id}` }, { label: "Edit" }]}
      />
      <ContactForm action={updateContact.bind(null, id)} contact={c} cancelHref={`/admin/constituents/${id}`} />
    </div>
  );
}
