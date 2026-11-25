import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { EventForm } from "@/components/events/event-form";
import { createEvent } from "../actions";

export const metadata = { title: "New event" };

export default async function NewEventPage() {
  await requireStaff();
  const campaigns = await db.campaign.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, active: true } });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New event"
        description="Start with the basics — you'll add tickets, questions and discount codes next."
        breadcrumbs={[{ label: "Events", href: "/admin/events" }, { label: "New" }]}
      />
      <EventForm campaigns={campaigns} action={createEvent} submitLabel="Create event" />
    </div>
  );
}
