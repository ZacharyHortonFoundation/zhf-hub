import type { Campaign } from "@prisma/client";
import { Card, CardBody, CardHeader, Checkbox, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";
import { toDateInput } from "@/lib/utils";

export function CampaignForm({ action, campaign }: { action: (fd: FormData) => Promise<void>; campaign?: Campaign | null }) {
  const c = campaign;
  return (
    <form action={action}>
      <Card>
        <CardHeader title={c ? "Campaign settings" : "New campaign"} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2">
            <Input name="name" defaultValue={c?.name} required />
          </Field>
          <Field label="URL slug" hint="Used in the donate link: /donate?campaign=slug">
            <Input name="slug" defaultValue={c?.slug} placeholder="auto from name" />
          </Field>
          <Field label="Goal (USD)">
            <Input name="goal" inputMode="decimal" defaultValue={c?.goalCents ? String(c.goalCents / 100) : ""} />
          </Field>
          <Field label="Start date">
            <Input type="date" name="startDate" defaultValue={toDateInput(c?.startDate)} />
          </Field>
          <Field label="End date">
            <Input type="date" name="endDate" defaultValue={toDateInput(c?.endDate)} />
          </Field>
          <Field label="Description" hint="Shown on the donate page and home page progress card" className="sm:col-span-2">
            <Textarea name="description" rows={3} defaultValue={c?.description ?? ""} />
          </Field>
          <Checkbox name="active" label="Active" description="Inactive campaigns are hidden from selection lists" defaultChecked={c ? c.active : true} />
          <Checkbox name="isDefault" label="Default campaign" description="Used for online gifts with no campaign link" defaultChecked={c?.isDefault} />
        </CardBody>
        <div className="flex justify-end border-t border-slate-100 px-5 py-4">
          <SubmitButton pendingText="Saving…">{c ? "Save changes" : "Create campaign"}</SubmitButton>
        </div>
      </Card>
    </form>
  );
}
