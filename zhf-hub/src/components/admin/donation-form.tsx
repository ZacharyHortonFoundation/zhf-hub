import type { Campaign, Donation, Fund } from "@prisma/client";
import { Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { PAYMENT_METHODS } from "@/lib/constants";
import { toDateInput } from "@/lib/utils";

/** Shared fields for recording / editing an offline gift. */
export function DonationFields({ donation, campaigns, funds }: { donation?: Donation | null; campaigns: Campaign[]; funds: Fund[] }) {
  const d = donation;
  return (
    <>
      <Card>
        <CardHeader title="Gift" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (USD)" required>
            <Input name="amount" inputMode="decimal" defaultValue={d ? (d.amountCents / 100).toFixed(2) : ""} placeholder="0.00" required />
          </Field>
          <Field label="Date received" required>
            <Input name="receivedAt" type="date" defaultValue={toDateInput(d?.receivedAt ?? new Date())} required />
          </Field>
          <Field label="Method">
            <Select name="method" defaultValue={d?.method ?? "CHECK"}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Check / reference #">
            <Input name="checkNumber" defaultValue={d?.checkNumber ?? ""} />
          </Field>
          <Field label="Campaign">
            <Select name="campaignId" defaultValue={d?.campaignId ?? campaigns.find((c) => c.isDefault)?.id ?? ""}>
              <option value="">—</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {!c.active ? " (inactive)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fund / designation">
            <Select name="fundId" defaultValue={d?.fundId ?? funds.find((f) => f.isDefault)?.id ?? ""}>
              <option value="">—</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="In-kind description" hint="For in-kind gifts: what was given and its fair market value basis" className="sm:col-span-2">
            <Input name="inKindDescription" defaultValue={d?.inKindDescription ?? ""} />
          </Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Details" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Dedication">
            <Select name="dedicationType" defaultValue={d?.dedicationType ?? ""}>
              <option value="">None</option>
              <option value="HONOR">In honor of</option>
              <option value="MEMORY">In memory of</option>
            </Select>
          </Field>
          <Field label="Honoree name">
            <Input name="dedicationName" defaultValue={d?.dedicationName ?? ""} />
          </Field>
          <Field label="Employer match">
            <Input name="matchingEmployer" defaultValue={d?.matchingEmployer ?? ""} placeholder="Employer name" />
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox name="anonymous" label="Anonymous" description="Hide from public recognition" defaultChecked={d?.anonymous} />
          </div>
          <Field label="Internal comments" className="sm:col-span-2">
            <Textarea name="comments" rows={3} defaultValue={d?.comments ?? ""} />
          </Field>
        </CardBody>
      </Card>
    </>
  );
}
