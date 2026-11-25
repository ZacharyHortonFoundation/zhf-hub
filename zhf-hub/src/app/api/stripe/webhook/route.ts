import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe } from "@/lib/payments";
import { markDonationPaid, recordRecurringCharge } from "@/lib/donations";
import { markOrderPaid } from "@/lib/events";

/**
 * Stripe webhook. Configure in the Stripe dashboard → Developers → Webhooks:
 *   URL:    https://<your-domain>/api/stripe/webhook
 *   Events: checkout.session.completed, invoice.paid, invoice.payment_failed,
 *           customer.subscription.updated, customer.subscription.deleted
 */
export async function POST(req: NextRequest) {
  const st = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!st || !secret) return new NextResponse("Stripe not configured", { status: 400 });

  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  let event: Stripe.Event;
  try {
    event = st.webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    return new NextResponse(`Invalid signature: ${e instanceof Error ? e.message : ""}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") break;
        const meta = s.metadata ?? {};
        const testMode = !s.livemode;
        if (meta.kind === "donation" && meta.donationId) {
          await markDonationPaid(meta.donationId, {
            stripeSessionId: s.id,
            stripePaymentId: typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null),
            stripeSubscriptionId: typeof s.subscription === "string" ? s.subscription : (s.subscription?.id ?? null),
            isTest: testMode,
          });
          if (s.customer) {
            const d = await db.donation.findUnique({ where: { id: meta.donationId } });
            if (d) await db.contact.update({ where: { id: d.contactId }, data: { stripeCustomerId: typeof s.customer === "string" ? s.customer : s.customer.id } });
          }
        } else if (meta.kind === "event_order" && meta.orderId) {
          await markOrderPaid(meta.orderId, { stripeSessionId: s.id, isTest: testMode });
        }
        break;
      }

      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice & { subscription?: string | { id: string } | null };
        // The first invoice is covered by checkout.session.completed.
        if (inv.billing_reason !== "subscription_cycle") break;
        const subId =
          (typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id) ??
          (inv.parent?.subscription_details?.subscription as string | undefined) ??
          null;
        if (!subId) break;
        const plan = await db.recurringPlan.findUnique({ where: { stripeSubscriptionId: subId } });
        if (!plan) break;
        await recordRecurringCharge(plan.id, { stripePaymentId: `inv_${inv.id}`, isTest: !inv.livemode, amountCents: inv.amount_paid });
        break;
      }

      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice & { subscription?: string | { id: string } | null };
        const subId = (typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id) ?? (inv.parent?.subscription_details?.subscription as string | undefined);
        if (subId) await db.recurringPlan.updateMany({ where: { stripeSubscriptionId: subId }, data: { status: "PAST_DUE" } });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await db.recurringPlan.updateMany({ where: { stripeSubscriptionId: sub.id }, data: { status: "CANCELED", canceledAt: new Date() } });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const status = sub.pause_collection ? "PAUSED" : sub.status === "active" ? "ACTIVE" : sub.status === "past_due" || sub.status === "unpaid" ? "PAST_DUE" : sub.status === "canceled" ? "CANCELED" : null;
        if (status) await db.recurringPlan.updateMany({ where: { stripeSubscriptionId: sub.id }, data: { status } });
        break;
      }
    }
  } catch (e) {
    console.error("Webhook handler error", event.type, e);
    return new NextResponse("Handler error", { status: 500 });
  }
  return NextResponse.json({ received: true });
}
