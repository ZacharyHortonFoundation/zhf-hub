import { db } from "./db";

/**
 * Recompute a contact's giving totals and donor level.
 * Donor levels come from the DonorLevel table (seeded with the AHA RFM thresholds:
 * Platinum $101k/17 gifts … Copper $0). A contact gets the highest-ranked level whose
 * lifetime AND gift-count minimums they meet.
 */
export async function recomputeContactGiving(contactId: string) {
  const agg = await db.donation.aggregate({
    where: { contactId, status: "SUCCEEDED" },
    _sum: { amountCents: true },
    _count: true,
    _max: { amountCents: true, receivedAt: true },
    _min: { receivedAt: true },
  });
  const lifetime = agg._sum.amountCents ?? 0;
  const count = agg._count;
  const levels = await db.donorLevel.findMany({ orderBy: { rank: "asc" } });
  const level = count === 0 ? null : levels.find((l) => lifetime >= l.minLifetimeCents && count >= l.minGifts)?.name ?? null;

  await db.contact.update({
    where: { id: contactId },
    data: {
      lifetimeCents: lifetime,
      giftCount: count,
      largestCents: agg._max.amountCents ?? 0,
      lastGiftAt: agg._max.receivedAt ?? null,
      firstGiftAt: agg._min.receivedAt ?? null,
      donorLevel: level,
    },
  });
}

export async function recomputeAllGiving() {
  const ids = await db.contact.findMany({ select: { id: true } });
  for (const { id } of ids) await recomputeContactGiving(id);
}
