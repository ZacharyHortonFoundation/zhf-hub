import type { Contact } from "@prisma/client";
import { Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea, LinkButton } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";
import { toDateInput } from "@/lib/utils";

export function ContactForm({ action, contact, cancelHref }: { action: (fd: FormData) => Promise<void>; contact?: Contact | null; cancelHref: string }) {
  const c = contact;
  return (
    <form action={action} className="space-y-6">
      <Card>
        <CardHeader title="Identity" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Select name="type" defaultValue={c?.type ?? "INDIVIDUAL"}>
              <option value="INDIVIDUAL">Individual / household</option>
              <option value="BUSINESS">Business / organization</option>
            </Select>
          </Field>
          <Field label="Organization name" hint="For businesses, churches, foundations">
            <Input name="orgName" defaultValue={c?.orgName ?? ""} />
          </Field>
          <Field label="First name">
            <Input name="firstName" defaultValue={c?.firstName ?? ""} />
          </Field>
          <Field label="Last name">
            <Input name="lastName" defaultValue={c?.lastName ?? ""} />
          </Field>
          <Field label="Spouse / partner first name">
            <Input name="spouseFirstName" defaultValue={c?.spouseFirstName ?? ""} />
          </Field>
          <Field label="Spouse / partner last name">
            <Input name="spouseLastName" defaultValue={c?.spouseLastName ?? ""} />
          </Field>
          <Field label="Birthday">
            <Input name="birthday" type="date" defaultValue={toDateInput(c?.birthday)} />
          </Field>
          <Field label="Tax ID" hint="Businesses only">
            <Input name="taxId" defaultValue={c?.taxId ?? ""} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Contact details" />
        <CardBody className="grid gap-4 sm:grid-cols-6">
          <Field label="Email" className="sm:col-span-3">
            <Input name="email" type="email" defaultValue={c?.email ?? ""} />
          </Field>
          <Field label="Phone" className="sm:col-span-3">
            <Input name="phone" type="tel" defaultValue={c?.phone ?? ""} />
          </Field>
          <Field label="Street address" className="sm:col-span-6">
            <Input name="address1" defaultValue={c?.address1 ?? ""} />
          </Field>
          <Field label="City" className="sm:col-span-3">
            <Input name="city" defaultValue={c?.city ?? ""} />
          </Field>
          <Field label="State" className="sm:col-span-1">
            <Input name="state" defaultValue={c?.state ?? "CA"} />
          </Field>
          <Field label="ZIP" className="sm:col-span-2">
            <Input name="zip" defaultValue={c?.zip ?? ""} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Preferences & notes" />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Checkbox name="isVip" label="VIP" description="Highlight across the system" defaultChecked={c?.isVip} />
            <Checkbox name="doNotEmail" label="Do not email" description="Skip all automated emails" defaultChecked={c?.doNotEmail} />
            <Checkbox name="isDeceased" label="Deceased" description="Exclude from outreach" defaultChecked={c?.isDeceased} />
          </div>
          <Field label="Notes">
            <Textarea name="notes" defaultValue={c?.notes ?? ""} rows={4} placeholder="Relationship notes, interests, connection to ZHF…" />
          </Field>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <LinkButton href={cancelHref} variant="ghost">
          Cancel
        </LinkButton>
        <SubmitButton pendingText="Saving…">{c ? "Save changes" : "Create constituent"}</SubmitButton>
      </div>
    </form>
  );
}
