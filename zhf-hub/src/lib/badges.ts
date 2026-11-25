import { db } from "./db";

/** Total approved volunteer hours for a contact. */
export async function approvedHours(contactId: string) {
  const agg = await db.volunteerHour.aggregate({
    where: { contactId, status: "APPROVED" },
    _sum: { hours: true },
  });
  return agg._sum.hours ?? 0;
}

/**
 * Award any hour-milestone badges the volunteer has newly earned.
 * Returns the names of badges awarded in this call.
 */
export async function awardHourBadges(contactId: string) {
  const total = await approvedHours(contactId);
  const eligible = await db.badge.findMany({
    where: { kind: "HOURS", hoursThreshold: { lte: total } },
  });
  const owned = new Set(
    (await db.contactBadge.findMany({ where: { contactId }, select: { badgeId: true } })).map((b) => b.badgeId),
  );
  const awarded: string[] = [];
  for (const b of eligible) {
    if (owned.has(b.id)) continue;
    await db.contactBadge.create({ data: { contactId, badgeId: b.id, awardedBy: "Automatic" } });
    awarded.push(b.name);
  }
  return awarded;
}
