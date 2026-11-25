"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { nextNumber } from "@/lib/counters";
import { recomputeContactGiving } from "@/lib/rollups";
import { sendDonationReceipt, recordRecurringCharge } from "@/lib/donations";
import { upsertContactByEmail } from "@/lib/contacts";
import { stripe } from "@/lib/payments";
import { bool, optDate, optStr, str, toCents } from "@/lib/utils";
import { sendTemplate } from "@/lib/email";
import { FREQ_LABEL } from "@/lib/constants";
import { money } from "@/lib/utils";

const FUNDRAISING = ["ADMIN", "STAFF"];

async function resolveContact(fd: FormData) {
  const id = str(fd.get("contactId"));
  if (id) return id;
  if (str(fd.get("newContact"))) {
    const first = str(fd.get("newFirstName"));
    const last = str(fd.get("newLastName"));
    const org = optStr(fd.get("newOrgName"));
    if (!first && !last && !org) return null;
    const c = await upsertContactByEmail({
      email: optStr(fd.get("newEmail")),
      firstName: first,
      lastName: last,
      orgName: org,
      type: org && !first ? "BUSINESS" : "INDIVIDUAL",
      source: "MANUAL",
    });
    return c.id;
  }
  return null;
}

export async function createDonation(fd: FormData) {
  await requireStaff(FUNDRAISING);
  const contactId = await resolveContact(fd);
  const amountCents = toCents(str(fd.get("amount")));
  if (!contactId) redirect("/admin/donations/new?err=Choose or add a constituent");
  if (!Number.isFinite(amountCents) || amountCents <= 0) redirect(`/admin/donations/new?contact=${contactId}&err=Enter a valid amount`);
  const method = str(fd.get("method")) || "CHECK";
  const d = await db.donation.create({
    data: {
      number: await nextNumber("donation"),
      contactId,
      amountCents,
      totalCents: amountCents,
      method,
      status: "SUCCEEDED",
      source: "MANUAL",
      receivedAt: optDate(fd.get("receivedAt")) ?? new Date(),
      campaignId: optStr(fd.get("campaignId")),
      fundId: optStr(fd.get("fundId")),
      checkNumber: optStr(fd.get("checkNumber")),
      inKindDescription: optStr(fd.get("inKindDescription")),
      anonymous: bool(fd.get("anonymous")),
      dedicationType: optStr(fd.get("dedicationType")),
      dedicationName: optStr(fd.get("dedicationName")),
      matchingEmployer: optStr(fd.get("matchingEmployer")),
      comments: optStr(fd.get("comments")),
    },
  });
  await recomputeContactGiving(contactId);
  if (bool(fd.get("sendReceipt"))) await sendDonationReceipt(d.id);
  if (str(fd.get("another"))) redirect(`/admin/donations/new?ok=Gift #${d.number} recorded`);
  redirect(`/admin/donations/${d.id}?ok=Gift recorded`);
}

export async function updateDonation(id: string, fd: FormData) {
  await requireStaff(FUNDRAISING);
  const d = await db.donation.findUnique({ where: { id } });
  if (!d) redirect("/admin/donations");
  const amountCents = toCents(str(fd.get("amount")));
  await db.donation.update({
    where: { id },
    data: {
      amountCents: Number.isFinite(amountCents) && amountCents > 0 ? amountCents : d.amountCents,
      totalCents: Number.isFinite(amountCents) && amountCents > 0 && d.source === "MANUAL" ? amountCents : d.totalCents,
      receivedAt: optDate(fd.get("receivedAt")) ?? d.receivedAt,
      campaignId: optStr(fd.get("campaignId")),
      fundId: optStr(fd.get("fundId")),
      method: str(fd.get("method")) || d.method,
      checkNumber: optStr(fd.get("checkNumber")),
      inKindDescription: optStr(fd.get("inKindDescription")),
      anonymous: bool(fd.get("anonymous")),
      dedicationType: optStr(fd.get("dedicationType")),
      dedicationName: optStr(fd.get("dedicationName")),
      matchingEmployer: optStr(fd.get("matchingEmployer")),
      comments: optStr(fd.get("comments")),
    },
  });
  await recomputeContactGiving(d.contactId);
  redirect(`/admin/donations/${id}?ok=Saved`);
}

export async function resendReceipt(id: string) {
  await requireStaff(FUNDRAISING);
  await sendDonationReceipt(id);
  revalidatePath(`/admin/donations/${id}`);
  redirect(`/admin/donations/${id}?ok=Receipt sent`);
}

export async function refundDonation(id: string) {
  await requireStaff(["ADMIN"]);
  const d = await db.donation.findUnique({ where: { id } });
  if (!d || d.status !== "SUCCEEDED") redirect(`/admin/donations/${id}`);
  const st = stripe();
  if (st && d.stripePaymentId && !d.isTest) {
    try {
      await st.refunds.create({ payment_intent: d.stripePaymentId });
    } catch (e) {
      redirect(`/admin/donations/${id}?err=${encodeURIComponent("Stripe refund failed: " + (e instanceof Error ? e.message : "unknown error"))}`);
    }
  }
  await db.donation.update({ where: { id }, data: { status: "REFUNDED" } });
  await recomputeContactGiving(d.contactId);
  redirect(`/admin/donations/${id}?ok=Gift marked as refunded`);
}

export async function deleteDonation(id: string) {
  await requireStaff(["ADMIN"]);
  const d = await db.donation.findUnique({ where: { id } });
  if (!d) redirect("/admin/donations");
  if (d.source !== "MANUAL" && !d.isTest) redirect(`/admin/donations/${id}?err=Online gifts can't be deleted — refund them instead`);
  await db.donation.delete({ where: { id } });
  await recomputeContactGiving(d.contactId);
  redirect("/admin/donations?ok=Gift deleted");
}

// ── Recurring plans ─────────────────────────────────────────

export async function setPlanStatus(planId: string, status: "ACTIVE" | "PAUSED" | "CANCELED") {
  await requireStaff(FUNDRAISING);
  const plan = await db.recurringPlan.findUnique({ where: { id: planId }, include: { contact: true } });
  if (!plan) return;
  const st = stripe();
  if (st && plan.stripeSubscriptionId && !plan.isTest) {
    try {
      if (status === "CANCELED") await st.subscriptions.cancel(plan.stripeSubscriptionId);
      else if (status === "PAUSED") await st.subscriptions.update(plan.stripeSubscriptionId, { pause_collection: { behavior: "void" } });
      else await st.subscriptions.update(plan.stripeSubscriptionId, { pause_collection: null });
    } catch (e) {
      redirect(`/admin/recurring?err=${encodeURIComponent("Stripe: " + (e instanceof Error ? e.message : "update failed"))}`);
    }
  }
  await db.recurringPlan.update({
    where: { id: planId },
    data: { status, canceledAt: status === "CANCELED" ? new Date() : null },
  });
  if (status === "CANCELED" && plan.contact.email) {
    await sendTemplate({
      templateKey: "donation.recurring_canceled",
      to: plan.contact.email,
      toName: `${plan.contact.firstName} ${plan.contact.lastName}`,
      contactId: plan.contactId,
      vars: { first_name: plan.contact.firstName, amount: money(plan.amountCents), frequency: FREQ_LABEL[plan.frequency]?.toLowerCase() },
    });
  }
  revalidatePath("/admin/recurring");
  revalidatePath(`/admin/constituents/${plan.contactId}`);
}

/** Demo / offline plans: record the next installment manually (e.g. ACH or a plan migrated from AHA). */
export async function chargePlanNow(planId: string) {
  await requireStaff(FUNDRAISING);
  const plan = await db.recurringPlan.findUnique({ where: { id: planId } });
  if (!plan) return;
  if (plan.stripeSubscriptionId && !plan.isTest) redirect("/admin/recurring?err=Stripe collects this plan automatically");
  await recordRecurringCharge(planId, { isTest: plan.isTest });
  revalidatePath("/admin/recurring");
  redirect("/admin/recurring?ok=Installment recorded");
}
