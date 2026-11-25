import type { Event } from "@prisma/client";
import { Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";
import { EVENT_CATEGORIES } from "@/lib/constants";
import { toLocalInput } from "@/lib/utils";

/** Create / edit form for an event's details. Server component — posts to the given server action. */
export function EventForm({
  event,
  campaigns,
  action,
  submitLabel,
}: {
  event?: Event | null;
  campaigns: { id: string; name: string; active: boolean }[];
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
}) {
  const e = event;
  return (
    <form action={action} className="space-y-6">
      {e ? <input type="hidden" name="id" value={e.id} /> : null}

      <Card>
        <CardHeader title="Basics" description="What people see on the events page." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" required className="sm:col-span-2">
            <Input name="title" defaultValue={e?.title} required placeholder="e.g. 6th Annual Break the Stigma Golf Tournament" />
          </Field>
          <Field label="Web address" hint="Leave blank to generate from the title." className="sm:col-span-2">
            <div className="flex items-center rounded-xl border border-slate-300 bg-slate-50 pl-3.5 text-sm text-slate-500 shadow-sm focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
              <span className="shrink-0">/events/</span>
              <input name="slug" defaultValue={e?.slug} className="h-10 w-full rounded-r-xl bg-white px-2 text-slate-900 focus:outline-none" placeholder="auto" />
            </div>
          </Field>
          <Field label="Short summary" hint="One sentence shown on event cards." className="sm:col-span-2">
            <Input name="summary" defaultValue={e?.summary ?? ""} maxLength={200} />
          </Field>
          <Field label="Description" className="sm:col-span-2" hint="Line breaks are kept. Include schedule, what to bring, parking, etc.">
            <Textarea name="description" defaultValue={e?.description ?? ""} rows={8} />
          </Field>
          <Field label="Image URL" hint="A flyer or photo (landscape works best)." className="sm:col-span-2">
            <Input name="imageUrl" type="url" defaultValue={e?.imageUrl ?? ""} placeholder="https://…" />
          </Field>
          <Field label="Category">
            <Select name="category" defaultValue={e?.category ?? "Community"}>
              {EVENT_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={e?.status ?? "DRAFT"}>
              <option value="DRAFT">Draft — hidden from the website</option>
              <option value="PUBLISHED">Published — live on the website</option>
              <option value="CANCELED">Canceled</option>
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="When & where" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts" required>
            <Input type="datetime-local" name="startAt" defaultValue={toLocalInput(e?.startAt)} required />
          </Field>
          <Field label="Ends">
            <Input type="datetime-local" name="endAt" defaultValue={toLocalInput(e?.endAt)} />
          </Field>
          <Field label="Venue name">
            <Input name="venueName" defaultValue={e?.venueName ?? ""} placeholder="e.g. Bethany Church" />
          </Field>
          <Field label="City">
            <Input name="city" defaultValue={e?.city ?? ""} placeholder="Fresno" />
          </Field>
          <Field label="Street address" className="sm:col-span-2">
            <Input name="address" defaultValue={e?.address ?? ""} placeholder="9161 N. Maple Ave." />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Registration" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Capacity" hint="Total attendees. Leave blank for unlimited.">
            <Input type="number" min={0} name="capacity" defaultValue={e?.capacity ?? ""} />
          </Field>
          <Field label="Registration closes" hint="Defaults to the event start time.">
            <Input type="datetime-local" name="registrationDeadline" defaultValue={toLocalInput(e?.registrationDeadline)} />
          </Field>
          <Field label="Revenue campaign" hint="Ticket sales & add-on gifts roll up to this campaign." className="sm:col-span-2">
            <Select name="campaignId" defaultValue={e?.campaignId ?? ""}>
              <option value="">— None (default campaign for gifts) —</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.active ? "" : " (inactive)"}
                </option>
              ))}
            </Select>
          </Field>
          <div className="space-y-3 sm:col-span-2">
            <Checkbox name="collectAttendeeInfo" defaultChecked={e?.collectAttendeeInfo ?? true} label="Collect each attendee's name" description="Every ticket gets a named QR code. Turn off for quick RSVPs where only the buyer is needed." />
            <Checkbox name="coverFeeEnabled" defaultChecked={e?.coverFeeEnabled ?? true} label="Offer to cover processing fees" description="Buyers can add the card fee so ZHF receives 100%." />
            <Checkbox name="allowDonation" defaultChecked={e?.allowDonation ?? true} label="Ask for an add-on donation" description="Adds an optional tax-deductible gift to checkout." />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Coordinator" description="Shown on the event page for questions." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input name="coordinatorName" defaultValue={e?.coordinatorName ?? ""} />
          </Field>
          <Field label="Email">
            <Input type="email" name="coordinatorEmail" defaultValue={e?.coordinatorEmail ?? ""} />
          </Field>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
