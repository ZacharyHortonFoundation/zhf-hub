import type { Prisma } from "@prisma/client";
import { endOfDay, startOfDay, startOfMonth, startOfYear, subYears } from "date-fns";

export type ContactFilter = { q?: string; filter?: string; level?: string; tag?: string };

export function buildContactWhere(sp: ContactFilter): Prisma.ContactWhereInput {
  const and: Prisma.ContactWhereInput[] = [];
  const q = sp.q?.trim();
  if (q) {
    const n = parseInt(q, 10);
    const parts = q.split(/\s+/);
    and.push({
      OR: [
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { orgName: { contains: q } },
        { email: { contains: q.toLowerCase() } },
        { phone: { contains: q } },
        ...(Number.isFinite(n) && /^\d+$/.test(q) ? [{ constituentNo: n }] : []),
        ...(parts.length > 1 ? [{ AND: [{ firstName: { contains: parts[0] } }, { lastName: { contains: parts.slice(1).join(" ") } }] }] : []),
      ],
    });
  }
  const ys = startOfYear(new Date());
  const lys = subYears(ys, 1);
  switch (sp.filter) {
    case "donors":
      and.push({ giftCount: { gt: 0 } });
      break;
    case "donors-ytd":
      and.push({ lastGiftAt: { gte: ys } });
      break;
    case "lybunt":
      and.push(
        { donations: { some: { status: "SUCCEEDED", receivedAt: { gte: lys, lt: ys } } } },
        { NOT: { donations: { some: { status: "SUCCEEDED", receivedAt: { gte: ys } } } } },
      );
      break;
    case "sybunt":
      and.push({ giftCount: { gt: 0 } }, { lastGiftAt: { lt: lys } });
      break;
    case "recurring":
      and.push({ recurringPlans: { some: { status: "ACTIVE" } } });
      break;
    case "volunteers":
      and.push({ volunteerStatus: "APPROVED" });
      break;
    case "never":
      and.push({ giftCount: 0 });
      break;
    case "vip":
      and.push({ isVip: true });
      break;
    case "business":
      and.push({ type: "BUSINESS" });
      break;
  }
  if (sp.level) and.push({ donorLevel: sp.level });
  if (sp.tag) and.push({ tags: { some: { id: sp.tag } } });
  return and.length ? { AND: and } : {};
}

export type DonationFilter = {
  q?: string;
  range?: string;
  from?: string;
  to?: string;
  campaign?: string;
  fund?: string;
  method?: string;
  status?: string;
  frequency?: string;
  source?: string;
};

export function dateRange(range?: string, from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  const now = new Date();
  switch (range) {
    case "today":
      return { gte: startOfDay(now) };
    case "month":
      return { gte: startOfMonth(now) };
    case "year":
      return { gte: startOfYear(now) };
    case "last-year":
      return { gte: subYears(startOfYear(now), 1), lte: new Date(startOfYear(now).getTime() - 1) };
    case "custom":
      return { gte: from ? startOfDay(new Date(from + "T00:00")) : undefined, lte: to ? endOfDay(new Date(to + "T00:00")) : undefined };
    default:
      return undefined;
  }
}

export function buildDonationWhere(sp: DonationFilter): Prisma.DonationWhereInput {
  const and: Prisma.DonationWhereInput[] = [];
  const q = sp.q?.trim();
  if (q) {
    const n = parseInt(q, 10);
    and.push({
      OR: [
        { contact: { firstName: { contains: q } } },
        { contact: { lastName: { contains: q } } },
        { contact: { orgName: { contains: q } } },
        { contact: { email: { contains: q.toLowerCase() } } },
        { checkNumber: { contains: q } },
        ...(Number.isFinite(n) && /^\d+$/.test(q) ? [{ number: n }] : []),
      ],
    });
  }
  const r = dateRange(sp.range, sp.from, sp.to);
  if (r) and.push({ receivedAt: r });
  if (sp.campaign) and.push({ campaignId: sp.campaign });
  if (sp.fund) and.push({ fundId: sp.fund });
  if (sp.method) and.push({ method: sp.method });
  if (sp.status) and.push({ status: sp.status });
  else and.push({ status: { not: "PENDING" } });
  if (sp.frequency === "recurring") and.push({ frequency: { not: "ONE_TIME" } });
  if (sp.frequency === "one-time") and.push({ frequency: "ONE_TIME" });
  if (sp.source) and.push({ source: sp.source });
  return { AND: and };
}
