/* eslint-disable no-console */
/**
 * Seed ZHF Hub with realistic sample data.
 *
 * - Organisation data (campaigns, programs, skills, badges, events, opportunities,
 *   email templates) mirrors what ZHF had configured in AHA Impact.
 * - ALL PEOPLE ARE FICTIONAL. Real donor data comes over with the migration script.
 *
 * Dev logins created here (change or delete before going live):
 *   Staff admin      admin@zhf.test        / ZhfAdmin!2026
 *   Staff (coord.)   coordinator@zhf.test  / ZhfCoord!2026
 *   Volunteer portal maria.lopez@example.com / Volunteer!2026
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { EMAIL_TEMPLATES } from "./email-templates";

// All seed dates are Fresno local time (see src/lib/tz.ts)
process.env.TZ = process.env.ORG_TIMEZONE || "America/Los_Angeles";

// This script DELETES everything first. Never let it run against a real database by accident.
try {
  process.loadEnvFile(".env"); // real environment variables still take precedence
} catch {
  /* no .env file */
}
if (/^postgres/i.test(process.env.DATABASE_URL ?? "") && process.env.ALLOW_DEMO_SEED !== "1") {
  console.error(
    "Refusing to load demo data into a PostgreSQL database (it wipes all records).\n" +
      "For production use `npm run db:init`. For a throwaway staging DB set ALLOW_DEMO_SEED=1.",
  );
  process.exit(1);
}

const db = new PrismaClient();

// ── deterministic RNG so the demo data is stable between resets ──
let seed = 20261124;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const chance = (p: number) => rand() < p;
const between = (a: number, b: number) => Math.floor(a + rand() * (b - a + 1));

const NOW = new Date();
const today = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
const d = (y: number, m: number, day: number, h = 10, min = 0) => new Date(y, m - 1, day, h, min);
const addDays = (date: Date, n: number) => new Date(date.getTime() + n * 864e5);

const FIRST = ["Maria", "James", "Linda", "Robert", "Patricia", "Michael", "Jennifer", "David", "Elizabeth", "Daniel", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Christopher", "Karen", "Matthew", "Lisa", "Anthony", "Nancy", "Mark", "Sandra", "Steven", "Ashley", "Andrew", "Kimberly", "Joshua", "Emily", "Kevin", "Donna", "Brian", "Michelle", "Ryan", "Carol", "Jacob", "Amanda", "Gary", "Melissa", "Eric", "Deborah", "Jonathan", "Stephanie", "Juan", "Rebecca", "Luis", "Laura", "Carlos", "Gabriela", "Rosa", "Miguel", "Ana", "Jose", "Sofia", "Diego", "Isabel", "Tyler", "Hannah", "Noah", "Olivia", "Ethan", "Ava", "Logan", "Mia", "Priya", "Arjun", "Mai", "Tou", "Kia", "Pao", "Neng", "Grace", "Samuel", "Ruth", "Aaron", "Leah"];
const LAST = ["Garcia", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Rodriguez", "Perez", "Sanchez", "Ramirez", "Torres", "Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Wilson", "Anderson", "Taylor", "Thomas", "Moore", "Jackson", "Martin", "Lee", "Thompson", "White", "Harris", "Clark", "Lewis", "Robinson", "Walker", "Young", "Allen", "King", "Wright", "Scott", "Green", "Baker", "Adams", "Nelson", "Hill", "Campbell", "Mitchell", "Roberts", "Carter", "Phillips", "Evans", "Vang", "Xiong", "Yang", "Lor", "Moua", "Her", "Singh", "Kaur", "Patel", "Nguyen", "Tran", "Medina", "Castillo", "Ortiz", "Reyes", "Flores", "Rivera", "Avila", "Mendoza", "Silva"];
const CITIES = [
  ["Fresno", "93710"], ["Fresno", "93720"], ["Fresno", "93704"], ["Fresno", "93711"], ["Clovis", "93611"], ["Clovis", "93619"],
  ["Madera", "93637"], ["Visalia", "93277"], ["Sanger", "93657"], ["Kerman", "93630"], ["Selma", "93662"], ["Reedley", "93654"],
] as const;
const STREETS = ["N Blackstone Ave", "E Shaw Ave", "W Herndon Ave", "N Palm Ave", "E Nees Ave", "N Fowler Ave", "W Bullard Ave", "E Barstow Ave", "N Cedar Ave", "Clovis Ave", "N Willow Ave", "W Alluvial Ave"];
const BUSINESSES = ["Sierra Vista Dental Group", "Valley Oak Realty", "Blackstone Auto Body", "Tower Roasters Coffee Co.", "Fig Garden Insurance Agency", "Central Valley Pediatrics", "San Joaquin Plumbing & Air", "Woodward Landscaping", "Riverbend Credit Union (sample)", "Kings Canyon Builders"];

async function main() {
  console.log("Resetting data…");
  // order matters for FK constraints
  await db.$transaction([
    db.emailLog.deleteMany(),
    db.contactBadge.deleteMany(),
    db.volunteerHour.deleteMany(),
    db.registration.deleteMany(),
    db.shift.deleteMany(),
    db.volunteerSkill.deleteMany(),
    db.volunteerApplication.deleteMany(),
    db.opportunity.deleteMany(),
    db.program.deleteMany(),
    db.skill.deleteMany(),
    db.badge.deleteMany(),
    db.donation.deleteMany(),
    db.attendee.deleteMany(),
    db.eventOrder.deleteMany(),
    db.discountCode.deleteMany(),
    db.eventQuestion.deleteMany(),
    db.ticketType.deleteMany(),
    db.event.deleteMany(),
    db.recurringPlan.deleteMany(),
    db.activity.deleteMany(),
    db.contact.deleteMany(),
    db.tag.deleteMany(),
    db.campaign.deleteMany(),
    db.fund.deleteMany(),
    db.donorLevel.deleteMany(),
    db.emailTemplate.deleteMany(),
    db.user.deleteMany(),
    db.setting.deleteMany(),
    db.counter.deleteMany(),
  ]);

  let donationNo = 10001;
  let orderNo = 5001;
  let constituentNo = 1001;

  // ── Staff ──────────────────────────────────────────
  const admin = await db.user.create({
    data: { name: "ZHF Admin", email: "admin@zhf.test", role: "ADMIN", passwordHash: await bcrypt.hash("ZhfAdmin!2026", 10) },
  });
  await db.user.create({
    data: { name: "Volunteer Coordinator", email: "coordinator@zhf.test", role: "COORDINATOR", passwordHash: await bcrypt.hash("ZhfCoord!2026", 10) },
  });

  // ── Templates ──────────────────────────────────────
  for (const t of EMAIL_TEMPLATES) await db.emailTemplate.create({ data: t });

  // ── Donor levels (names from AHA; thresholds scaled to ZHF's giving — edit in Settings) ──
  const levels = [
    { name: "Platinum", minLifetimeCents: 10_000_00, minGifts: 3, rank: 1, color: "violet" },
    { name: "Gold", minLifetimeCents: 5_000_00, minGifts: 2, rank: 2, color: "amber" },
    { name: "Silver", minLifetimeCents: 1_000_00, minGifts: 1, rank: 3, color: "slate" },
    { name: "Bronze", minLifetimeCents: 250_00, minGifts: 1, rank: 4, color: "orange" },
    { name: "Copper", minLifetimeCents: 0, minGifts: 1, rank: 5, color: "rose" },
  ];
  for (const l of levels) await db.donorLevel.create({ data: l });

  // ── Funds & campaigns ──────────────────────────────
  const funds = {
    general: await db.fund.create({ data: { name: "General Fund", description: "Where the need is greatest", isDefault: true } }),
    outreach: await db.fund.create({ data: { name: "Outreach & Harm Reduction", description: "Narcan, care packages and street outreach" } }),
    recovery: await db.fund.create({ data: { name: "Recovery Support Scholarships", description: "Sober-living and treatment scholarships" } }),
    family: await db.fund.create({ data: { name: "Family Support Services", description: "Support groups and resources for families" } }),
    awareness: await db.fund.create({ data: { name: "Awareness & Education", description: "Schools, summits and community education" } }),
  };
  const fundList = Object.values(funds);

  const camp = async (name: string, slug: string, extra: Record<string, unknown> = {}) =>
    db.campaign.create({ data: { name, slug, ...extra } });
  const campaigns = {
    website: await camp("Website Donation Form", "website", { isDefault: true, description: "Default campaign for online gifts" }),
    general: await camp("General Donation", "general-donation"),
    hope25: await camp("Hope Begins Here: The Zachary Horton Giving Campaign 2025", "hope-begins-here-2025", { goalCents: 50_000_00, startDate: d(2025, 11, 1), endDate: d(2026, 1, 31), active: false }),
    hope26: await camp("Hope Begins Here 2026", "hope-begins-here-2026", { goalCents: 60_000_00, startDate: d(2026, 11, 1), endDate: d(2027, 1, 31), description: "Year-end giving campaign — Giving Tuesday through January." }),
    golf25: await camp("ZHF Golf Tourney 2025", "golf-2025", { goalCents: 25_000_00, startDate: d(2025, 1, 15), endDate: d(2025, 4, 30), active: false }),
    golf26: await camp("ZHF Golf Tourney 2026", "golf-2026", { goalCents: 30_000_00, startDate: d(2026, 1, 15), endDate: d(2026, 4, 30), active: false }),
    golf27: await camp("ZHF Golf Tourney 2027", "golf-2027", { goalCents: 35_000_00, startDate: d(2026, 11, 15), endDate: d(2027, 4, 30) }),
    major: await camp("Major Donor", "major-donor"),
    mail: await camp("Direct Mail", "direct-mail"),
    coin: await camp("Coin Campaign", "coin-campaign", { description: "Coin jars at partner businesses" }),
    fireworks: await camp("ZHF Fireworks", "zhf-fireworks", { goalCents: 8_000_00, startDate: d(2026, 6, 28), endDate: d(2026, 7, 4), active: false }),
    sip: await camp("Sip & Learn", "sip-and-learn", { active: false }),
  };

  // ── Tags ───────────────────────────────────────────
  const tagNames: [string, string][] = [
    // Tags describe the relationship with ZHF only — never health, addiction or recovery status.
    ["Board Member", "violet"], ["Major Donor Prospect", "amber"], ["Golf Sponsor", "green"], ["Event Regular", "rose"],
    ["Community Advocate", "teal"], ["Church Partner", "blue"], ["Media", "slate"], ["Volunteer Leader", "green"], ["Business Partner", "blue"],
  ];
  const tags: Record<string, { id: string }> = {};
  for (const [name, color] of tagNames) tags[name] = await db.tag.create({ data: { name, color } });

  // ── Contacts ───────────────────────────────────────
  type C = { id: string; email: string | null; firstName: string; lastName: string };
  const people: C[] = [];
  const usedEmails = new Set<string>();
  const mkContact = async (data: Partial<Parameters<typeof db.contact.create>[0]["data"]> & { firstName: string; lastName: string }) => {
    const [city, zip] = pick(CITIES);
    let email = data.email as string | undefined;
    if (email === undefined) {
      email = `${data.firstName}.${data.lastName}${between(1, 99)}@example.com`.toLowerCase().replace(/\s/g, "");
      while (usedEmails.has(email)) email = email.replace("@", `${between(1, 9)}@`);
    }
    usedEmails.add(email);
    const c = await db.contact.create({
      data: {
        constituentNo: constituentNo++,
        phone: `(559) ${between(200, 999)}-${String(between(1000, 9999))}`,
        address1: `${between(100, 9999)} ${pick(STREETS)}`,
        city,
        state: "CA",
        zip,
        createdAt: addDays(d(2024, 6, 1), between(0, 800)),
        source: pick(["ONLINE_DONATION", "ONLINE_DONATION", "EVENT", "MANUAL", "IMPORT"]),
        ...data,
        email,
      } as Parameters<typeof db.contact.create>[0]["data"],
    });
    const rec = { id: c.id, email: c.email, firstName: c.firstName, lastName: c.lastName };
    people.push(rec);
    return rec;
  };

  // Named demo volunteer (portal login)
  const maria = await mkContact({
    firstName: "Maria",
    lastName: "Lopez",
    email: "maria.lopez@example.com",
    volunteerStatus: "APPROVED",
    portalPasswordHash: await bcrypt.hash("Volunteer!2026", 10),
    emergencyContactName: "Rafael Lopez",
    emergencyContactPhone: "(559) 555-0142",
    source: "VOLUNTEER",
    tags: { connect: [{ id: tags["Volunteer Leader"]!.id }, { id: tags["Community Advocate"]!.id }] },
  });

  for (let i = 0; i < 150; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const couple = chance(0.12);
    const t: { id: string }[] = [];
    if (chance(0.06)) t.push(tags["Event Regular"]!);
    if (chance(0.05)) t.push(tags["Community Advocate"]!);
    if (chance(0.03)) t.push(tags["Church Partner"]!);
    await mkContact({
      firstName: first,
      lastName: last,
      spouseFirstName: couple ? pick(FIRST) : null,
      spouseLastName: couple ? last : null,
      birthday: chance(0.3) ? d(between(1950, 2002), between(1, 12), between(1, 28)) : null,
      tags: t.length ? { connect: t } : undefined,
    });
  }
  const businesses: C[] = [];
  for (const b of BUSINESSES) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const c = await mkContact({
      type: "BUSINESS",
      orgName: b,
      firstName: first,
      lastName: last,
      email: `${first}@${b.toLowerCase().replace(/[^a-z]/g, "").slice(0, 18)}.example.com`.toLowerCase(),
      taxId: chance(0.5) ? `${between(10, 99)}-${between(1000000, 9999999)}` : null,
      tags: { connect: [{ id: tags["Business Partner"]!.id }] },
    });
    businesses.push(c);
  }

  // A few board members / VIPs
  const board = people.slice(1, 6);
  for (const b of board) {
    await db.contact.update({ where: { id: b.id }, data: { isVip: true, tags: { connect: [{ id: tags["Board Member"]!.id }] } } });
  }

  // ── Donations ──────────────────────────────────────
  const amountPick = () => {
    const r = rand();
    if (r < 0.3) return pick([25, 25, 35, 50]);
    if (r < 0.58) return pick([50, 75, 100, 100]);
    if (r < 0.8) return pick([150, 200, 250, 250]);
    if (r < 0.93) return pick([500, 500, 750, 1000]);
    if (r < 0.985) return pick([1500, 2000, 2500, 5000]);
    return pick([7500, 10000]);
  };
  const campaignFor = (date: Date) => {
    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    if ((y === 2025 && m >= 11) || (y === 2026 && m === 1)) return chance(0.7) ? campaigns.hope25 : campaigns.website;
    if (y === 2026 && m >= 11) return chance(0.65) ? campaigns.hope26 : campaigns.website;
    if (m >= 2 && m <= 4) return chance(0.4) ? (y === 2025 ? campaigns.golf25 : campaigns.golf26) : campaigns.website;
    if (m === 7 && y === 2026 && chance(0.5)) return campaigns.fireworks;
    return pick([campaigns.website, campaigns.website, campaigns.website, campaigns.general, campaigns.mail, campaigns.coin]);
  };
  const randomDate = () => {
    // weighted toward year-end giving season
    const start = d(2025, 1, 1).getTime();
    const end = today.getTime() - 864e5 * 2;
    let t = start + rand() * (end - start);
    const dt = new Date(t);
    if (chance(0.22)) {
      // pull into Nov/Dec
      const y = chance(0.5) ? 2025 : 2026;
      const max = y === 2026 ? Math.min(today.getTime() - 864e5 * 2, d(2026, 11, 22).getTime()) : d(2025, 12, 31).getTime();
      const min = d(y, 11, 1).getTime();
      t = min + rand() * (max - min);
      return new Date(t);
    }
    dt.setHours(between(7, 22), between(0, 59));
    return dt;
  };

  const donors = [...people.filter((p) => p.id !== maria.id && chance(0.78)), ...businesses];
  const mkDonation = async (contactId: string, amount: number, date: Date, opts: Record<string, unknown> = {}) => {
    const online = (opts.method ?? "CARD") === "CARD";
    const fee = online && chance(0.42) ? Math.ceil((amount * 100 + 30) / (1 - 0.029)) - amount * 100 : 0;
    return db.donation.create({
      data: {
        number: donationNo++,
        contactId,
        amountCents: amount * 100,
        feeCoveredCents: fee,
        totalCents: amount * 100 + fee,
        receivedAt: date,
        createdAt: date,
        campaignId: campaignFor(date).id,
        fundId: chance(0.65) ? funds.general.id : pick(fundList).id,
        source: online ? "ONLINE" : "MANUAL",
        receiptSentAt: date,
        ...opts,
      } as Parameters<typeof db.donation.create>[0]["data"],
    });
  };

  for (const p of donors) {
    const n = chance(0.55) ? 1 : chance(0.6) ? between(2, 3) : between(4, 8);
    for (let i = 0; i < n; i++) {
      const method = chance(0.8) ? "CARD" : pick(["CHECK", "CHECK", "CASH", "ACH"]);
      const extra: Record<string, unknown> = { method };
      if (method === "CHECK") extra.checkNumber = String(between(1001, 9999));
      if (chance(0.06)) {
        extra.dedicationType = chance(0.6) ? "MEMORY" : "HONOR";
        extra.dedicationName = chance(0.5) ? "Zachary Horton" : `${pick(FIRST)} ${pick(LAST)}`;
      }
      if (chance(0.04)) extra.matchingEmployer = pick(["PG&E", "Kaiser Permanente", "Community Health System", "State of California"]);
      if (chance(0.05)) extra.anonymous = true;
      await mkDonation(p.id, amountPick(), randomDate(), extra);
    }
  }
  // Business golf sponsorships
  for (const b of businesses.slice(0, 6)) {
    await mkDonation(b.id, pick([1000, 2500, 5000]), d(2026, between(2, 4), between(1, 25), 11), { method: "CHECK", checkNumber: String(between(2000, 8000)), campaignId: campaigns.golf26.id });
  }
  // Major gifts from board
  for (const b of board.slice(0, 3)) {
    await mkDonation(b.id, pick([5000, 10000]), d(2025, 12, between(10, 30), 14), { method: "ACH", campaignId: campaigns.major.id });
    await mkDonation(b.id, pick([2500, 5000]), d(2026, between(3, 10), between(1, 28), 14), { method: "ACH", campaignId: campaigns.major.id });
  }
  // In-kind
  await mkDonation(businesses[3]!.id, 400, d(2026, 9, 12, 9), { method: "IN_KIND", inKindDescription: "Coffee & pastries for Recovery Summit volunteers", campaignId: campaigns.general.id });
  // Today / yesterday so the dashboard looks alive
  const recent = donors.slice(0, 8);
  for (let i = 0; i < 4; i++) {
    const when = new Date(Math.max(today.getTime() + 5 * 60e3, NOW.getTime() - between(5, 240) * 60e3));
    await mkDonation(recent[i]!.id, pick([25, 50, 100, 250]), when, { campaignId: campaigns.hope26.id });
  }
  for (let i = 4; i < 7; i++) await mkDonation(recent[i]!.id, pick([50, 100, 500]), new Date(today.getTime() - 864e5 + between(9, 20) * 36e5), { campaignId: campaigns.hope26.id });

  // ── Recurring plans ────────────────────────────────
  const monthly = people.filter((p) => p.id !== maria.id).slice(20, 38);
  for (let i = 0; i < monthly.length; i++) {
    const p = monthly[i]!;
    const freq = i < 14 ? "MONTHLY" : i < 16 ? "QUARTERLY" : "ANNUAL";
    const status = i === 16 ? "CANCELED" : i === 17 ? "PAST_DUE" : i === 13 ? "PAUSED" : "ACTIVE";
    const amount = freq === "MONTHLY" ? pick([15, 20, 25, 50, 100]) : freq === "QUARTERLY" ? 150 : 1000;
    const start = d(2025, between(1, 12), between(1, 27), 9);
    const plan = await db.recurringPlan.create({
      data: {
        contactId: p.id,
        amountCents: amount * 100,
        frequency: freq,
        status,
        startDate: start,
        fundId: chance(0.5) ? funds.outreach.id : funds.general.id,
        campaignId: campaigns.website.id,
        canceledAt: status === "CANCELED" ? d(2026, 8, 1) : null,
      },
    });
    const stepMonths = freq === "MONTHLY" ? 1 : freq === "QUARTERLY" ? 3 : 12;
    let last = start;
    for (let dt = new Date(start); dt < today; dt = new Date(dt.getFullYear(), dt.getMonth() + stepMonths, dt.getDate(), 9)) {
      if (status === "CANCELED" && dt > d(2026, 8, 1)) break;
      if (status === "PAUSED" && dt > d(2026, 9, 1)) break;
      const failed = status === "PAST_DUE" && dt > d(2026, 10, 1);
      await db.donation.create({
        data: {
          number: donationNo++,
          contactId: p.id,
          amountCents: amount * 100,
          totalCents: amount * 100,
          frequency: freq,
          recurringPlanId: plan.id,
          campaignId: campaigns.website.id,
          fundId: plan.fundId,
          receivedAt: dt,
          createdAt: dt,
          status: failed ? "FAILED" : "SUCCEEDED",
          receiptSentAt: failed ? null : dt,
        },
      });
      last = dt;
    }
    const next = new Date(last.getFullYear(), last.getMonth() + stepMonths, last.getDate(), 9);
    await db.recurringPlan.update({ where: { id: plan.id }, data: { nextChargeAt: status === "ACTIVE" || status === "PAST_DUE" ? next : null } });
  }

  // ── Events ─────────────────────────────────────────
  const mkEvent = async (e: {
    slug: string; title: string; summary: string; description: string; category: string; startAt: Date; endAt?: Date;
    venueName: string; address?: string; city: string; capacity?: number; status?: string; imageUrl?: string; campaignId?: string;
    tickets: { name: string; priceCents: number; description?: string; attendeesPerTicket?: number; quantity?: number; countsTowardCapacity?: boolean }[];
    questions?: { label: string; type: string; options?: string; required?: boolean }[];
    discounts?: { code: string; percentOff?: number; amountOffCents?: number; maxUses?: number }[];
  }) => {
    const ev = await db.event.create({
      data: {
        slug: e.slug,
        title: e.title,
        summary: e.summary,
        description: e.description,
        category: e.category,
        startAt: e.startAt,
        endAt: e.endAt,
        venueName: e.venueName,
        address: e.address,
        city: e.city,
        capacity: e.capacity,
        status: e.status ?? "PUBLISHED",
        imageUrl: e.imageUrl,
        campaignId: e.campaignId,
        registrationDeadline: addDays(e.startAt, -1),
        coordinatorName: "Events Team",
        coordinatorEmail: "events@zacharyhortonfoundation.org",
        ticketTypes: { create: e.tickets.map((t, i) => ({ ...t, sortOrder: i })) },
        questions: e.questions ? { create: e.questions.map((q, i) => ({ ...q, sortOrder: i })) } : undefined,
        discountCodes: e.discounts ? { create: e.discounts } : undefined,
      },
      include: { ticketTypes: true, questions: true },
    });
    return ev;
  };

  const golf26 = await mkEvent({
    slug: "golf-tournament-2026",
    title: "5th Annual Break the Stigma Golf Tournament",
    summary: "A day on the course raising funds for recovery scholarships and outreach.",
    description: "Join us for our 5th Annual Break the Stigma Golf Tournament! Four-person scramble, lunch, awards dinner, raffle and silent auction. Every swing helps break the stigma of addiction.\n\nCheck-in 7:30 AM · Shotgun start 9:00 AM · Awards dinner 3:30 PM",
    category: "Fundraiser",
    startAt: d(2026, 4, 24, 7, 30),
    endAt: d(2026, 4, 24, 17, 0),
    venueName: "Fresno-area golf course",
    city: "Fresno",
    capacity: 144,
    campaignId: campaigns.golf26.id,
    tickets: [
      { name: "Individual golfer", priceCents: 175_00, description: "Green fees, cart, lunch & dinner" },
      { name: "Foursome", priceCents: 650_00, attendeesPerTicket: 4, description: "Team of four" },
      { name: "Dinner only", priceCents: 50_00 },
      { name: "Hole sponsor", priceCents: 250_00, countsTowardCapacity: false, description: "Sign at a tee box with your name or logo" },
    ],
    questions: [
      { label: "Shirt size", type: "SELECT", options: "S\nM\nL\nXL\nXXL", required: true },
      { label: "Dietary needs", type: "TEXT" },
    ],
  });
  const golf27 = await mkEvent({
    slug: "golf-tournament-2027",
    title: "6th Annual Break the Stigma Golf Tournament",
    summary: "Grab your foursome — our biggest fundraiser of the year is back.",
    description: "Our 6th annual tournament supports recovery scholarships, Narcan distribution and family support programs.\n\n• Four-person scramble\n• Lunch on the course and awards dinner\n• Raffle, silent auction and hole-in-one prizes\n\nSponsorship packages are available — contact us for details.",
    category: "Fundraiser",
    startAt: d(2027, 4, 23, 7, 30),
    endAt: d(2027, 4, 23, 17, 0),
    venueName: "Fresno-area golf course (TBA)",
    city: "Fresno",
    capacity: 144,
    campaignId: campaigns.golf27.id,
    tickets: [
      { name: "Individual golfer", priceCents: 185_00, description: "Green fees, cart, lunch & dinner" },
      { name: "Foursome", priceCents: 700_00, attendeesPerTicket: 4, description: "Team of four — save $40" },
      { name: "Dinner only", priceCents: 55_00 },
      { name: "Hole sponsor", priceCents: 250_00, countsTowardCapacity: false, description: "Sign at a tee box with your name or logo" },
    ],
    questions: [
      { label: "Shirt size", type: "SELECT", options: "S\nM\nL\nXL\nXXL", required: true },
      { label: "Dietary needs", type: "TEXT" },
    ],
    discounts: [{ code: "EARLYBIRD", percentOff: 10, maxUses: 40 }],
  });
  const movie = await mkEvent({
    slug: "movie-night-for-christmas-2026",
    title: "Movie Night for Christmas",
    summary: "A cozy family movie night in the park with hot cocoa and gifts for kids.",
    description: "Bring a blanket and the whole family for a holiday movie under the stars. Hot cocoa, popcorn and a small gift for every child.\n\nFamily passes include up to 4 people. Proceeds support Family Support Services.",
    category: "Community",
    startAt: d(2026, 12, 19, 17, 30),
    endAt: d(2026, 12, 19, 20, 30),
    venueName: "Roeding Park",
    address: "890 W Belmont Ave",
    city: "Fresno",
    capacity: 120,
    tickets: [
      { name: "Family pass (up to 4)", priceCents: 30_00, attendeesPerTicket: 4 },
      { name: "Individual", priceCents: 10_00 },
      { name: "Child (12 & under)", priceCents: 0 },
    ],
  });
  const outreach = await mkEvent({
    slug: "city-wide-ministry-outreach-2026",
    title: "City Wide Ministry Outreach Event",
    summary: "Community outreach and donation drive — warm clothes, hygiene kits and resources.",
    description: "We're partnering with local churches for a city-wide outreach.\n\nMost requested donation items: warm socks, gloves, beanies, blankets, hygiene kits and bottled water.\n\nDrop-off location: 5150 N 6th St, Suite 156, Fresno. Need a pickup? Call us at 559.349.7581 for pickups in the Fresno/Clovis area.",
    category: "Outreach",
    startAt: d(2026, 12, 5, 10, 0),
    endAt: d(2026, 12, 5, 14, 0),
    venueName: "Downtown Fresno",
    city: "Fresno",
    tickets: [{ name: "Free RSVP", priceCents: 0 }],
  });
  const vigil = await mkEvent({
    slug: "candlelight-remembrance-2027",
    title: "Hope Begins Here: Candlelight Remembrance",
    summary: "An evening to remember loved ones lost to overdose and to stand with families.",
    description: "Join families, friends and community members for a candlelight remembrance. Share a name, light a candle, and find support. Resource tables from local recovery organizations will be available.",
    category: "Awareness",
    startAt: d(2027, 1, 16, 18, 0),
    endAt: d(2027, 1, 16, 19, 30),
    venueName: "Old Town Clovis",
    city: "Clovis",
    capacity: 250,
    tickets: [{ name: "Free RSVP", priceCents: 0 }],
    questions: [{ label: "Name of a loved one you'd like remembered (optional)", type: "TEXT" }],
  });
  const symposium27 = await mkEvent({
    slug: "mental-health-symposium-2027",
    title: "5th Annual Mental Health Symposium",
    summary: "Speakers, workshops and resources on mental health and substance use.",
    description: "A free, full-morning symposium for families, educators, faith leaders and providers. Continental breakfast provided.",
    category: "Training",
    startAt: d(2027, 5, 29, 8, 0),
    endAt: d(2027, 5, 29, 12, 30),
    venueName: "Fresno",
    city: "Fresno",
    capacity: 200,
    status: "DRAFT",
    tickets: [{ name: "General admission", priceCents: 0 }],
  });
  const pastFree = [
    { slug: "soberstock-2026", title: "Soberstock", summary: "Feed My Sheep Ministries Car & Bike Show — War Against Fentanyl.", category: "Awareness", startAt: d(2026, 9, 26, 8), city: "Fresno", venueName: "Fresno" },
    { slug: "clovisfest-2026", title: "ClovisFest 2026", summary: "Visit the ZHF booth at ClovisFest, September 26–27.", category: "Community", startAt: d(2026, 9, 26, 8), endAt: d(2026, 9, 27, 17), city: "Clovis", venueName: "Old Town Clovis" },
    { slug: "recovery-summit-2026", title: "10th Annual Fresno & Clovis Recovery Summit", summary: "A free community event celebrating National Recovery Month.", category: "Awareness", startAt: d(2026, 9, 12, 9), endAt: d(2026, 9, 12, 12, 30), city: "Fresno", venueName: "Bethany Church", address: "9161 N. Maple Ave." },
    { slug: "overdose-awareness-day-2026", title: "International Overdose Awareness Day 2026", summary: "Remember without stigma. Candle lighting, speakers and Narcan training.", category: "Awareness", startAt: d(2026, 8, 31, 18), endAt: d(2026, 8, 31, 20), city: "Clovis", venueName: "Clovis", address: "2500 Alluvial Ave." },
    { slug: "juneteenth-food-giveaway-2026", title: "Juneteenth Experience – Massive Food Giveaway", summary: "Community food giveaway and resource fair.", category: "Outreach", startAt: d(2026, 6, 20, 11), city: "Fresno", venueName: "Fresno" },
    { slug: "mental-health-symposium-2026", title: "4th Annual Mental Health Symposium", summary: "Speakers and workshops on mental health and substance use.", category: "Training", startAt: d(2026, 5, 30, 8), endAt: d(2026, 5, 30, 12), city: "Fresno", venueName: "Fresno" },
  ];
  const pastEvents = [];
  for (const p of pastFree) {
    pastEvents.push(await mkEvent({ ...p, description: p.summary, capacity: 200, tickets: [{ name: "Free RSVP", priceCents: 0 }] }));
  }

  // Orders + attendees
  const mkOrder = async (ev: Awaited<ReturnType<typeof mkEvent>>, buyer: C, lines: { ticketIdx: number; qty: number }[], when: Date, opts: { paid?: boolean; checkedIn?: boolean; donation?: number } = {}) => {
    let subtotal = 0;
    const attendees: { ticketTypeId: string; firstName: string; lastName: string; email: string | null; ticketCode: string; checkedInAt: Date | null; answers?: string }[] = [];
    for (const l of lines) {
      const tt = ev.ticketTypes[l.ticketIdx]!;
      subtotal += tt.priceCents * l.qty;
      for (let q = 0; q < l.qty; q++) {
        for (let a = 0; a < tt.attendeesPerTicket; a++) {
          const self = attendees.length === 0;
          const answers: Record<string, string> = {};
          for (const qu of ev.questions) if (qu.type === "SELECT") answers[qu.id] = pick((qu.options ?? "").split("\n"));
          attendees.push({
            ticketTypeId: tt.id,
            firstName: self ? buyer.firstName : pick(FIRST),
            lastName: self ? buyer.lastName : pick(LAST),
            email: self ? buyer.email : null,
            ticketCode: Math.random().toString(36).slice(2, 10).toUpperCase(),
            checkedInAt: opts.checkedIn && chance(0.85) ? ev.startAt : null,
            answers: Object.keys(answers).length ? JSON.stringify(answers) : undefined,
          });
        }
      }
    }
    const donationCents = (opts.donation ?? 0) * 100;
    const fee = subtotal > 0 && chance(0.4) ? Math.round(subtotal * 0.032) : 0;
    const order = await db.eventOrder.create({
      data: {
        number: orderNo++,
        eventId: ev.id,
        contactId: buyer.id,
        subtotalCents: subtotal,
        feeCents: fee,
        donationCents,
        totalCents: subtotal + fee + donationCents,
        status: opts.paid === false ? "PENDING" : "PAID",
        createdAt: when,
        attendees: { create: attendees.map((a) => ({ ...a, eventId: ev.id, contactId: a.email === buyer.email ? buyer.id : null })) },
      },
    });
    if (donationCents) {
      await db.donation.create({
        data: {
          number: donationNo++,
          contactId: buyer.id,
          amountCents: donationCents,
          totalCents: donationCents,
          receivedAt: when,
          createdAt: when,
          source: "EVENT",
          campaignId: ev.campaignId ?? campaigns.website.id,
          fundId: funds.general.id,
          eventOrderId: order.id,
          receiptSentAt: when,
        },
      });
    }
  };

  const shuffled = [...people].sort(() => rand() - 0.5);
  let bi = 0;
  const nextBuyer = () => shuffled[bi++ % shuffled.length]!;
  for (let i = 0; i < 22; i++) {
    await mkOrder(golf26, nextBuyer(), [{ ticketIdx: chance(0.45) ? 1 : 0, qty: 1 }, ...(chance(0.25) ? [{ ticketIdx: 2, qty: between(1, 2) }] : [])], d(2026, between(2, 4), between(1, 20), 12), { checkedIn: true, donation: chance(0.2) ? pick([25, 50, 100]) : 0 });
  }
  for (const b of businesses.slice(0, 5)) await mkOrder(golf26, b, [{ ticketIdx: 3, qty: 1 }], d(2026, 3, between(1, 28), 10));
  for (let i = 0; i < 9; i++) await mkOrder(golf27, nextBuyer(), [{ ticketIdx: chance(0.5) ? 1 : 0, qty: 1 }], addDays(today, -between(1, 9)));
  for (let i = 0; i < 14; i++) await mkOrder(movie, nextBuyer(), [{ ticketIdx: chance(0.6) ? 0 : 1, qty: 1 }, ...(chance(0.3) ? [{ ticketIdx: 2, qty: between(1, 3) }] : [])], addDays(today, -between(0, 14)), { donation: chance(0.25) ? pick([10, 20, 50]) : 0 });
  for (let i = 0; i < 18; i++) await mkOrder(outreach, nextBuyer(), [{ ticketIdx: 0, qty: between(1, 2) }], addDays(today, -between(0, 20)));
  for (let i = 0; i < 6; i++) await mkOrder(vigil, nextBuyer(), [{ ticketIdx: 0, qty: between(1, 3) }], addDays(today, -between(0, 5)));
  for (const pe of pastEvents) {
    const n = between(8, 26);
    for (let i = 0; i < n; i++) await mkOrder(pe, nextBuyer(), [{ ticketIdx: 0, qty: between(1, 2) }], addDays(pe.startAt, -between(1, 25)), { checkedIn: true });
  }
  void symposium27;

  // ── Volunteers ─────────────────────────────────────
  const programs = {
    indoor: await db.program.create({ data: { name: "Indoor Volunteer", description: "Booths, summits, kit assembly and office support.", color: "blue" } }),
    outdoor: await db.program.create({ data: { name: "Outdoor Volunteer", description: "Deliveries, festivals, outreach and event crews.", color: "green" } }),
    virtual: await db.program.create({ data: { name: "Skills-Based & Virtual", description: "Design, social media, web and podcast help from anywhere.", color: "violet" } }),
  };
  const skillNames = [
    "Community Event Representation", "Social Media & Digital Marketing", "Website Development & Maintenance", "Graphic Design (Flyers/Brochures)",
    "Homeless Outreach Support", "Recovery Program Support", "Podcast Production & Support", "Event Setup & Logistics", "Food Distribution",
    "Photography", "Bilingual (Spanish)", "Bilingual (Hmong)", "Data Entry & Admin",
  ];
  const skills: Record<string, { id: string }> = {};
  for (const s of skillNames) skills[s] = await db.skill.create({ data: { name: s } });
  const sk = (...names: string[]) => ({ connect: names.map((n) => ({ id: skills[n]!.id })) });

  const badgeDefs = [
    { name: "Bronze – 10 Hours", tier: "BRONZE", kind: "HOURS", hoursThreshold: 10, description: "Logged 10 approved volunteer hours" },
    { name: "Silver – 25 Hours", tier: "SILVER", kind: "HOURS", hoursThreshold: 25, description: "Logged 25 approved volunteer hours" },
    { name: "Gold – 50 Hours", tier: "GOLD", kind: "HOURS", hoursThreshold: 50, description: "Logged 50 approved volunteer hours" },
    { name: "Gold – 100 Hours", tier: "GOLD", kind: "HOURS", hoursThreshold: 100, description: "Logged 100 approved volunteer hours" },
    ...["BRONZE", "SILVER", "GOLD"].flatMap((tier) =>
      ["Community Champion", "I Made a Difference", "Outstanding Service"].map((n) => ({
        name: `${tier[0]}${tier.slice(1).toLowerCase()} – ${n}`,
        tier,
        kind: "RECOGNITION",
        hoursThreshold: null,
        description: `${n} recognition (${tier.toLowerCase()})`,
      })),
    ),
  ];
  const badges: Record<string, { id: string }> = {};
  for (const b of badgeDefs) badges[b.name] = await db.badge.create({ data: b });

  // Volunteer roster
  const volunteerPool = [maria, ...people.filter((p) => p.id !== maria.id).slice(40, 62)];
  const statuses = ["APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "PENDING", "APPROVED", "REJECTED"];
  for (let i = 0; i < volunteerPool.length; i++) {
    const v = volunteerPool[i]!;
    const status = i === 0 ? "APPROVED" : i >= volunteerPool.length - 3 ? "PENDING" : pick(statuses);
    await db.contact.update({
      where: { id: v.id },
      data: {
        volunteerStatus: status,
        emergencyContactName: i === 0 ? undefined : `${pick(FIRST)} ${v.lastName}`,
        emergencyContactPhone: i === 0 ? undefined : `(559) ${between(200, 999)}-${between(1000, 9999)}`,
      },
    });
    const created = i >= volunteerPool.length - 3 ? addDays(today, -between(0, 6)) : d(2025, between(3, 12), between(1, 28));
    await db.volunteerApplication.create({
      data: {
        contactId: v.id,
        status,
        motivation: pick([
          "I want to help other families in our community.",
          "I enjoy working events and want to give back.",
          "Looking for meaningful ways to serve my community.",
          "My church encouraged us to get involved with local outreach.",
          "I'm a nursing student and care about harm reduction.",
        ]),
        availability: pick(["Weekends", "Weekday evenings", "Flexible", "Saturdays only", "Weekday mornings"]),
        agreedWaiver: true,
        createdAt: created,
        reviewedAt: status === "PENDING" ? null : addDays(created, 2),
        reviewedBy: status === "PENDING" ? null : "ZHF Admin",
        reviewNotes: status === "REJECTED" ? "Applicant is under 18 — please re-apply with a guardian consent form." : null,
      },
    });
    const ints = [...skillNames].sort(() => rand() - 0.5).slice(0, between(1, 3));
    for (const s of ints) await db.volunteerSkill.create({ data: { contactId: v.id, skillId: skills[s]!.id, kind: "INTEREST" } });
    if (chance(0.6)) await db.volunteerSkill.create({ data: { contactId: v.id, skillId: skills[pick(skillNames)]!.id, kind: "EXPERIENCE" } }).catch(() => {});
  }
  const approvedVols = volunteerPool.filter((_, i) => i < volunteerPool.length - 3);

  type OppIn = {
    title: string; summary: string; description: string; program: { id: string }; setting: string; location: string; address?: string; city: string;
    wheelchairAccessible?: boolean; adultsOnly?: boolean; skills?: string[]; shifts: { name?: string; startAt: Date; endAt: Date; capacity: number; fill?: number }[];
  };
  const mkOpp = async (o: OppIn) => {
    const opp = await db.opportunity.create({
      data: {
        title: o.title,
        summary: o.summary,
        description: o.description,
        programId: o.program.id,
        setting: o.setting,
        location: o.location,
        address: o.address,
        city: o.city,
        wheelchairAccessible: o.wheelchairAccessible ?? false,
        adultsOnly: o.adultsOnly ?? true,
        registrationCloseAt: addDays(o.shifts[0]!.startAt, -1),
        contactName: "Volunteer Coordinator",
        contactEmail: "volunteer@zacharyhortonfoundation.org",
        contactPhone: "559.349.7581",
        skills: o.skills ? sk(...o.skills) : undefined,
      },
    });
    for (const s of o.shifts) {
      const shift = await db.shift.create({ data: { opportunityId: opp.id, name: s.name ?? "Main shift", startAt: s.startAt, endAt: s.endAt, capacity: s.capacity } });
      const fill = Math.min(s.fill ?? 0, s.capacity, approvedVols.length);
      const vols = [...approvedVols].sort(() => rand() - 0.5).slice(0, fill);
      const past = s.endAt < today;
      for (const v of vols) {
        await db.registration.create({ data: { shiftId: shift.id, contactId: v.id, status: past ? (chance(0.9) ? "ATTENDED" : "NO_SHOW") : "REGISTERED" } });
        if (past) {
          const hrs = Math.round(((s.endAt.getTime() - s.startAt.getTime()) / 36e5) * 4) / 4;
          await db.volunteerHour.create({
            data: {
              contactId: v.id,
              opportunityId: opp.id,
              shiftId: shift.id,
              date: s.startAt,
              hours: hrs,
              status: s.endAt > addDays(today, -6) ? "PENDING" : "APPROVED",
              reviewedBy: s.endAt > addDays(today, -6) ? null : "ZHF Admin",
              reviewedAt: s.endAt > addDays(today, -6) ? null : addDays(s.endAt, 1),
              createdAt: addDays(s.endAt, 1),
            },
          });
        }
      }
    }
    return opp;
  };

  // Past (from the live AHA portal)
  await mkOpp({ title: "International Overdose Awareness Day", summary: "Help staff the ZHF table at the Clovis remembrance event.", description: "Greet guests, hand out purple ribbons and resource cards, and help with the candle-lighting ceremony.", program: programs.indoor, setting: "INDOOR", location: "Clovis", address: "2500 Alluvial Ave.", city: "Clovis", skills: ["Community Event Representation"], shifts: [{ startAt: d(2026, 8, 31, 16), endAt: d(2026, 8, 31, 20), capacity: 5, fill: 3 }] });
  await mkOpp({ title: "2026 Fresno & Clovis Recovery Summit", summary: "Run the ZHF booth at the 10th Annual Recovery Summit.", description: "Volunteers will help run the ZHF booth, greet attendees, share information about harm reduction and outreach programs, and connect with community members. Coffee and light breakfast provided.", program: programs.indoor, setting: "INDOOR", location: "Bethany Church", address: "9161 N. Maple Ave.", city: "Fresno", wheelchairAccessible: true, skills: ["Community Event Representation", "Recovery Program Support"], shifts: [{ startAt: d(2026, 9, 12, 8), endAt: d(2026, 9, 12, 12, 30), capacity: 2, fill: 2 }] });
  await mkOpp({ title: "Fall Festival", summary: "Family-friendly booth with games and resource info.", description: "Set up the booth, run kids' games and share resource information with families.", program: programs.outdoor, setting: "OUTDOOR", location: "Fresno", address: "3542 E. Butler Ave", city: "Fresno", skills: ["Event Setup & Logistics"], shifts: [{ startAt: d(2026, 9, 12, 9), endAt: d(2026, 9, 12, 14), capacity: 5, fill: 2 }] });
  await mkOpp({ title: "November Care Package Deliveries to SLE's 2026", summary: "Deliver holiday care packages to sober-living environments.", description: "Pick up care packages at the ZHF office and deliver them to sober-living homes across Fresno. 2–4 hours depending on your availability. A valid driver's license and insurance are required.", program: programs.outdoor, setting: "OUTDOOR", location: "ZHF Office", address: "5150 N. Sixth St #156", city: "Fresno", skills: ["Homeless Outreach Support", "Recovery Program Support"], shifts: [{ startAt: d(2026, 11, 18, 10), endAt: d(2026, 11, 18, 13), capacity: 21, fill: 14 }] });
  await mkOpp({ title: "Muddyeyes", summary: "Outdoor community event crew.", description: "Help with setup, the resource table and cleanup.", program: programs.outdoor, setting: "OUTDOOR", location: "Fresno", city: "Fresno", shifts: [{ startAt: d(2026, 11, 21, 10), endAt: d(2026, 11, 21, 14, 30), capacity: 4, fill: 4 }] });
  // Upcoming
  await mkOpp({ title: "City Wide Ministry Outreach — Booth & Donation Drive", summary: "Sort donations and hand out warm clothes and hygiene kits.", description: "Two shifts: morning setup + distribution, afternoon distribution + teardown. Wear comfortable shoes and dress for the weather.", program: programs.outdoor, setting: "OUTDOOR", location: "Downtown Fresno", city: "Fresno", skills: ["Homeless Outreach Support", "Food Distribution", "Bilingual (Spanish)"], shifts: [{ name: "Morning", startAt: d(2026, 12, 5, 9), endAt: d(2026, 12, 5, 12), capacity: 8, fill: 5 }, { name: "Afternoon", startAt: d(2026, 12, 5, 12), endAt: d(2026, 12, 5, 15), capacity: 8, fill: 2 }] });
  await mkOpp({ title: "December Care Package Deliveries to SLE's", summary: "Deliver holiday care packages to sober-living homes.", description: "Pick up care packages at the ZHF office and deliver to sober-living homes. Valid driver's license and insurance required.", program: programs.outdoor, setting: "OUTDOOR", location: "ZHF Office", address: "5150 N. Sixth St #156", city: "Fresno", skills: ["Homeless Outreach Support", "Recovery Program Support"], shifts: [{ startAt: d(2026, 12, 16, 10), endAt: d(2026, 12, 16, 13), capacity: 20, fill: 9 }] });
  await mkOpp({ title: "Movie Night for Christmas — Event Crew", summary: "Hand out cocoa, popcorn and gifts at Roeding Park.", description: "Help with check-in, concessions and handing out gifts to kids. Teens 16+ welcome with a parent.", program: programs.outdoor, setting: "OUTDOOR", location: "Roeding Park", address: "890 W Belmont Ave", city: "Fresno", adultsOnly: false, wheelchairAccessible: true, skills: ["Event Setup & Logistics"], shifts: [{ name: "Setup", startAt: d(2026, 12, 19, 15, 30), endAt: d(2026, 12, 19, 18), capacity: 6, fill: 6 }, { name: "Event & teardown", startAt: d(2026, 12, 19, 18), endAt: d(2026, 12, 19, 21), capacity: 8, fill: 3 }] });
  await mkOpp({ title: "Outreach Kit Assembly Nights", summary: "Assemble Narcan and hygiene kits at the ZHF office.", description: "A relaxed evening packing outreach kits. Pizza provided! Come to one night or all of them.", program: programs.indoor, setting: "INDOOR", location: "ZHF Office", address: "5150 N. Sixth St #156", city: "Fresno", wheelchairAccessible: true, adultsOnly: false, skills: ["Event Setup & Logistics"], shifts: [7, 14, 21, 28].map((day) => ({ name: `Jan ${day}`, startAt: d(2027, 1, day, 18), endAt: d(2027, 1, day, 20), capacity: 10, fill: between(1, 6) })) });
  await mkOpp({ title: "Social Media Content Day", summary: "Help plan and create a month of posts.", description: "Virtual session over Zoom. Bring ideas, Canva skills or photography.", program: programs.virtual, setting: "VIRTUAL", location: "Online (Zoom)", city: "Online", wheelchairAccessible: true, skills: ["Social Media & Digital Marketing", "Graphic Design (Flyers/Brochures)", "Photography"], shifts: [{ startAt: d(2027, 1, 9, 10), endAt: d(2027, 1, 9, 12), capacity: 4, fill: 1 }] });
  await mkOpp({ title: "Golf Tournament Volunteer Crew", summary: "Registration, course marshals and awards dinner help.", description: "The tournament runs on volunteers! Pick the shift that fits your day.", program: programs.outdoor, setting: "OUTDOOR", location: "Golf course (TBA)", city: "Fresno", skills: ["Event Setup & Logistics", "Community Event Representation"], shifts: [{ name: "Registration", startAt: d(2027, 4, 23, 7), endAt: d(2027, 4, 23, 10), capacity: 6, fill: 1 }, { name: "On the course", startAt: d(2027, 4, 23, 10), endAt: d(2027, 4, 23, 14), capacity: 10 }, { name: "Awards dinner", startAt: d(2027, 4, 23, 15), endAt: d(2027, 4, 23, 18), capacity: 6 }] });

  // Extra historical hours for Maria so she has badges
  const mariaHours = [
    { date: d(2025, 10, 4), hours: 4, description: "Fall resource fair booth" },
    { date: d(2025, 12, 6), hours: 5, description: "City Wide Ministry Outreach" },
    { date: d(2026, 2, 21), hours: 3, description: "Office — kit assembly" },
    { date: d(2026, 4, 24), hours: 8, description: "Golf tournament registration & course" },
    { date: d(2026, 7, 3), hours: 6, description: "Fireworks booth" },
  ];
  for (const h of mariaHours) await db.volunteerHour.create({ data: { ...h, contactId: maria.id, status: "APPROVED", reviewedBy: "ZHF Admin", reviewedAt: addDays(h.date, 2) } });

  // Award hour badges from approved totals + a few recognition badges
  const totals = await db.volunteerHour.groupBy({ by: ["contactId"], where: { status: "APPROVED" }, _sum: { hours: true } });
  const hourBadges = await db.badge.findMany({ where: { kind: "HOURS" } });
  for (const t of totals) {
    for (const b of hourBadges) {
      if ((t._sum.hours ?? 0) >= (b.hoursThreshold ?? Infinity)) {
        await db.contactBadge.create({ data: { contactId: t.contactId, badgeId: b.id, awardedBy: "Automatic" } });
      }
    }
  }
  await db.contactBadge.create({ data: { contactId: maria.id, badgeId: badges["Gold – Community Champion"]!.id, awardedBy: "ZHF Admin", note: "Led the November care package deliveries" } });
  await db.contactBadge.create({ data: { contactId: approvedVols[2]!.id, badgeId: badges["Bronze – I Made a Difference"]!.id, awardedBy: "ZHF Admin" } });

  // ── Activities (notes & tasks) ─────────────────────
  for (const b of board) {
    await db.activity.create({ data: { contactId: b.id, type: "MEETING", subject: "Coffee — year-end campaign update", body: "Shared Hope Begins Here goals; interested in matching Giving Tuesday gifts.", createdById: admin.id, createdAt: addDays(today, -between(3, 40)) } });
  }
  await db.activity.create({ data: { contactId: board[0]!.id, type: "TASK", subject: "Send Giving Tuesday match announcement draft", dueAt: addDays(today, 3), createdById: admin.id } });
  await db.activity.create({ data: { contactId: board[1]!.id, type: "TASK", subject: "Thank-you call for major gift", dueAt: addDays(today, 1), createdById: admin.id } });
  await db.activity.create({ data: { contactId: businesses[0]!.id, type: "CALL", subject: "Golf 2027 sponsorship renewal", body: "Wants the same hole sponsorship + a foursome. Send invoice in January.", createdById: admin.id, createdAt: addDays(today, -6) } });

  // ── Counters & settings ────────────────────────────
  await db.counter.createMany({
    data: [
      { name: "donation", value: donationNo - 1 },
      { name: "order", value: orderNo - 1 },
      { name: "constituent", value: constituentNo - 1 },
    ],
  });

  // ── Roll-ups ───────────────────────────────────────
  console.log("Computing donor roll-ups…");
  const levelRows = await db.donorLevel.findMany({ orderBy: { rank: "asc" } });
  const all = await db.contact.findMany({ select: { id: true } });
  for (const { id } of all) {
    const agg = await db.donation.aggregate({
      where: { contactId: id, status: "SUCCEEDED" },
      _sum: { amountCents: true },
      _count: true,
      _max: { amountCents: true, receivedAt: true },
      _min: { receivedAt: true },
    });
    const lifetime = agg._sum.amountCents ?? 0;
    const level = agg._count === 0 ? null : levelRows.find((l) => lifetime >= l.minLifetimeCents && agg._count >= l.minGifts)?.name ?? null;
    await db.contact.update({
      where: { id },
      data: {
        lifetimeCents: lifetime,
        giftCount: agg._count,
        largestCents: agg._max.amountCents ?? 0,
        lastGiftAt: agg._max.receivedAt,
        firstGiftAt: agg._min.receivedAt,
        donorLevel: level,
        sentThankYou: agg._count > 0 && chance(0.7),
        informedMonthly: agg._count > 1 && chance(0.4),
      },
    });
  }
  // Tag top givers
  const top = await db.contact.findMany({ orderBy: { lifetimeCents: "desc" }, take: 8 });
  for (const t of top) await db.contact.update({ where: { id: t.id }, data: { tags: { connect: [{ id: tags["Major Donor Prospect"]!.id }] } } });

  // ── Some outbox history ────────────────────────────
  const recentGifts = await db.donation.findMany({ where: { receivedAt: { gte: addDays(today, -10) } }, include: { contact: true }, take: 12 });
  for (const g of recentGifts) {
    if (!g.contact.email) continue;
    await db.emailLog.create({
      data: {
        templateKey: "donation.receipt",
        toEmail: g.contact.email,
        toName: `${g.contact.firstName} ${g.contact.lastName}`,
        subject: "Thank you for your gift to Zachary Horton Foundation",
        body: `Dear ${g.contact.firstName},\n\nThank you for your generous gift of $${(g.amountCents / 100).toFixed(2)}…`,
        status: "LOGGED",
        contactId: g.contactId,
        createdAt: g.receivedAt,
      },
    });
  }

  const counts = {
    contacts: await db.contact.count(),
    donations: await db.donation.count(),
    events: await db.event.count(),
    attendees: await db.attendee.count(),
    opportunities: await db.opportunity.count(),
    registrations: await db.registration.count(),
  };
  console.log("Seeded:", counts);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
