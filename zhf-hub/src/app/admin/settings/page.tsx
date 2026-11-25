import Link from "next/link";
import { CheckCircle2, CircleDashed, X } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { paymentsMode } from "@/lib/payments";
import { Badge, Card, CardBody, CardHeader, Checkbox, Field, Input, PageHeader, Select, Table, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";
import { ROLES } from "@/lib/constants";
import { cn, fmtDateTime } from "@/lib/utils";
import { createUser, deleteTag, saveDonorLevels, saveOrgSettings, updateUser } from "./actions";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const TABS = [
  { k: "general", l: "Organization & giving" },
  { k: "levels", l: "Donor levels" },
  { k: "users", l: "Staff accounts" },
  { k: "integrations", l: "Integrations" },
];

export default async function Settings({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireStaff(["ADMIN"]);
  const { tab = "general" } = await searchParams;
  const [s, levels, users, tags] = await Promise.all([
    getSettings(),
    db.donorLevel.findMany({ orderBy: { rank: "asc" } }),
    db.user.findMany({ orderBy: { createdAt: "asc" } }),
    db.tag.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { contacts: true } } } }),
  ]);
  const mode = paymentsMode();

  return (
    <>
      <PageHeader title="Settings" />
      <div className="scroll-thin mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <Link key={t.k} href={`?tab=${t.k}`} className={cn("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium", tab === t.k ? "border-brand-600 text-brand-800" : "border-transparent text-slate-500 hover:text-slate-800")}>
            {t.l}
          </Link>
        ))}
      </div>

      {tab === "general" && (
        <form action={saveOrgSettings} className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Organization" description="Used on receipts, statements and the public site." />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Legal name" className="sm:col-span-2">
                <Input name="orgName" defaultValue={s.orgName} />
              </Field>
              <Field label="EIN" hint="Printed on tax receipts">
                <Input name="ein" defaultValue={s.ein} placeholder="XX-XXXXXXX" />
              </Field>
              <Field label="Phone">
                <Input name="phone" defaultValue={s.phone} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Input name="address" defaultValue={s.address} />
              </Field>
              <Field label="Public email">
                <Input name="email" defaultValue={s.email} />
              </Field>
              <Field label="Main website">
                <Input name="website" defaultValue={s.website} />
              </Field>
              <Field label="Receipt footer" className="sm:col-span-2">
                <Textarea name="receiptFooter" defaultValue={s.receiptFooter} rows={4} />
              </Field>
            </CardBody>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Donation form" />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <Field label="Preset amounts" hint="Comma-separated, up to 6" className="sm:col-span-2">
                  <Input name="presetAmounts" defaultValue={s.presetAmounts.join(", ")} />
                </Field>
                <Field label="Processing fee %" hint="Used for “cover the fee”">
                  <Input name="feePercent" defaultValue={String(s.feePercent)} inputMode="decimal" />
                </Field>
                <Field label="Fixed fee ($)">
                  <Input name="feeFixed" defaultValue={(s.feeFixedCents / 100).toFixed(2)} inputMode="decimal" />
                </Field>
                <Field label="Headline" className="sm:col-span-2">
                  <Input name="donateHeadline" defaultValue={s.donateHeadline} />
                </Field>
                <Field label="Intro text" className="sm:col-span-2">
                  <Textarea name="donateIntro" defaultValue={s.donateIntro} rows={4} />
                </Field>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Volunteers" />
              <CardBody>
                <Checkbox
                  name="requireApprovalForSignup"
                  label="Require approval before volunteers can sign up for shifts"
                  description="New applicants can browse, but must be approved by a coordinator first."
                  defaultChecked={s.requireApprovalForSignup}
                />
              </CardBody>
            </Card>
            <div className="flex justify-end">
              <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
            </div>
          </div>
        </form>
      )}

      {tab === "levels" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Donor levels" description="A constituent gets the highest level whose lifetime giving AND number of gifts they meet. Saving recalculates everyone." />
            <form action={saveDonorLevels}>
              <Table>
                <THead>
                  <tr>
                    <TH>Level</TH>
                    <TH>Min. lifetime giving ($)</TH>
                    <TH>Min. # of gifts</TH>
                  </tr>
                </THead>
                <tbody>
                  {levels.map((l) => (
                    <TR key={l.id}>
                      <TD className="font-medium">{l.name}</TD>
                      <TD>
                        <Input name={`min_${l.id}`} defaultValue={(l.minLifetimeCents / 100).toFixed(0)} className="h-9 w-40" />
                      </TD>
                      <TD>
                        <Input name={`gifts_${l.id}`} defaultValue={String(l.minGifts)} className="h-9 w-24" />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
              <div className="flex justify-end border-t border-slate-100 p-4">
                <SubmitButton pendingText="Recalculating…">Save & recalculate</SubmitButton>
              </div>
            </form>
          </Card>
          <Card className="h-fit">
            <CardHeader title="Tags" description="Used to group constituents. Remove unused ones here." />
            <ul className="divide-y divide-slate-100">
              {tags.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span>
                    {t.name} <span className="text-xs text-slate-400">({t._count.contacts})</span>
                  </span>
                  <form action={deleteTag.bind(null, t.id)}>
                    <button className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600" aria-label={`Delete tag ${t.name}`}>
                      <X className="size-3.5" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === "users" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Staff accounts" />
            <ul className="divide-y divide-slate-100">
              {users.map((u) => (
                <li key={u.id} className="px-5 py-4">
                  <form action={updateUser.bind(null, u.id)} className="grid items-center gap-3 md:grid-cols-[1fr_180px_180px_auto_auto]">
                    <div>
                      <p className="font-medium text-slate-900">
                        {u.name} {u.id === me.userId ? <Badge tone="blue">You</Badge> : null}
                      </p>
                      <p className="text-xs text-slate-500">
                        {u.email} · last sign-in {u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "never"}
                      </p>
                    </div>
                    <Select name="role" defaultValue={u.role} className="h-9">
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </Select>
                    <Input name="password" type="password" placeholder="New password" className="h-9" autoComplete="new-password" />
                    <Checkbox name="active" label="Active" defaultChecked={u.active} />
                    <SubmitButton size="sm" variant="outline">
                      Update
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="h-fit">
            <CardHeader title="Add staff member" />
            <CardBody>
              <form action={createUser} className="space-y-3">
                <Field label="Name" required>
                  <Input name="name" required />
                </Field>
                <Field label="Email" required>
                  <Input name="email" type="email" required />
                </Field>
                <Field label="Role">
                  <Select name="role" defaultValue="STAFF">
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label} — {r.help}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Temporary password" hint="At least 10 characters. Share it securely.">
                  <Input name="password" type="password" required minLength={10} autoComplete="new-password" />
                </Field>
                <SubmitButton className="w-full">Create account</SubmitButton>
              </form>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "integrations" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Integration
            name="Stripe payments"
            ok={mode !== "demo"}
            status={mode === "live" ? "Live" : mode === "test" ? "Test mode" : "Not connected (demo mode)"}
            detail="Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the server environment. Webhook endpoint: /api/stripe/webhook (events: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.deleted, customer.subscription.updated)."
          />
          <Integration
            name="Stripe webhook"
            ok={Boolean(process.env.STRIPE_WEBHOOK_SECRET)}
            status={process.env.STRIPE_WEBHOOK_SECRET ? "Configured" : "Missing"}
            detail="Required so online payments and monthly renewals are recorded automatically."
          />
          <Integration
            name="Email delivery (Resend)"
            ok={Boolean(process.env.RESEND_API_KEY)}
            status={process.env.RESEND_API_KEY ? "Sending" : "Logging to Outbox only"}
            detail="Set RESEND_API_KEY and EMAIL_FROM. Verify the zacharyhortonfoundation.org domain in Resend (SPF/DKIM) so receipts land in inboxes."
          />
          <Integration
            name="Scheduled reminders"
            ok={Boolean(process.env.CRON_SECRET)}
            status={process.env.CRON_SECRET ? "Configured" : "Not scheduled"}
            detail="Call /api/cron/daily once a day with header Authorization: Bearer CRON_SECRET (Vercel Cron, GitHub Actions or Azure Logic Apps). Sends event & shift reminders and follow-ups."
          />
        </div>
      )}
    </>
  );
}

function Integration({ name, ok, status, detail }: { name: string; ok: boolean; status: string; detail: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        {ok ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" /> : <CircleDashed className="mt-0.5 size-5 text-amber-500" />}
        <div>
          <p className="font-semibold text-slate-900">{name}</p>
          <p className={cn("text-sm font-medium", ok ? "text-emerald-700" : "text-amber-700")}>{status}</p>
          <p className="mt-2 text-sm text-slate-500">{detail}</p>
        </div>
      </div>
    </Card>
  );
}
