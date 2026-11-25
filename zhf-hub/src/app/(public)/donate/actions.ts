"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { nextNumber } from "@/lib/counters";
import { upsertContactByEmail } from "@/lib/contacts";
import { defaultCampaignId, defaultFundId, markDonationPaid } from "@/lib/donations";
import { appUrl, coverFeeCents, paymentsMode, stripe, STRIPE_INTERVAL } from "@/lib/payments";
import { getSettings } from "@/lib/settings";
import { FREQ_LABEL } from "@/lib/constants";

export type DonateState = { error?: string; fieldErrors?: Record<string, string> } | null;

const schema = z
  .object({
    frequency: z.enum(["ONE_TIME", "MONTHLY", "QUARTERLY", "ANNUAL"]),
    amount: z.coerce.number().min(5, "The minimum gift is $5").max(100000, "For gifts over $100,000 please contact us"),
    coverFee: z.boolean(),
    fundId: z.string().optional(),
    campaignSlug: z.string().optional(),
    donorType: z.enum(["INDIVIDUAL", "BUSINESS"]),
    firstName: z.string().trim().min(1, "First name is required").max(80),
    lastName: z.string().trim().min(1, "Last name is required").max(80),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    phone: z.string().trim().max(30).optional(),
    address1: z.string().trim().max(120).optional(),
    city: z.string().trim().max(60).optional(),
    state: z.string().trim().max(30).optional(),
    zip: z.string().trim().max(12).optional(),
    asCouple: z.boolean(),
    spouseFirstName: z.string().trim().max(80).optional(),
    spouseLastName: z.string().trim().max(80).optional(),
    orgName: z.string().trim().max(120).optional(),
    taxId: z.string().trim().max(20).optional(),
    anonymous: z.boolean(),
    dedicationType: z.enum(["", "HONOR", "MEMORY"]).optional(),
    dedicationName: z.string().trim().max(120).optional(),
    notify: z.boolean(),
    notifyName: z.string().trim().max(120).optional(),
    notifyEmail: z.string().trim().max(160).optional(),
    notifyMessage: z.string().trim().max(1000).optional(),
    matchingEmployer: z.string().trim().max(120).optional(),
    comments: z.string().trim().max(2000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.donorType === "BUSINESS" && !v.orgName) ctx.addIssue({ code: "custom", path: ["orgName"], message: "Business name is required" });
    if (v.asCouple && (!v.spouseFirstName || !v.spouseLastName))
      ctx.addIssue({ code: "custom", path: ["spouseFirstName"], message: "Spouse / partner name is required" });
    if (v.dedicationType && !v.dedicationName) ctx.addIssue({ code: "custom", path: ["dedicationName"], message: "Who is this gift dedicated to?" });
    if (v.notify && v.dedicationType) {
      if (!v.notifyName) ctx.addIssue({ code: "custom", path: ["notifyName"], message: "Recipient name is required" });
      if (!v.notifyEmail || !/^\S+@\S+\.\S+$/.test(v.notifyEmail))
        ctx.addIssue({ code: "custom", path: ["notifyEmail"], message: "Enter a valid recipient email" });
    }
  });

const b = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v : undefined;
};

export async function donate(_prev: DonateState, fd: FormData): Promise<DonateState> {
  const parsed = schema.safeParse({
    frequency: s(fd, "frequency") ?? "ONE_TIME",
    amount: s(fd, "amount"),
    coverFee: b(fd, "coverFee"),
    fundId: s(fd, "fundId"),
    campaignSlug: s(fd, "campaign"),
    donorType: s(fd, "donorType") ?? "INDIVIDUAL",
    firstName: s(fd, "firstName") ?? "",
    lastName: s(fd, "lastName") ?? "",
    email: s(fd, "email") ?? "",
    phone: s(fd, "phone"),
    address1: s(fd, "address1"),
    city: s(fd, "city"),
    state: s(fd, "state"),
    zip: s(fd, "zip"),
    asCouple: b(fd, "asCouple"),
    spouseFirstName: s(fd, "spouseFirstName"),
    spouseLastName: s(fd, "spouseLastName"),
    orgName: s(fd, "orgName"),
    taxId: s(fd, "taxId"),
    anonymous: b(fd, "anonymous"),
    dedicationType: (s(fd, "dedicationType") ?? "") as "" | "HONOR" | "MEMORY",
    dedicationName: s(fd, "dedicationName"),
    notify: b(fd, "notify"),
    notifyName: s(fd, "notifyName"),
    notifyEmail: s(fd, "notifyEmail"),
    notifyMessage: s(fd, "notifyMessage"),
    matchingEmployer: s(fd, "matchingEmployer"),
    comments: s(fd, "comments"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? "form");
      if (!fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { error: "Please check the highlighted fields.", fieldErrors };
  }
  const v = parsed.data;
  const settings = await getSettings();
  const amountCents = Math.round(v.amount * 100);
  const feeCents = v.coverFee ? coverFeeCents(amountCents, settings.feePercent, settings.feeFixedCents) : 0;
  const totalCents = amountCents + feeCents;

  const [campaign, fund] = await Promise.all([
    v.campaignSlug ? db.campaign.findUnique({ where: { slug: v.campaignSlug } }) : null,
    v.fundId ? db.fund.findFirst({ where: { id: v.fundId, active: true } }) : null,
  ]);
  const campaignId = campaign?.id ?? (await defaultCampaignId());
  const fundId = fund?.id ?? (await defaultFundId());

  const contact = await upsertContactByEmail({
    email: v.email,
    firstName: v.firstName,
    lastName: v.lastName,
    phone: v.phone,
    type: v.donorType,
    orgName: v.donorType === "BUSINESS" ? v.orgName : undefined,
    taxId: v.donorType === "BUSINESS" ? v.taxId : undefined,
    spouseFirstName: v.asCouple ? v.spouseFirstName : undefined,
    spouseLastName: v.asCouple ? v.spouseLastName : undefined,
    address1: v.address1,
    city: v.city,
    state: v.state,
    zip: v.zip,
    source: "ONLINE_DONATION",
  });

  const recurring = v.frequency !== "ONE_TIME";
  const plan = recurring
    ? await db.recurringPlan.create({
        data: {
          contactId: contact.id,
          amountCents,
          feeCoveredCents: feeCents,
          frequency: v.frequency,
          status: "PENDING", // becomes ACTIVE once the first payment succeeds
          campaignId,
          fundId,
        },
      })
    : null;

  const donation = await db.donation.create({
    data: {
      number: await nextNumber("donation"),
      contactId: contact.id,
      amountCents,
      feeCoveredCents: feeCents,
      totalCents,
      frequency: v.frequency,
      recurringPlanId: plan?.id,
      campaignId,
      fundId,
      method: "CARD",
      status: "PENDING",
      source: "ONLINE",
      anonymous: v.anonymous,
      dedicationType: v.dedicationType || null,
      dedicationName: v.dedicationType ? v.dedicationName : null,
      notifyName: v.dedicationType && v.notify ? v.notifyName : null,
      notifyEmail: v.dedicationType && v.notify ? v.notifyEmail : null,
      notifyMessage: v.dedicationType && v.notify ? v.notifyMessage : null,
      matchingEmployer: v.matchingEmployer || null,
      comments: v.comments || null,
    },
  });

  const mode = paymentsMode();
  if (mode === "demo") {
    await markDonationPaid(donation.id, { isTest: true });
    redirect(`/donate/thank-you?d=${donation.id}`);
  }

  const st = stripe()!;
  const label = `${recurring ? `${FREQ_LABEL[v.frequency]} donation` : "Donation"} to ${settings.orgName}`;
  let url: string | null = null;
  try {
    if (recurring) {
      const session = await st.checkout.sessions.create({
        mode: "subscription",
        customer_email: v.email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: totalCents,
              recurring: STRIPE_INTERVAL[v.frequency]!,
              product_data: { name: label, description: feeCents ? `Includes ${(feeCents / 100).toFixed(2)} to cover processing fees` : undefined },
            },
          },
        ],
        metadata: { kind: "donation", donationId: donation.id },
        subscription_data: { metadata: { kind: "recurring_plan", planId: plan!.id } },
        success_url: `${appUrl()}/donate/thank-you?d=${donation.id}`,
        cancel_url: `${appUrl()}/donate?canceled=1`,
      });
      url = session.url;
      await db.donation.update({ where: { id: donation.id }, data: { stripeSessionId: session.id } });
    } else {
      const session = await st.checkout.sessions.create({
        mode: "payment",
        customer_email: v.email,
        submit_type: "donate",
        line_items: [
          { quantity: 1, price_data: { currency: "usd", unit_amount: amountCents, product_data: { name: label } } },
          ...(feeCents
            ? [{ quantity: 1, price_data: { currency: "usd", unit_amount: feeCents, product_data: { name: "Processing fee (covered by you — thank you!)" } } }]
            : []),
        ],
        metadata: { kind: "donation", donationId: donation.id },
        payment_intent_data: { metadata: { kind: "donation", donationId: donation.id }, description: label },
        success_url: `${appUrl()}/donate/thank-you?d=${donation.id}`,
        cancel_url: `${appUrl()}/donate?canceled=1`,
      });
      url = session.url;
      await db.donation.update({ where: { id: donation.id }, data: { stripeSessionId: session.id } });
    }
  } catch (e) {
    console.error("Stripe checkout failed", e);
    return { error: "We couldn't start the secure payment page. Please try again in a moment." };
  }
  redirect(url!);
}
