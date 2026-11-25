import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Repeat, Undo2, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { Avatar, Badge, Card, CardBody, CardHeader, DescriptionList, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/client-ui";
import { DonationFields } from "@/components/admin/donation-form";
import { FREQ_LABEL, METHOD_LABEL } from "@/lib/constants";
import { fmtDate, fmtDateTime, fullName, money } from "@/lib/utils";
import { deleteDonation, refundDonation, resendReceipt, updateDonation } from "../actions";

export const dynamic = "force-dynamic";

export default async function DonationDetail({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(["ADMIN", "STAFF"]);
  const { id } = await params;
  const d = await db.donation.findUnique({
    where: { id },
    include: { contact: true, campaign: true, fund: true, recurringPlan: true, eventOrder: { include: { event: true } } },
  });
  if (!d) notFound();
  const [campaigns, funds] = await Promise.all([
    db.campaign.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.fund.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Donations", href: "/admin/donations" }, { label: `#${d.number}` }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {money(d.amountCents, { decimals: true })}
            <StatusBadge status={d.status} />
            {d.isTest ? <Badge>Test</Badge> : null}
            {d.frequency !== "ONE_TIME" ? (
              <Badge tone="blue">
                <Repeat className="size-3" /> {FREQ_LABEL[d.frequency]}
              </Badge>
            ) : null}
          </span>
        }
        description={`Receipt #${d.number} · received ${fmtDateTime(d.receivedAt)}`}
        actions={
          d.status === "SUCCEEDED" ? (
            <>
              <form action={resendReceipt.bind(null, d.id)}>
                <SubmitButton variant="outline" pendingText="Sending…" disabled={!d.contact.email}>
                  <Mail className="size-4" /> {d.receiptSentAt ? "Resend receipt" : "Send receipt"}
                </SubmitButton>
              </form>
              {staff.role === "ADMIN" ? (
                <form action={refundDonation.bind(null, d.id)}>
                  <ConfirmSubmit size="md" confirmText={d.stripePaymentId && !d.isTest ? "Refund via Stripe" : "Mark refunded"}>
                    <Undo2 className="size-4" /> Refund
                  </ConfirmSubmit>
                </form>
              ) : null}
            </>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {d.source === "MANUAL" || staff.role === "ADMIN" ? (
            <form action={updateDonation.bind(null, d.id)} className="space-y-6">
              {d.source !== "MANUAL" ? (
                <Notice tone="blue">This gift came in online. Changing the amount here only corrects our records — it doesn&apos;t change what was charged.</Notice>
              ) : null}
              <DonationFields donation={d} campaigns={campaigns} funds={funds} />
              <div className="flex justify-end">
                <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
              </div>
            </form>
          ) : (
            <Card>
              <CardHeader title="Gift details" />
              <CardBody>
                <DescriptionList
                  items={[
                    { label: "Campaign", value: d.campaign?.name },
                    { label: "Fund", value: d.fund?.name },
                    { label: "Method", value: METHOD_LABEL[d.method] },
                    { label: "Comments", value: d.comments },
                  ]}
                />
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Donor" />
            <CardBody>
              <Link href={`/admin/constituents/${d.contactId}`} className="flex items-center gap-3">
                <Avatar name={fullName(d.contact)} />
                <span>
                  <span className="block font-medium text-slate-900 hover:text-brand-700">{fullName(d.contact)}</span>
                  <span className="block text-sm text-slate-500">{d.contact.email ?? "No email"}</span>
                </span>
              </Link>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Lifetime</dt>
                  <dd className="font-semibold">{money(d.contact.lifetimeCents)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Gifts</dt>
                  <dd className="font-semibold">{d.contact.giftCount}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Payment" />
            <CardBody>
              <DescriptionList
                className="sm:grid-cols-1"
                items={[
                  { label: "Gift amount", value: money(d.amountCents, { decimals: true }) },
                  { label: "Fee covered by donor", value: d.feeCoveredCents ? money(d.feeCoveredCents, { decimals: true }) : "—" },
                  { label: "Total charged", value: money(d.totalCents, { decimals: true }) },
                  { label: "Source", value: d.source === "EVENT" && d.eventOrder ? <Link className="text-brand-700 hover:underline" href={`/admin/events/${d.eventOrder.eventId}?tab=orders`}>Event: {d.eventOrder.event.title}</Link> : d.source.toLowerCase() },
                  { label: "Receipt emailed", value: d.receiptSentAt ? fmtDateTime(d.receiptSentAt) : "Not yet" },
                  ...(d.recurringPlan ? [{ label: "Recurring plan", value: <Link className="text-brand-700 hover:underline" href={`/admin/recurring?q=${encodeURIComponent(d.contact.email ?? d.contact.lastName)}`}>{money(d.recurringPlan.amountCents)} {FREQ_LABEL[d.recurringPlan.frequency]?.toLowerCase()} · {d.recurringPlan.status.toLowerCase()}</Link> }] : []),
                  ...(d.stripePaymentId ? [{ label: "Stripe payment", value: <span className="font-mono text-xs">{d.stripePaymentId}</span> }] : []),
                  ...(d.legacyId ? [{ label: "Dynamics ID", value: <span className="font-mono text-xs">{d.legacyId}</span> }] : []),
                  { label: "Created", value: fmtDate(d.createdAt) },
                ]}
              />
            </CardBody>
          </Card>

          {staff.role === "ADMIN" && (d.source === "MANUAL" || d.isTest) ? (
            <form action={deleteDonation.bind(null, d.id)}>
              <ConfirmSubmit confirmText="Delete this gift permanently">
                <Trash2 className="size-3.5" /> Delete gift
              </ConfirmSubmit>
            </form>
          ) : null}
        </div>
      </div>
    </>
  );
}
