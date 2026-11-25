// Pure pricing helpers shared by the registration form (client) and the
// checkout server action, so the summary the buyer sees always matches the charge.

export type DiscountInfo = { code: string; percentOff: number | null; amountOffCents: number | null } | null;

/** Gross-up so the foundation nets `amountCents` after card fees. */
export function feeFor(amountCents: number, percent: number, fixedCents: number) {
  if (amountCents <= 0) return 0;
  return Math.ceil((amountCents + fixedCents) / (1 - percent / 100)) - amountCents;
}

export function discountFor(subtotalCents: number, discount: DiscountInfo) {
  if (!discount || subtotalCents <= 0) return 0;
  const raw = discount.percentOff ? Math.round((subtotalCents * discount.percentOff) / 100) : discount.amountOffCents ?? 0;
  return Math.max(0, Math.min(subtotalCents, raw));
}

export function computeTotals(i: {
  subtotalCents: number;
  discount: DiscountInfo;
  coverFee: boolean;
  donationCents: number;
  feePercent: number;
  feeFixedCents: number;
}) {
  const discountCents = discountFor(i.subtotalCents, i.discount);
  const base = i.subtotalCents - discountCents + i.donationCents;
  const feeCents = i.coverFee && base > 0 ? feeFor(base, i.feePercent, i.feeFixedCents) : 0;
  return {
    subtotalCents: i.subtotalCents,
    discountCents,
    donationCents: i.donationCents,
    feeCents,
    totalCents: base + feeCents,
  };
}

export function discountLabel(d: NonNullable<DiscountInfo>) {
  if (d.percentOff) return `${d.percentOff}% off`;
  return `$${((d.amountOffCents ?? 0) / 100).toFixed(2).replace(/\.00$/, "")} off`;
}
