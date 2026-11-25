/* eslint-disable no-console */
/**
 * Prepare an EMPTY production database (run once after `npm run db:deploy`).
 * Idempotent: only creates what is missing; never deletes or overwrites staff edits.
 *
 *   $env:ADMIN_EMAIL="you@zacharyhortonfoundation.org"; $env:ADMIN_NAME="Your Name"
 *   npm run db:init
 *
 * If ADMIN_PASSWORD isn't set, a strong temporary password is generated and printed once.
 * Sign in and change it under Settings → Staff accounts.
 */
process.env.TZ = process.env.ORG_TIMEZONE || "America/Los_Angeles";
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env file */
}

import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { EMAIL_TEMPLATES } from "./email-templates";

const db = new PrismaClient();

const DONOR_LEVELS = [
  { name: "Platinum", minLifetimeCents: 10_000_00, minGifts: 3, rank: 1, color: "violet" },
  { name: "Gold", minLifetimeCents: 5_000_00, minGifts: 2, rank: 2, color: "amber" },
  { name: "Silver", minLifetimeCents: 1_000_00, minGifts: 1, rank: 3, color: "slate" },
  { name: "Bronze", minLifetimeCents: 250_00, minGifts: 1, rank: 4, color: "orange" },
  { name: "Copper", minLifetimeCents: 0, minGifts: 1, rank: 5, color: "rose" },
];
const PROGRAMS = [
  { name: "Indoor Volunteer", description: "Booths, summits, kit assembly and office support.", color: "blue" },
  { name: "Outdoor Volunteer", description: "Deliveries, festivals, outreach and event crews.", color: "green" },
  { name: "Skills-Based & Virtual", description: "Design, social media, web and podcast help from anywhere.", color: "violet" },
];
const SKILLS = [
  "Community Event Representation", "Social Media & Digital Marketing", "Website Development & Maintenance", "Graphic Design (Flyers/Brochures)",
  "Homeless Outreach Support", "Recovery Program Support", "Podcast Production & Support", "Event Setup & Logistics", "Food Distribution",
  "Photography", "Bilingual (Spanish)", "Bilingual (Hmong)", "Data Entry & Admin",
];
const BADGES = [
  { name: "Bronze – 10 Hours", tier: "BRONZE", kind: "HOURS", hoursThreshold: 10, description: "Logged 10 approved volunteer hours" },
  { name: "Silver – 25 Hours", tier: "SILVER", kind: "HOURS", hoursThreshold: 25, description: "Logged 25 approved volunteer hours" },
  { name: "Gold – 50 Hours", tier: "GOLD", kind: "HOURS", hoursThreshold: 50, description: "Logged 50 approved volunteer hours" },
  { name: "Gold – 100 Hours", tier: "GOLD", kind: "HOURS", hoursThreshold: 100, description: "Logged 100 approved volunteer hours" },
  ...["BRONZE", "SILVER", "GOLD"].flatMap((tier) =>
    ["Community Champion", "I Made a Difference", "Outstanding Service"].map((n) => ({
      name: `${tier[0]}${tier.slice(1).toLowerCase()} – ${n}`,
      tier,
      kind: "RECOGNITION",
      hoursThreshold: null as number | null,
      description: `${n} recognition (${tier.toLowerCase()})`,
    })),
  ),
];

async function main() {
  const created: string[] = [];

  for (const t of EMAIL_TEMPLATES) {
    const exists = await db.emailTemplate.findUnique({ where: { key: t.key } });
    if (!exists) {
      await db.emailTemplate.create({ data: t });
      created.push(`email template ${t.key}`);
    }
  }
  if (!(await db.donorLevel.count())) {
    for (const l of DONOR_LEVELS) await db.donorLevel.create({ data: l });
    created.push("donor levels");
  }
  if (!(await db.fund.findFirst({ where: { isDefault: true } }))) {
    await db.fund.upsert({ where: { name: "General Fund" }, create: { name: "General Fund", description: "Where the need is greatest", isDefault: true }, update: { isDefault: true } });
    created.push("default fund");
  }
  if (!(await db.campaign.findFirst({ where: { isDefault: true } }))) {
    await db.campaign.upsert({
      where: { slug: "website" },
      create: { name: "Website Donation Form", slug: "website", isDefault: true, description: "Default campaign for online gifts" },
      update: { isDefault: true },
    });
    created.push("default campaign");
  }
  if (!(await db.program.count())) {
    for (const p of PROGRAMS) await db.program.create({ data: p });
    created.push("volunteer programs");
  }
  if (!(await db.skill.count())) {
    for (const name of SKILLS) await db.skill.create({ data: { name } });
    created.push("volunteer skills");
  }
  for (const b of BADGES) {
    if (!(await db.badge.findUnique({ where: { name: b.name } }))) {
      await db.badge.create({ data: b });
      if (!created.includes("badges")) created.push("badges");
    }
  }

  // First administrator
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim() || "ZHF Administrator";
  let generated: string | null = null;
  if (email) {
    if (await db.user.findUnique({ where: { email } })) {
      console.log(`Admin ${email} already exists — leaving it unchanged.`);
    } else {
      let password = process.env.ADMIN_PASSWORD ?? "";
      if (password && password.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters.");
      if (!password) password = generated = randomBytes(12).toString("base64url");
      await db.user.create({ data: { email, name, role: "ADMIN", passwordHash: await bcrypt.hash(password, 10) } });
      created.push(`admin account ${email}`);
    }
  } else if (!(await db.user.count())) {
    console.log("No staff accounts exist yet. Re-run with ADMIN_EMAIL (and optionally ADMIN_NAME / ADMIN_PASSWORD) set.");
  }

  // Refuse to leave demo logins on a real database
  const demo = await db.user.findMany({ where: { email: { in: ["admin@zhf.test", "coordinator@zhf.test"] } } });
  if (demo.length) console.warn(`⚠ Demo staff accounts found (${demo.map((d) => d.email).join(", ")}). Untick "Active" for them under Settings → Staff accounts.`);

  console.log(created.length ? `Created: ${created.join(", ")}` : "Nothing to do — database already initialised.");
  if (generated) {
    console.log("\nTemporary admin password (shown once — sign in and change it now):");
    console.log(`  ${generated}\n`);
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
