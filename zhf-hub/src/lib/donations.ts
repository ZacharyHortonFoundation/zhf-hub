import { db } from "./db";
import { nextNumber } from "./counters";
import { recomputeContactGiving } from "./rollups";
import { sendTemplate } from "./email";
import { appUrl, nextChargeDate } from "./payments";
import { FREQ_LABEL, METHOD_LABEL } from "./constants";
import { fmtDate, money } from "./utils";

export const MAJOR_GIFT_CENTS = 1000_00;

export async function defaultCampaignId() {
  const c = await db.campaign.findFirst({ where: { isDefault: true } });
  return c?.id ?? null;
}
export async function defaultFundId() {
  const f = await db.fund.findFirst({ where: { isDefault: true } });
  return f?.id ?? null;
}

function dedicationLine(d: { dedicationType: string | null; dedicationName: string | null }) {
  if (!d.dedicationType || !d.dedicationName) return "";
  return `${d.dedicationType === "MEMORY" ? "In memory of" : "In honor of"} ${d.dedicationName}`;
}

/** Send the donor receipt (major-gift variant at $1,000+). Marks receiptSentAt. */
export async function sendDonationReceipt(donationId: string) {
  const d = await db.donation.findUnique({ where: { id: donationId }, include: { contact: true, campaign: true, fund: true } });
  if (!d || !d.contact.email) return;
  await sendTemplate({
    templateKey: d.amountCents >= MAJOR_GIFT_CENTS ? "donation.receipt_major" : "donation.receipt",
    to: d.contact.email,
    toName: `${d.contact.firstName} ${d.contact.lastName}`.trim(),
    contactId: d.contactId,
    vars: {
      first_name: d.contact.firstName || d.contact.orgName || "friend",
      last_name: d.contact.lastName,
      amount: money(d.amountCents, { decimals: true }),
      total: money(d.totalCents, { decimals: true }),
      fee_covered: money(d.feeCoveredCents, { decimals: true }),
      frequency: FREQ_LABEL[d.frequency]?.toLowerCase() ?? "one-time",
      receipt_number: d.number,
      date: fmtDate(d.receivedAt),
      campaign: d.campaign?.name ?? "",
      fund: d.fund?.name ?? "General Fund",
      dedication: dedicationLine(d),
      payment_method: METHOD_LABEL[d.method] ?? d.method,
    },
  });
  await db.donation.update({ where: { id: d.id }, data: { receiptSentAt: new Date() } });
}

/**
 * Finalise a donation after successful payment (Stripe webhook or demo mode).
 * Idempotent — safe to call twice for the same donation.
 */
export async function markDonationPaid(
  donationId: string,
  opts: { stripeSessionId?: string | null; stripePaymentId?: string | null; stripeSubscriptionId?: string | null; isTest?: boolean } = {},
) {
  const d = await db.donation.findUnique({ where: { id: donationId }, include: { contact: true, recurringPlan: true } });
  if (!d || d.status === "SUCCEEDED") return d;

  await db.donation.update({
    where: { id: d.id },
    data: {
      status: "SUCCEEDED",
      receivedAt: new Date(),
      stripeSessionId: opts.stripeSessionId ?? d.stripeSessionId,
      stripePaymentId: opts.stripePaymentId ?? d.stripePaymentId,
      isTest: opts.isTest ?? d.isTest,
    },
  });

  if (d.recurringPlan) {
    await db.recurringPlan.update({
      where: { id: d.recurringPlan.id },
      data: {
        status: "ACTIVE",
        stripeSubscriptionId: opts.stripeSubscriptionId ?? d.recurringPlan.stripeSubscriptionId,
        nextChargeAt: nextChargeDate(new Date(), d.recurringPlan.frequency),
        isTest: opts.isTest ?? d.recurringPlan.isTest,
      },
    });
  }

  await recomputeContactGiving(d.contactId);
  await sendDonationReceipt(d.id);

  if (d.recurringPlan && d.contact.email) {
    await sendTemplate({
      templateKey: "donation.recurring_started",
      to: d.contact.email,
      toName: `${d.contact.firstName} ${d.contact.lastName}`.trim(),
      contactId: d.contactId,
      vars: {
        first_name: d.contact.firstName,
        amount: money(d.amountCents + d.feeCoveredCents, { decimals: true }),
        frequency: FREQ_LABEL[d.frequency]?.toLowerCase(),
      },
    });
  }

  if (d.notifyEmail && d.dedicationName) {
    await sendTemplate({
      templateKey: "donation.dedication_notice",
      to: d.notifyEmail,
      toName: d.notifyName,
      contactId: null,
      vars: {
        recipient_name: d.notifyName ?? "friend",
        donor_name: d.anonymous ? "Someone who cares" : `${d.contact.firstName} ${d.contact.lastName}`.trim(),
        dedication: dedicationLine(d).replace(/^In/, "in"),
        personal_message: d.notifyMessage ? `"${d.notifyMessage}"` : "",
      },
    });
  }
  return d;
}

/** Record a renewal charge for a recurring plan (Stripe invoice.paid, or the demo scheduler). */
export async function recordRecurringCharge(planId: string, opts: { stripePaymentId?: string | null; isTest?: boolean; amountCents?: number } = {}) {
  const plan = await db.recurringPlan.findUnique({ where: { id: planId } });
  if (!plan) return null;
  if (opts.stripePaymentId) {
    const exists = await db.donation.findFirst({ where: { stripePaymentId: opts.stripePaymentId } });
    if (exists) return exists;
  }
  const number = await nextNumber("donation");
  const donation = await db.donation.create({
    data: {
      number,
      contactId: plan.contactId,
      amountCents: plan.amountCents,
      feeCoveredCents: plan.feeCoveredCents,
      totalCents: opts.amountCents ?? plan.amountCents + plan.feeCoveredCents,
      frequency: plan.frequency,
      recurringPlanId: plan.id,
      campaignId: plan.campaignId,
      fundId: plan.fundId,
      method: "CARD",
      status: "SUCCEEDED",
      source: "ONLINE",
      stripePaymentId: opts.stripePaymentId ?? null,
      isTest: opts.isTest ?? plan.isTest,
    },
  });
  await db.recurringPlan.update({
    where: { id: plan.id },
    data: { status: "ACTIVE", nextChargeAt: nextChargeDate(new Date(), plan.frequency) },
  });
  await recomputeContactGiving(plan.contactId);
  await sendDonationReceipt(donation.id);
  return donation;
}

export function statementUrl(contactId: string, year: number) {
  return `${appUrl()}/admin/constituents/${contactId}/statement?year=${year}`;
}
