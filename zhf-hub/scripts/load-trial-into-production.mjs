#!/usr/bin/env node
/**
 * ZHF Hub — copy a verified trial migration into the production (Postgres) database.
 *
 * Why: scripts/migrate-from-dynamics.ts makes ~15,000 small queries. Over a slow link to Supabase
 * that takes hours. Instead, run the migration into a local trial database (docs/03-migration-plan.md,
 * Step 3), reconcile it, then copy it with this script: a few dozen round trips inside ONE
 * transaction, so production gets everything or nothing.
 *
 * Safety:
 *  - Refuses to run when production already holds constituents, gifts, events or opportunities.
 *  - Setup records production already has (funds, campaigns, programs, skills, badges, tags) are
 *    matched by name and reused, not duplicated; AHA's ids are stored on them as legacyId so later
 *    migration runs recognise them.
 *  - Staff accounts, settings, email templates and donor levels are never copied.
 *
 * Env: TRIAL_DB = path to the trial SQLite file; PROD_DATABASE_URL = Postgres URL with ?schema=zhf.
 * Normally run through scripts/load-to-supabase.ps1, which asks for the password at a hidden prompt.
 * Add --check to print the plan without writing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

process.env.TZ = process.env.ORG_TIMEZONE || "America/Los_Angeles";
const CHECK = process.argv.includes("--check");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const trialPath = process.env.TRIAL_DB ? path.resolve(process.env.TRIAL_DB) : "";
const prodUrl = process.env.PROD_DATABASE_URL ?? "";
if (!trialPath || !existsSync(trialPath)) throw new Error("Set TRIAL_DB to the trial SQLite file.");
if (!/^postgres(ql)?:\/\//.test(prodUrl)) throw new Error("Set PROD_DATABASE_URL to the production Postgres URL.");
const dbSchema = new URL(prodUrl).searchParams.get("schema") || "public";

// A Postgres build of the Prisma client in its own folder, so the app's local (SQLite) client is untouched.
const pgDir = path.join(root, "node_modules", ".prisma-pg");
const pgSchemaFile = path.join(pgDir, "schema.prisma");
const pgSchema = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8")
  .replace(/(datasource\s+db\s*\{[^}]*?provider\s*=\s*)"(sqlite|postgresql)"/, '$1"postgresql"')
  .replace(/(generator\s+client\s*\{)/, '$1\n  output = "./client"');
if (!existsSync(pgSchemaFile) || readFileSync(pgSchemaFile, "utf8") !== pgSchema || !existsSync(path.join(pgDir, "client", "index.js"))) {
  mkdirSync(pgDir, { recursive: true });
  writeFileSync(pgSchemaFile, pgSchema);
  console.log("Preparing the Postgres database client...");
  try {
    execFileSync(process.execPath, [path.join(root, "node_modules", "prisma", "build", "index.js"), "generate", "--schema", pgSchemaFile], { cwd: root, stdio: "pipe" });
  } catch (e) {
    console.error(String(e.stderr ?? e.message));
    throw new Error("Could not prepare the Postgres client.");
  }
}
const { PrismaClient: PgClient } = require(path.join(pgDir, "client"));
const { PrismaClient: TrialClient } = require("@prisma/client");

const trial = new TrialClient({ datasourceUrl: `file:${trialPath.replace(/\\/g, "/")}` });
const prod = new PgClient({ datasourceUrl: prodUrl });
const norm = (s) => String(s ?? "").trim().toLowerCase();
const usd = (c) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  // ── read the whole trial database ──
  const T = {};
  for (const m of ["fund", "campaign", "program", "skill", "badge", "tag", "contact", "recurringPlan", "donation", "event", "ticketType", "eventQuestion", "eventOrder", "attendee", "opportunity", "shift", "registration", "volunteerHour", "volunteerApplication", "volunteerSkill", "contactBadge", "counter"])
    T[m] = await trial[m].findMany();
  const contactTags = await trial.contact.findMany({ where: { tags: { some: {} } }, select: { id: true, tags: { select: { id: true } } } });
  const oppSkills = await trial.opportunity.findMany({ where: { skills: { some: {} } }, select: { id: true, skills: { select: { id: true } } } });
  console.log(`Trial database: ${T.contact.length} constituents, ${T.donation.length} gifts, ${T.event.length} events, ${T.opportunity.length} opportunities.`);

  // ── production must not hold migrated data yet ──
  const busy = { constituents: await prod.contact.count(), gifts: await prod.donation.count(), events: await prod.event.count(), opportunities: await prod.opportunity.count() };
  console.log(`Production now: ${Object.entries(busy).map(([k, v]) => `${v} ${k}`).join(", ")}.`);
  if (Object.values(busy).some((n) => n > 0)) throw new Error("Production already holds data - nothing was copied. (Use migrate-from-dynamics.ts to update it instead.)");
  const levels = new Set((await prod.donorLevel.findMany()).map((l) => l.name));
  const missingLevels = [...new Set(T.contact.map((c) => c.donorLevel).filter(Boolean))].filter((l) => !levels.has(l));
  if (missingLevels.length) throw new Error(`Production is missing donor levels: ${missingLevels.join(", ")}. Run db:init first.`);

  const ops = [];
  const summary = [];

  // ── setup records: reuse production's by name, create the rest ──
  async function mapByName(model, keyOf) {
    const prodRows = await prod[model].findMany();
    const prodIds = new Set(prodRows.map((r) => r.id));
    const byKey = new Map(prodRows.map((r) => [keyOf(r), r]));
    const map = new Map();
    const create = [];
    let reused = 0;
    let merged = 0;
    for (const t of T[model]) {
      const p = byKey.get(keyOf(t));
      if (!p) {
        map.set(t.id, t.id);
        create.push(t);
        byKey.set(keyOf(t), t); // a later trial row with the same name (e.g. different capitals) maps here
        continue;
      }
      map.set(t.id, p.id);
      if (prodIds.has(p.id)) reused++;
      else merged++;
      if (t.legacyId && !p.legacyId) {
        p.legacyId = t.legacyId; // rows still to be created carry it in their createMany data
        if (prodIds.has(p.id)) ops.push(prod[model].update({ where: { id: p.id }, data: { legacyId: t.legacyId } }));
      }
    }
    if (create.length) ops.push(prod[model].createMany({ data: create }));
    summary.push(`${model}: ${reused} matched existing, ${create.length} new${merged ? `, ${merged} merged into a new one` : ""}`);
    return map;
  }
  const fundMap = await mapByName("fund", (r) => norm(r.name));
  const programMap = await mapByName("program", (r) => norm(r.name));
  const skillMap = await mapByName("skill", (r) => norm(r.name));
  const badgeMap = await mapByName("badge", (r) => norm(r.name));
  const tagMap = await mapByName("tag", (r) => norm(r.name));

  // campaigns: same slug, or an AHA campaign with the same name as a built-in one (e.g. "Website Donation Form")
  const campaignMap = new Map();
  {
    const prodRows = await prod.campaign.findMany();
    const bySlug = new Map(prodRows.map((r) => [r.slug, r]));
    const builtInByName = new Map(prodRows.filter((r) => !r.legacyId).map((r) => [norm(r.name), r]));
    const create = [];
    let reused = 0;
    for (const t of T.campaign) {
      const p = bySlug.get(t.slug) ?? (t.legacyId ? builtInByName.get(norm(t.name)) : undefined);
      if (p && p !== t) {
        campaignMap.set(t.id, p.id);
        reused++;
        if (t.legacyId && !p.legacyId) {
          p.legacyId = t.legacyId;
          builtInByName.delete(norm(p.name));
          ops.push(prod.campaign.update({ where: { id: p.id }, data: { legacyId: t.legacyId } }));
        }
      } else {
        campaignMap.set(t.id, t.id);
        create.push(t);
      }
    }
    if (create.length) ops.push(prod.campaign.createMany({ data: create }));
    summary.push(`campaign: ${reused} matched existing, ${create.length} new`);
  }
  const remap = (map, id) => (id == null ? id : (map.get(id) ?? id));

  // ── the migrated records themselves (ids kept, so all links stay intact) ──
  const bulk = (model, rows) => {
    if (!rows.length) return;
    const cols = Object.keys(rows[0]).length || 1;
    const size = Math.max(50, Math.floor(20000 / cols));
    for (let i = 0; i < rows.length; i += size) ops.push(prod[model].createMany({ data: rows.slice(i, i + size) }));
    summary.push(`${model}: ${rows.length}`);
  };
  const uniqueBy = (rows, key) => [...new Map(rows.map((r) => [key(r), r])).values()];
  bulk("contact", T.contact);
  bulk("recurringPlan", T.recurringPlan.map((r) => ({ ...r, campaignId: remap(campaignMap, r.campaignId), fundId: remap(fundMap, r.fundId) })));
  bulk("donation", T.donation.map((r) => ({ ...r, campaignId: remap(campaignMap, r.campaignId), fundId: remap(fundMap, r.fundId) })));
  bulk("event", T.event.map((r) => ({ ...r, campaignId: remap(campaignMap, r.campaignId) })));
  bulk("ticketType", T.ticketType);
  bulk("eventQuestion", T.eventQuestion);
  bulk("eventOrder", T.eventOrder);
  bulk("attendee", T.attendee);
  bulk("opportunity", T.opportunity.map((r) => ({ ...r, programId: remap(programMap, r.programId) })));
  bulk("shift", T.shift);
  bulk("registration", T.registration);
  bulk("volunteerHour", T.volunteerHour);
  bulk("volunteerApplication", T.volunteerApplication);
  bulk("volunteerSkill", uniqueBy(T.volunteerSkill.map((r) => ({ ...r, skillId: remap(skillMap, r.skillId) })), (r) => `${r.contactId}|${r.skillId}|${r.kind}`));
  bulk("contactBadge", uniqueBy(T.contactBadge.map((r) => ({ ...r, badgeId: remap(badgeMap, r.badgeId) })), (r) => `${r.contactId}|${r.badgeId}`));

  // implicit many-to-many tables (A = first model alphabetically)
  const joinInsert = (table, pairs) => {
    const uniq = [...new Set(pairs.map(([a, b]) => `${a}|${b}`))].map((s) => s.split("|"));
    for (let i = 0; i < uniq.length; i += 1000) {
      const chunk = uniq.slice(i, i + 1000);
      const values = chunk.map((_, j) => `($${2 * j + 1}, $${2 * j + 2})`).join(", ");
      ops.push(prod.$executeRawUnsafe(`INSERT INTO "${dbSchema}"."${table}" ("A", "B") VALUES ${values} ON CONFLICT DO NOTHING`, ...chunk.flat()));
    }
    summary.push(`${table}: ${uniq.length} links`);
  };
  joinInsert("_ContactToTag", contactTags.flatMap((c) => c.tags.map((t) => [c.id, remap(tagMap, t.id)])));
  if (oppSkills.length) joinInsert("_OpportunityToSkill", oppSkills.flatMap((o) => o.skills.map((s) => [o.id, remap(skillMap, s.id)])));

  // receipt / constituent / order numbers continue after the migrated ones
  const prodCounters = new Map((await prod.counter.findMany()).map((c) => [c.name, c.value]));
  for (const c of T.counter) {
    const value = Math.max(c.value, prodCounters.get(c.name) ?? 0);
    ops.push(prod.counter.upsert({ where: { name: c.name }, create: { name: c.name, value }, update: { value } }));
  }

  console.log("\nPlan:\n  " + summary.join("\n  "));
  console.log(`  (${ops.length} database operations in one transaction)`);
  if (CHECK) {
    console.log("\n--check: nothing was written.");
    return;
  }

  console.log("\nCopying... (all or nothing)");
  const t0 = Date.now();
  await prod.$transaction(ops);
  console.log(`Done in ${Math.round((Date.now() - t0) / 1000)} s.\n`);

  // ── verify ──
  const models = ["contact", "donation", "recurringPlan", "event", "ticketType", "eventOrder", "attendee", "opportunity", "shift", "registration", "volunteerHour", "volunteerApplication", "volunteerSkill", "contactBadge"];
  let ok = true;
  for (const m of models) {
    const [a, b] = [await prod[m].count(), m === "volunteerSkill" || m === "contactBadge" ? null : T[m].length];
    if (b !== null && a !== b) ok = false;
    console.log(`  ${m.padEnd(22)} production ${String(a).padStart(5)}${b === null ? "" : `   trial ${String(b).padStart(5)}${a === b ? "" : "   MISMATCH"}`}`);
  }
  const gifts = await prod.donation.findMany({ select: { amountCents: true, receivedAt: true } });
  const byYear = {};
  for (const g of gifts) byYear[g.receivedAt.getFullYear()] = (byYear[g.receivedAt.getFullYear()] ?? 0) + g.amountCents;
  console.log("\n  Gifts by year in production: " + Object.entries(byYear).sort().map(([y, c]) => `${y} ${usd(c)}`).join(" | "));
  console.log(ok ? "\nAll record counts match the trial copy." : "\nSome counts differ - check the lines marked MISMATCH.");
}

main()
  .catch((e) => {
    console.error(`\nStopped: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await trial.$disconnect();
    await prod.$disconnect();
  });
