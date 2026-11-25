import Stripe from "stripe";

/**
 * Payments go through Stripe Checkout (hosted, PCI-compliant, supports cards,
 * Apple Pay, Google Pay and ACH). With no STRIPE_SECRET_KEY configured the app
 * runs in DEMO MODE: checkouts complete instantly and records are flagged isTest.
 */

let _stripe: Stripe | null = null;
export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!_stripe) _stripe = new Stripe(key);
  return _stripe;
}

export function paymentsMode(): "live" | "test" | "demo" {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return "demo";
  return key.startsWith("sk_live") ? "live" : "test";
}

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Gross-up so the organisation nets the full gift after processing fees.
 * total = (amount + fixed) / (1 - percent)
 */
export function coverFeeCents(amountCents: number, percent: number, fixedCents: number) {
  if (amountCents <= 0) return 0;
  const total = Math.ceil((amountCents + fixedCents) / (1 - percent / 100));
  return total - amountCents;
}

export const STRIPE_INTERVAL: Record<string, { interval: "month" | "year"; interval_count: number }> = {
  MONTHLY: { interval: "month", interval_count: 1 },
  QUARTERLY: { interval: "month", interval_count: 3 },
  ANNUAL: { interval: "year", interval_count: 1 },
};

export function nextChargeDate(from: Date, frequency: string) {
  const d = new Date(from);
  if (frequency === "MONTHLY") d.setMonth(d.getMonth() + 1);
  else if (frequency === "QUARTERLY") d.setMonth(d.getMonth() + 3);
  else if (frequency === "ANNUAL") d.setFullYear(d.getFullYear() + 1);
  return d;
}
