import type { Opportunity, Program, Skill } from "@prisma/client";
import { Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";
import { saveOpportunity } from "@/app/admin/volunteers/actions";
import { toLocalInput } from "@/lib/utils";

/** Create / edit form for a volunteer opportunity (admin). */
export function OpportunityForm({
  opp,
  programs,
  skills,
}: {
  opp?: (Opportunity & { skills: { id: string }[] }) | null;
  programs: Program[];
  skills: Skill[];
}) {
  const selected = new Set(opp?.skills.map((s) => s.id) ?? []);
  const isNew = !opp;
  return (
    <form action={saveOpportunity} className="space-y-6">
      {opp ? <input type="hidden" name="id" value={opp.id} /> : null}
      <Card>
        <CardHeader title="Basics" description="What volunteers will see on the opportunity page." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" required className="sm:col-span-2">
            <Input name="title" defaultValue={opp?.title} required placeholder="e.g. December Care Package Deliveries" />
          </Field>
          <Field label="Short summary" hint="One sentence shown on cards." className="sm:col-span-2">
            <Input name="summary" defaultValue={opp?.summary ?? ""} maxLength={200} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea name="description" rows={6} defaultValue={opp?.description ?? ""} placeholder="What volunteers will do, what to bring, parking info…" />
          </Field>
          <Field label="Program">
            <Select name="programId" defaultValue={opp?.programId ?? programs[0]?.id ?? ""}>
              <option value="">No program</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Setting">
            <Select name="setting" defaultValue={opp?.setting ?? "OUTDOOR"}>
              <option value="INDOOR">Indoor</option>
              <option value="OUTDOOR">Outdoor</option>
              <option value="VIRTUAL">Virtual</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={opp?.status ?? "PUBLISHED"}>
              <option value="PUBLISHED">Published (visible)</option>
              <option value="DRAFT">Draft (hidden)</option>
              <option value="CANCELED">Canceled</option>
            </Select>
          </Field>
          <Field label="Image URL" hint="Optional flyer or photo.">
            <Input name="imageUrl" defaultValue={opp?.imageUrl ?? ""} placeholder="https://…" />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Where & who" />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Field label="Location name">
            <Input name="location" defaultValue={opp?.location ?? ""} placeholder="ZHF Office" />
          </Field>
          <Field label="Street address">
            <Input name="address" defaultValue={opp?.address ?? ""} />
          </Field>
          <Field label="City">
            <Input name="city" defaultValue={opp?.city ?? "Fresno"} />
          </Field>
          <Field label="Register by" hint="Sign-ups close after this time.">
            <Input type="datetime-local" name="registrationCloseAt" defaultValue={toLocalInput(opp?.registrationCloseAt)} />
          </Field>
          <Field label="Minimum age" hint="Leave blank if none.">
            <Input type="number" name="minAge" min={0} max={99} defaultValue={opp?.minAge ?? ""} />
          </Field>
          <div className="flex flex-col justify-end gap-3 pb-1">
            <Checkbox name="adultsOnly" label="Adults only (18+)" defaultChecked={opp?.adultsOnly ?? true} />
            <Checkbox name="wheelchairAccessible" label="Wheelchair accessible" defaultChecked={opp?.wheelchairAccessible ?? false} />
          </div>
          <Field label="Contact person">
            <Input name="contactName" defaultValue={opp?.contactName ?? "Volunteer Coordinator"} />
          </Field>
          <Field label="Contact email">
            <Input type="email" name="contactEmail" defaultValue={opp?.contactEmail ?? "volunteer@zacharyhortonfoundation.org"} />
          </Field>
          <Field label="Contact phone">
            <Input name="contactPhone" defaultValue={opp?.contactPhone ?? "559.349.7581"} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Helpful skills" description="Used for the skills filter and to match interested volunteers." />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((s) => (
            <Checkbox key={s.id} name="skills" value={s.id} label={s.name} defaultChecked={selected.has(s.id)} />
          ))}
        </CardBody>
      </Card>

      {isNew ? (
        <Card>
          <CardHeader title="First shift" description="You can add more shifts after saving." />
          <CardBody className="grid gap-4 sm:grid-cols-4">
            <Field label="Shift name">
              <Input name="shiftName" placeholder="Main shift" />
            </Field>
            <Field label="Starts" required>
              <Input type="datetime-local" name="shiftStart" required />
            </Field>
            <Field label="Ends" required>
              <Input type="datetime-local" name="shiftEnd" required />
            </Field>
            <Field label="Volunteers needed" required>
              <Input type="number" name="shiftCapacity" min={1} defaultValue={6} required />
            </Field>
          </CardBody>
        </Card>
      ) : null}

      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">{isNew ? "Create opportunity" : "Save changes"}</SubmitButton>
      </div>
    </form>
  );
}
