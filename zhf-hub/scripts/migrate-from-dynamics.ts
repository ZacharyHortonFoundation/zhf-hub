/* eslint-disable no-console */
/**
 * Migrate ZHF data out of Dynamics 365 / Dataverse (AHA "Aha Impact") into ZHF Hub.
 *
 * Run from the zhf-hub folder (PowerShell). The live AHA environment is zacharyprod:
 *   $env:DYNAMICS_URL = "https://zacharyprod.crm.dynamics.com"
 *   npx tsx scripts/migrate-from-dynamics.ts --inspect     # row counts + column names per table
 *   npx tsx scripts/migrate-from-dynamics.ts               # DRY RUN: reads everything, writes nothing
 *   npx tsx scripts/migrate-from-dynamics.ts --commit      # writes to DATABASE_URL
 *
 * Sign-in: the script prints a short code and the address https://microsoft.com/devicelogin.
 * Open it, enter the code and sign in with a Microsoft account that can read the AHA data
 * (no Azure CLI needed; the token stays in memory). If you already have a token (for example
 * from `az account get-access-token --resource <url>`), set $env:DYNAMICS_TOKEN instead.
 *
 * Safe to re-run: every record keeps its Dataverse id in `legacyId` and is upserted on it.
 * Field names were checked against the live zacharyprod metadata on 2026-11-25; the older
 * names from the zacharydev sandbox are kept as fallbacks.
 */
process.env.TZ = process.env.ORG_TIMEZONE || "America/Los_Angeles";

import { PrismaClient } from "@prisma/client";

const BASE = (process.env.DYNAMICS_URL ?? "").replace(/\/$/, "");
let TOKEN = process.env.DYNAMICS_TOKEN ?? "";
const argv = new Set(process.argv.slice(2));
const COMMIT = argv.has("--commit");
const INSPECT = argv.has("--inspect");
const db = new PrismaClient();

type Row = Record<string, unknown>;
const FV = "@OData.Community.Display.V1.FormattedValue";
const LN = "@Microsoft.Dynamics.CRM.lookuplogicalname";

if (!BASE) {
  console.error('Set DYNAMICS_URL first, e.g. $env:DYNAMICS_URL = "https://zacharyprod.crm.dynamics.com"');
  process.exit(1);
}

/** Device-code sign-in (Microsoft identity platform). The user signs in in their own browser. */
async function signIn(): Promise<string> {
  // Microsoft's public client id for the Azure CLI, which is allowed to request Dataverse tokens.
  const clientId = process.env.DYNAMICS_CLIENT_ID ?? "04b07795-8ddb-461a-bbee-02f9e1bf7b46";
  const tenant = process.env.DYNAMICS_TENANT ?? "organizations";
  const auth = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
  const dc = (await fetch(`${auth}/devicecode`, {
    method: "POST",
    body: new URLSearchParams({ client_id: clientId, scope: `${BASE}/.default` }),
  }).then((r) => r.json())) as { device_code?: string; message?: string; interval?: number; expires_in?: number; error_description?: string };
  if (!dc.device_code) throw new Error(`Sign-in could not start: ${dc.error_description ?? "unknown error"}`);
  console.log(`\n${dc.message}\n`);
  const deadline = Date.now() + (dc.expires_in ?? 900) * 1000;
  let wait = (dc.interval ?? 5) * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, wait));
    const t = (await fetch(`${auth}/token`, {
      method: "POST",
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: clientId, device_code: dc.device_code }),
    }).then((r) => r.json())) as { access_token?: string; error?: string; error_description?: string };
    if (t.access_token) {
      console.log("Signed in.\n");
      return t.access_token;
    }
    if (t.error === "slow_down") wait += 5000;
    else if (t.error !== "authorization_pending") throw new Error(`Sign-in failed: ${t.error_description ?? t.error}`);
  }
  throw new Error("Sign-in timed out — run the script again.");
}

const headers = (extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/json",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
  ...extra,
});
async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api/data/v9.2/${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

/**
 * AHA stores event/shift/opportunity times as "time-zone independent" (Pacific wall-clock time sent
 * with a misleading "Z"), and birthdays as date-only. Find those columns from the table metadata so
 * they are read as Pacific local time instead of UTC (otherwise times land 7–8 hours early).
 */
let entityNames: Map<string, string> | null = null;
const localDateCols = new Map<string, Set<string>>();
async function localDateColumns(entitySet: string): Promise<Set<string>> {
  const cached = localDateCols.get(entitySet);
  if (cached) return cached;
  const cols = new Set<string>();
  try {
    if (!entityNames) {
      const defs = await api<{ value: { LogicalName: string; EntitySetName: string | null }[] }>("EntityDefinitions?$select=LogicalName,EntitySetName");
      entityNames = new Map(defs.value.filter((d) => d.EntitySetName).map((d) => [d.EntitySetName!, d.LogicalName]));
    }
    const logical = entityNames.get(entitySet);
    if (logical) {
      const attrs = await api<{ value: { LogicalName: string; DateTimeBehavior?: { Value?: string } }[] }>(
        `EntityDefinitions(LogicalName='${logical}')/Attributes/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata?$select=LogicalName,DateTimeBehavior`,
      );
      for (const a of attrs.value) if (a.DateTimeBehavior?.Value && a.DateTimeBehavior.Value !== "UserLocal") cols.add(a.LogicalName);
    }
  } catch (e) {
    console.warn(`  (could not read date settings for ${entitySet}; times are read as UTC) ${(e as Error).message.slice(0, 120)}`);
  }
  localDateCols.set(entitySet, cols);
  return cols;
}

async function* fetchAll(entitySet: string): AsyncGenerator<Row> {
  const localCols = await localDateColumns(entitySet);
  let url: string | null = `${BASE}/api/data/v9.2/${entitySet}`;
  while (url) {
    const res: Response = await fetch(url, {
      headers: headers({
        Prefer: `odata.include-annotations="OData.Community.Display.V1.FormattedValue,Microsoft.Dynamics.CRM.lookuplogicalname",odata.maxpagesize=500`,
      }),
    });
    if (res.status === 404) {
      console.warn(`  (table ${entitySet} not found — skipping)`);
      return;
    }
    if (!res.ok) throw new Error(`${entitySet}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    const j = (await res.json()) as { value: Row[]; "@odata.nextLink"?: string };
    for (const r of j.value) {
      for (const c of localCols) {
        const v = r[c];
        if (typeof v === "string") r[c] = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : v.replace(/Z$/, "");
      }
      yield r;
    }
    url = j["@odata.nextLink"] ?? null;
  }
}
async function all(entitySet: string) {
  const out: Row[] = [];
  for await (const r of fetchAll(entitySet)) out.push(r);
  return out;
}

// ── small field helpers ──
const pick = (r: Row, keys: string[]): unknown => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== null && r[k] !== "") return r[k];
  return null;
};
const s = (r: Row, ...keys: string[]) => {
  const v = pick(r, keys);
  return v === null ? null : String(v).trim() || null;
};
const n = (r: Row, ...keys: string[]) => {
  const v = pick(r, keys);
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : null;
};
const d = (r: Row, ...keys: string[]) => {
  const v = pick(r, keys);
  if (!v) return null;
  const x = new Date(String(v));
  return isNaN(x.getTime()) ? null : x;
};
const b = (r: Row, ...keys: string[]) => pick(r, keys) === true;
/** first non-zero amount (AHA sometimes leaves one money column at 0 and fills another) */
const money = (r: Row, ...keys: string[]) => {
  for (const k of keys) {
    const v = n(r, k);
    if (v) return v;
  }
  return null;
};
const fmt = (r: Row, key: string) => (r[`${key}${FV}`] as string | undefined) ?? null;
const lookup = (r: Row, ...attrs: string[]) => s(r, ...attrs.map((a) => `_${a}_value`));
const cents = (x: number | null) => (x === null ? 0 : Math.round(x * 100));
const nameOf = (r: Row) => {
  // first non-empty "...name" string attribute (tables differ: aha_name, msnfp_name, aha_eventname…)
  const k = Object.keys(r).find((k) => /(^|_)(name|title)$/.test(k) && !k.startsWith("_") && typeof r[k] === "string" && r[k]);
  return k ? String(r[k]) : null;
};

const stats: Record<string, { read: number; written: number; skipped: number }> = {};
const stat = (k: string) => (stats[k] ??= { read: 0, written: 0, skipped: 0 });
// gift totals per calendar year (Pacific), to reconcile against AHA's dashboard
const giftsByYear: Record<number, { count: number; cents: number; ahaDonationCents: number }> = {};

async function counter(name: "donation" | "order" | "constituent") {
  const row = await db.counter.upsert({
    where: { name },
    create: { name, value: { donation: 10001, order: 5001, constituent: 1001 }[name] },
    update: { value: { increment: 1 } },
  });
  return row.value;
}

const TABLES = [
  "contacts", "accounts", "msnfp_designations", "aha_donationcampaigns", "msnfp_transactions", "aha_subscriptions",
  "aha_events", "aha_eventtickettypes", "aha_eventattendees", "salesorders", "msnfp_deliveryframeworks",
  "msnfp_engagementopportunities", "aha_shifts", "msnfp_participations", "aha_volunteerhours", "aha_volunteerapplications", "msnfp_qualifications",
  "aha_eventquestions", "aha_eventanswers", "aha_tags", "connections",
  // read by --inspect only (not migrated): pledges and their installment schedules
  "msnfp_donorcommitments", "msnfp_paymentschedules",
];

async function inspect() {
  for (const t of TABLES) {
    const res = await fetch(`${BASE}/api/data/v9.2/${t}?$top=1&$count=true`, {
      headers: headers({ Prefer: `odata.include-annotations="*"` }),
    });
    if (!res.ok) {
      console.log(`${t}: ${res.status}`);
      continue;
    }
    const j = (await res.json()) as { value: Row[]; "@odata.count"?: number };
    const keys = Object.keys(j.value[0] ?? {}).filter((k) => !k.includes("@") && !/^_?(owning|owner|created|modified|versionnumber|timezone|utc|import|overridden)/.test(k));
    console.log(`\n${t}  (${j["@odata.count"] ?? "?"} rows)\n  ${keys.join(", ")}`);
  }
}

async function main() {
  if (!TOKEN) TOKEN = await signIn();
  if (INSPECT) return inspect();
  console.log(COMMIT ? "COMMIT MODE — writing to the ZHF Hub database\n" : "DRY RUN — nothing will be written (add --commit to write)\n");
  const W = COMMIT;

  // ── Funds (designations) ──
  const fundMap = new Map<string, string>();
  for (const r of await all("msnfp_designations")) {
    stat("funds").read++;
    const id = s(r, "msnfp_designationid")!;
    const name = s(r, "msnfp_name") ?? nameOf(r) ?? "Unnamed fund";
    if (!W) continue;
    const existing = await db.fund.findFirst({ where: { OR: [{ legacyId: id }, { name }] } });
    const f = existing
      ? await db.fund.update({ where: { id: existing.id }, data: { legacyId: id } })
      : await db.fund.create({ data: { legacyId: id, name } });
    fundMap.set(id, f.id);
    stat("funds").written++;
  }

  // ── Campaigns ──
  const campaignMap = new Map<string, string>();
  for (const r of await all("aha_donationcampaigns")) {
    stat("campaigns").read++;
    const id = s(r, "aha_donationcampaignid")!;
    const name = (s(r, "aha_name", "aha_campaignname") ?? nameOf(r) ?? "Campaign").replace(/[“”]/g, "");
    if (!W) continue;
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}-${id.slice(0, 4)}`;
    // an AHA campaign with the same name as one of ZHF Hub's built-in campaigns (e.g. "Website
    // Donation Form") is attached to it instead of creating a look-alike
    const builtIn = (await db.campaign.findUnique({ where: { legacyId: id } }))
      ? null
      : (await db.campaign.findMany({ where: { legacyId: null } })).find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
    const c = builtIn
      ? await db.campaign.update({ where: { id: builtIn.id }, data: { legacyId: id } })
      : await db.campaign.upsert({
          where: { legacyId: id },
          create: { legacyId: id, name, slug, goalCents: cents(n(r, "aha_goal", "aha_goalamount", "aha_target")) || null, startDate: d(r, "aha_startdate"), endDate: d(r, "aha_enddate"), active: r.statecode === 0 },
          update: { name },
        });
    campaignMap.set(id, c.id);
    stat("campaigns").written++;
  }

  // ── Constituents ──
  const contactMap = new Map<string, string>();
  const upsertContact = async (legacyId: string, data: Record<string, unknown>) => {
    const existing =
      (await db.contact.findUnique({ where: { legacyId } })) ??
      (data.email ? await db.contact.findFirst({ where: { email: data.email as string, legacyId: null } }) : null);
    if (existing) return db.contact.update({ where: { id: existing.id }, data: { ...data, legacyId } });
    return db.contact.create({ data: { ...(data as object), legacyId, constituentNo: await counter("constituent"), source: "IMPORT" } as never });
  };
  for (const r of await all("contacts")) {
    stat("contacts").read++;
    const id = s(r, "contactid")!;
    const first = s(r, "firstname") ?? "";
    const last = s(r, "lastname") ?? "";
    if (!first && !last && !s(r, "emailaddress1")) {
      stat("contacts").skipped++;
      continue;
    }
    if (!W) continue;
    const c = await upsertContact(id, {
      firstName: first,
      lastName: last,
      email: s(r, "emailaddress1")?.toLowerCase() ?? null,
      phone: s(r, "mobilephone", "telephone1", "telephone2"),
      address1: s(r, "address1_line1"),
      city: s(r, "address1_city"),
      state: s(r, "address1_stateorprovince"),
      zip: s(r, "address1_postalcode"),
      birthday: d(r, "birthdate", "aha_birthday"),
      spouseFirstName: s(r, "aha_spousefirstname", "spousesname"),
      isVip: b(r, "aha_vip"),
      isDeceased: b(r, "msnfp_deceased", "aha_deceased"),
      doNotEmail: b(r, "donotbulkemail", "donotemail"),
      emergencyContactPhone: s(r, "aha_emergencycontactphone"),
      stripeCustomerId: s(r, "aha_paymentcustomerid"),
      createdAt: d(r, "createdon") ?? new Date(),
    });
    contactMap.set(id, c.id);
    stat("contacts").written++;
  }
  for (const r of await all("accounts")) {
    stat("organizations").read++;
    const id = s(r, "accountid")!;
    if (!W) continue;
    const c = await upsertContact(id, {
      type: "BUSINESS",
      orgName: s(r, "name") ?? "Organization",
      email: s(r, "emailaddress1")?.toLowerCase() ?? null,
      phone: s(r, "telephone1"),
      address1: s(r, "address1_line1"),
      city: s(r, "address1_city"),
      state: s(r, "address1_stateorprovince"),
      zip: s(r, "address1_postalcode"),
    });
    contactMap.set(id, c.id);
    stat("organizations").written++;
  }
  const contactIdFor = async (legacy: string | null) =>
    legacy ? (contactMap.get(legacy) ?? (await db.contact.findUnique({ where: { legacyId: legacy } }))?.id ?? null) : null;

  // ── Tags (AHA links them to contacts through Dynamics "connections") ──
  // Some AHA tags (Reduced/Elevated Giving, Consistent Champion, Risk Donor…) were recalculated by AHA;
  // they come over as a snapshot and no longer update — staff can delete the ones they don't want.
  const tagMap = new Map<string, string>();
  for (const r of await all("aha_tags")) {
    stat("tags").read++;
    const name = s(r, "aha_tag", "aha_name") ?? nameOf(r);
    if (!W || !name) continue;
    const t = await db.tag.upsert({ where: { name }, create: { name }, update: {} });
    tagMap.set(s(r, "aha_tagid")!, t.id);
    stat("tags").written++;
  }
  for (const r of await all("connections")) {
    // each link is stored twice (contact→tag and tag→contact); use one direction
    if (r[`_record1id_value${LN}`] !== "contact" || r[`_record2id_value${LN}`] !== "aha_tag") continue;
    stat("tag links").read++;
    if (!W) continue;
    const contactId = await contactIdFor(s(r, "_record1id_value"));
    const tagId = tagMap.get(s(r, "_record2id_value") ?? "");
    if (!contactId || !tagId) {
      stat("tag links").skipped++;
      continue;
    }
    await db.contact.update({ where: { id: contactId }, data: { tags: { connect: { id: tagId } } } });
    stat("tag links").written++;
  }

  // ── Recurring gifts (AHA subscriptions → Stripe subscription ids) ──
  const FREQ = (txt: string | null, fallback = "MONTHLY") => {
    const t = (txt ?? "").toLowerCase();
    return /year|annual/.test(t) ? "ANNUAL" : /quarter/.test(t) ? "QUARTERLY" : /month|week/.test(t) ? "MONTHLY" : fallback;
  };
  const planMap = new Map<string, { id: string; frequency: string }>();
  for (const r of await all("aha_subscriptions")) {
    stat("recurring plans").read++;
    const id = s(r, "aha_subscriptionid")!;
    const stripeSub = s(r, "aha_subscriptionrefid");
    const amount = cents(money(r, "aha_amount", "aha_finalamount"));
    if (!stripeSub?.startsWith("sub_") || !amount) {
      stat("recurring plans").skipped++; // only Stripe subscriptions can keep billing
      continue;
    }
    if (!W) continue;
    const contactId = await contactIdFor(lookup(r, "aha_customer"));
    if (!contactId) {
      stat("recurring plans").skipped++;
      continue;
    }
    const active = r.statecode === 0;
    const frequency = FREQ(fmt(r, "aha_frequency"));
    const data = {
      contactId,
      amountCents: amount,
      feeCoveredCents: cents(n(r, "aha_fee")),
      frequency,
      status: active ? "ACTIVE" : "CANCELED",
      campaignId: campaignMap.get(lookup(r, "aha_donationcampaign") ?? "") ?? null,
      fundId: fundMap.get(lookup(r, "aha_designation") ?? "") ?? null,
      startDate: d(r, "aha_startdate", "createdon") ?? new Date(),
      nextChargeAt: active ? d(r, "aha_nextbillingdate") : null,
      canceledAt: active ? null : d(r, "aha_enddate", "modifiedon"),
    };
    const p = await db.recurringPlan.upsert({ where: { stripeSubscriptionId: stripeSub }, create: { ...data, stripeSubscriptionId: stripeSub }, update: data });
    planMap.set(id, { id: p.id, frequency });
    stat("recurring plans").written++;
  }

  // ── Donations (transactions) ──
  const METHOD: [RegExp, string][] = [[/check|cheque/i, "CHECK"], [/cash/i, "CASH"], [/ach|bank|eft/i, "ACH"], [/in.?kind|goods/i, "IN_KIND"], [/stock|secur/i, "STOCK"], [/card|credit|stripe|online/i, "CARD"]];
  for (const r of await all("msnfp_transactions")) {
    stat("donations").read++;
    const id = s(r, "msnfp_transactionid")!;
    const sub = fmt(r, "_aha_transactionsubcategory_value") ?? "";
    // AHA labels ticket purchases "One Time Payment" in its "Event" category; that revenue comes over
    // with the event orders. Gifts made on event pages, recurring gifts, pledge payments and the odd
    // "One Time Payment" filed under "Donation" are kept.
    const category = fmt(r, "_aha_transactioncategory_value") ?? "";
    if (/ticket|registration|order/i.test(sub) || (/one time payment/i.test(sub) && !/donation/i.test(category))) {
      stat("donations").skipped++;
      continue;
    }
    const contactLegacy = lookup(r, "msnfp_receiptoncontactid", "aha_customer", "msnfp_transaction_receiptonaccountid");
    // $0 rows (e.g. free event sign-ups, or payments AHA recorded only as fair market value) are skipped
    const amount = cents(money(r, "msnfp_amount", "aha_finalamount"));
    const date = d(r, "msnfp_receiveddate", "msnfp_bookdate", "createdon");
    if (!contactLegacy || !amount || !date) {
      stat("donations").skipped++;
      continue;
    }
    const yr = (giftsByYear[date.getFullYear()] ??= { count: 0, cents: 0, ahaDonationCents: 0 });
    yr.count++;
    yr.cents += amount;
    if (/^donation$/i.test(category.trim())) yr.ahaDonationCents += amount;
    if (!W) continue;
    const contactId = contactMap.get(contactLegacy) ?? (await db.contact.findUnique({ where: { legacyId: contactLegacy } }))?.id;
    if (!contactId) {
      stat("donations").skipped++;
      continue;
    }
    const statusTxt = (fmt(r, "statuscode") ?? "").toLowerCase();
    const status = /refund/.test(statusTxt) ? "REFUNDED" : /fail|declin|cancel|void/.test(statusTxt) ? "FAILED" : /pend/.test(statusTxt) ? "PENDING" : "SUCCEEDED";
    const methodTxt = fmt(r, "aha_paymentmethod") ?? "";
    const dedication = fmt(r, "aha_dedication") ?? "";
    const fee = cents(n(r, "aha_coveredprocessingfee"));
    const plan = planMap.get(lookup(r, "aha_subscription") ?? "");
    const data = {
      contactId,
      amountCents: amount,
      feeCoveredCents: fee,
      totalCents: amount + fee,
      receivedAt: date,
      createdAt: date,
      frequency: /recurr/i.test(sub) ? FREQ(sub) : plan ? plan.frequency : "ONE_TIME",
      recurringPlanId: plan?.id ?? null,
      method: METHOD.find(([re]) => re.test(methodTxt))?.[1] ?? "CARD",
      checkNumber: s(r, "aha_checknumber"),
      status,
      source: "IMPORT",
      campaignId: campaignMap.get(lookup(r, "aha_donationcampaign", "aha_campaign") ?? "") ?? null,
      fundId: fundMap.get(lookup(r, "aha_designation") ?? "") ?? null,
      anonymous: /anonym/i.test(fmt(r, "msnfp_anonymity") ?? "") && !/not/i.test(fmt(r, "msnfp_anonymity") ?? ""),
      dedicationType: /memor/i.test(dedication) ? "MEMORY" : /honor|honour/i.test(dedication) ? "HONOR" : null,
      dedicationName: s(r, "aha_honoreememorialname"),
      notifyName: s(r, "aha_recipientname"),
      notifyEmail: s(r, "aha_recipientemail"),
      notifyMessage: s(r, "aha_personalmessage"),
      matchingEmployer: b(r, "aha_employermatch") ? s(r, "aha_employername") : null,
      comments: s(r, "aha_additionalcomments"),
      inKindDescription: s(r, "aha_goodsdonated"),
      receiptSentAt: date,
    };
    const existing = await db.donation.findUnique({ where: { legacyId: id } });
    if (existing) await db.donation.update({ where: { id: existing.id }, data });
    else await db.donation.create({ data: { ...data, legacyId: id, number: await counter("donation") } });
    stat("donations").written++;
  }

  // ── Events, tickets, orders, attendees ──
  const eventMap = new Map<string, string>();
  for (const r of await all("aha_events")) {
    stat("events").read++;
    const id = s(r, "aha_eventid")!;
    const title = s(r, "aha_eventname") ?? nameOf(r) ?? "Event";
    const start = d(r, "aha_startdate");
    if (!start) {
      stat("events").skipped++;
      continue;
    }
    if (!W) continue;
    const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}-${start.getFullYear()}-${id.slice(0, 4)}`;
    const ev = await db.event.upsert({
      where: { legacyId: id },
      create: {
        legacyId: id,
        slug,
        title,
        summary: s(r, "aha_shortdescription"),
        description: s(r, "aha_description"),
        imageUrl: s(r, "aha_image_url") ? `${BASE}${s(r, "aha_image_url")}` : null,
        category: fmt(r, "aha_eventtype") ?? "Community",
        startAt: start,
        endAt: d(r, "aha_enddate"),
        venueName: s(r, "aha_venuename"),
        address: s(r, "aha_location"),
        city: s(r, "aha_city"),
        capacity: b(r, "aha_hascapacityconstraint") ? n(r, "aha_maxcapacity") : null,
        registrationDeadline: d(r, "aha_lastdatetoregister"),
        status: b(r, "aha_displayonweb") ? "PUBLISHED" : "DRAFT",
        allowDonation: b(r, "aha_allowadditionaldonation"),
        coverFeeEnabled: b(r, "aha_allowtocoverticketprocessingfee"),
        collectAttendeeInfo: b(r, "aha_needattendeeinfo"),
      },
      update: { title },
    });
    eventMap.set(id, ev.id);
    stat("events").written++;
  }
  const ticketMap = new Map<string, string>();
  for (const r of await all("aha_eventtickettypes")) {
    stat("ticket types").read++;
    const id = s(r, "aha_eventtickettypeid")!;
    const eventId = eventMap.get(lookup(r, "aha_event") ?? "");
    if (!W) continue;
    if (!eventId) {
      stat("ticket types").skipped++;
      continue;
    }
    const t = await db.ticketType.upsert({
      where: { legacyId: id },
      create: {
        legacyId: id,
        eventId,
        name: s(r, "aha_ticketname") ?? "Ticket",
        priceCents: b(r, "aha_free") ? 0 : cents(n(r, "aha_price", "aha_ticketprice", "aha_amount", "aha_cost")),
        attendeesPerTicket: n(r, "aha_attendeesperticket") ?? 1,
        countsTowardCapacity: r.aha_countstowardcapacity !== false,
        active: b(r, "aha_displayonweb"),
      },
      update: {},
    });
    ticketMap.set(id, t.id);
    stat("ticket types").written++;
  }
  const orders = new Map<string, Row>();
  for (const r of await all("salesorders")) orders.set(String(r.salesorderid), r);
  const orderMap = new Map<string, string>();
  for (const r of await all("aha_eventattendees")) {
    stat("attendees").read++;
    const id = s(r, "aha_eventattendeeid")!;
    const eventId = eventMap.get(lookup(r, "aha_event") ?? "");
    if (!W) continue;
    if (!eventId) {
      stat("attendees").skipped++;
      continue;
    }
    let ticketTypeId = ticketMap.get(lookup(r, "aha_ticket") ?? "");
    if (!ticketTypeId) {
      const t = await db.ticketType.findFirst({ where: { eventId } }) ?? (await db.ticketType.create({ data: { eventId, name: "General admission" } }));
      ticketTypeId = t.id;
    }
    const contactLegacy = lookup(r, "aha_attendee", "aha_account");
    const contactId = contactLegacy ? (contactMap.get(contactLegacy) ?? (await db.contact.findUnique({ where: { legacyId: contactLegacy } }))?.id ?? null) : null;
    const orderLegacy = lookup(r, "aha_order") ?? `att-${id}`;
    let orderId = orderMap.get(orderLegacy);
    if (!orderId) {
      const o = orders.get(orderLegacy);
      const buyerLegacy = o ? lookup(o, "customerid", "aha_contact") : null;
      const buyer = (buyerLegacy && contactMap.get(buyerLegacy)) || contactId;
      if (!buyer) {
        stat("attendees").skipped++;
        continue;
      }
      const total = cents(o ? n(o, "totalamount") : 0);
      const existing = await db.eventOrder.findUnique({ where: { legacyId: orderLegacy } });
      const order =
        existing ??
        (await db.eventOrder.create({
          data: { legacyId: orderLegacy, number: await counter("order"), eventId, contactId: buyer, subtotalCents: total, totalCents: total, status: "PAID", createdAt: d(r, "aha_registereddate", "createdon") ?? new Date() },
        }));
      orderId = order.id;
      orderMap.set(orderLegacy, orderId);
    }
    const [first, ...rest] = (s(r, "aha_name") ?? "Guest").split(" ");
    await db.attendee.upsert({
      where: { legacyId: id },
      create: {
        legacyId: id,
        orderId,
        eventId,
        ticketTypeId,
        contactId,
        firstName: first ?? "Guest",
        lastName: rest.join(" "),
        email: s(r, "aha_email"),
        ticketCode: id.replace(/-/g, "").slice(0, 10).toUpperCase(),
        checkedInAt: b(r, "aha_attended") ? d(r, "aha_registereddate") ?? new Date() : null,
      },
      update: {},
    });
    stat("attendees").written++;
  }

  // ── Event registration questions and answers ──
  const questionMap = new Map<string, string>();
  for (const r of await all("aha_eventquestions")) {
    stat("event questions").read++;
    const eventId = eventMap.get(lookup(r, "aha_event") ?? "");
    if (!W) continue;
    if (!eventId) {
      stat("event questions").skipped++;
      continue;
    }
    const label = s(r, "aha_question") ?? "Question";
    const typeTxt = (fmt(r, "aha_questiontype") ?? "").toLowerCase();
    // AHA can repeat the same question per ticket type; ZHF Hub asks it once per event
    const q =
      (await db.eventQuestion.findFirst({ where: { eventId, label } })) ??
      (await db.eventQuestion.create({
        data: {
          eventId,
          label,
          type: /check|yes|bool/.test(typeTxt) ? "CHECKBOX" : "TEXT",
          required: b(r, "aha_isrequired"),
          sortOrder: n(r, "aha_displayorder") ?? 0,
        },
      }));
    questionMap.set(s(r, "aha_eventquestionid")!, q.id);
    stat("event questions").written++;
  }
  for (const r of await all("aha_eventanswers")) {
    stat("event answers").read++;
    if (!W) continue;
    const attendeeLegacy = lookup(r, "aha_attendee");
    const questionId = questionMap.get(lookup(r, "aha_question") ?? "");
    const value = s(r, "aha_value");
    const attendee = attendeeLegacy ? await db.attendee.findUnique({ where: { legacyId: attendeeLegacy } }) : null;
    if (!attendee || !questionId || !value) {
      stat("event answers").skipped++;
      continue;
    }
    const answers = { ...(JSON.parse(attendee.answers ?? "{}") as Record<string, string>), [questionId]: value };
    await db.attendee.update({ where: { id: attendee.id }, data: { answers: JSON.stringify(answers) } });
    stat("event answers").written++;
  }

  // ── Volunteer programs, opportunities, shifts ──
  const programMap = new Map<string, string>();
  for (const r of await all("msnfp_deliveryframeworks")) {
    stat("programs").read++;
    const id = s(r, "msnfp_deliveryframeworkid")!;
    const name = (s(r, "msnfp_name") ?? nameOf(r) ?? "Program").replace(/^[^\w]+/, "").trim();
    if (!W) continue;
    // AHA writes "INDOOR VOLUNTEER"; ZHF Hub's built-in program is "Indoor Volunteer" — match ignoring capitals
    const existing =
      (await db.program.findUnique({ where: { legacyId: id } })) ??
      (await db.program.findMany({ where: { legacyId: null } })).find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
    const p = existing ? await db.program.update({ where: { id: existing.id }, data: { legacyId: id } }) : await db.program.create({ data: { legacyId: id, name } });
    programMap.set(id, p.id);
    stat("programs").written++;
  }
  const oppMap = new Map<string, string>();
  const oppRows = await all("msnfp_engagementopportunities");
  for (const r of oppRows) {
    stat("opportunities").read++;
    const id = s(r, "msnfp_engagementopportunityid")!;
    if (!W) continue;
    // the program link is in aha_program on the live system (msnfp_deliveryframeworkid is empty there):
    // use whichever program column actually has a value
    const programLegacy = Object.keys(r).find((k) => /_program_value$|_msnfp_deliveryframeworkid_value$/.test(k) && r[k]);
    const outdoors = fmt(r, "aha_outdoors") ?? "";
    const o = await db.opportunity.upsert({
      where: { legacyId: id },
      create: {
        legacyId: id,
        title: s(r, "msnfp_engagementopportunitytitle") ?? nameOf(r) ?? "Opportunity",
        description: s(r, "msnfp_description"),
        location: s(r, "msnfp_location"),
        programId: programLegacy ? programMap.get(String(r[programLegacy])) ?? null : null,
        // AHA's "Outdoors" is Yes/No/blank; when blank, the program ("INDOOR VOLUNTEER" / "OUTDOOR VOLUNTEER") decides
        setting: b(r, "aha_virtualopportunity", "msnfp_virtualopportunity")
          ? "VIRTUAL"
          : /^no$/i.test(outdoors) || (!outdoors && /indoor/i.test(fmt(r, programLegacy ?? "") ?? ""))
            ? "INDOOR"
            : "OUTDOOR",
        wheelchairAccessible: /^yes$/i.test(fmt(r, "aha_wheelchairaccessible") ?? ""),
        adultsOnly: !(/^yes$/i.test(fmt(r, "aha_familyfriendly") ?? "") || (n(r, "aha_minimumage") ?? 18) < 18),
        minAge: n(r, "aha_minimumage"),
        registrationCloseAt: d(r, "aha_registrationcloseddate", "msnfp_registrationcloseddate"),
        status: /cancel/i.test(fmt(r, "msnfp_engagementopportunitystatus") ?? "") ? "CANCELED" : "PUBLISHED",
      },
      update: {},
    });
    oppMap.set(id, o.id);
    stat("opportunities").written++;
  }
  const shiftMap = new Map<string, string>();
  for (const r of await all("aha_shifts")) {
    stat("shifts").read++;
    const id = s(r, "aha_shiftid")!;
    const oppId = oppMap.get(lookup(r, "aha_engagementopportunity") ?? "");
    const start = d(r, "aha_shiftdatetime");
    if (!W) continue;
    if (!oppId || !start) {
      stat("shifts").skipped++;
      continue;
    }
    const sh = await db.shift.upsert({
      where: { legacyId: id },
      create: { legacyId: id, opportunityId: oppId, name: s(r, "aha_name") ?? "Shift", startAt: start, endAt: d(r, "aha_shiftenddatetime") ?? new Date(start.getTime() + (n(r, "aha_hours") ?? 2) * 36e5), capacity: n(r, "aha_capacity") ?? 10 },
      update: {},
    });
    shiftMap.set(id, sh.id);
    stat("shifts").written++;
  }
  if (W) {
    // opportunities without shifts get one from their own dates
    for (const r of oppRows) {
      const oppId = oppMap.get(String(r.msnfp_engagementopportunityid));
      if (!oppId || (await db.shift.count({ where: { opportunityId: oppId } }))) continue;
      const start = d(r, "aha_startdate", "aha_opportunitydate", "aha_daterangestart", "msnfp_startdate");
      if (!start) continue;
      // AHA's end date on a repeating opportunity is the end of the series: keep the shift within its first day
      const end = d(r, "aha_enddate", "aha_daterangeend", "msnfp_enddate");
      let endAt = end && end > start ? end : new Date(start.getTime() + 3 * 36e5);
      if (endAt.toDateString() !== start.toDateString()) {
        endAt = new Date(start.getFullYear(), start.getMonth(), start.getDate(), endAt.getHours(), endAt.getMinutes());
        if (endAt <= start) endAt = new Date(start.getTime() + 3 * 36e5);
      }
      await db.shift.create({ data: { opportunityId: oppId, name: "Main shift", startAt: start, endAt, capacity: n(r, "msnfp_maximum") ?? 10 } });
    }
  }

  /**
   * Most AHA sign-ups have no shift link, only their own date (e.g. one per week of a weekly opportunity).
   * Put each on that day's shift, creating it if needed. Dates saved as midnight US-Eastern (04:00/05:00 UTC)
   * are date-only; those use the opportunity's usual time of day.
   */
  const shiftForDate = async (opportunityId: string, raw: string, hours: number | null) => {
    const t = new Date(raw);
    const dateOnly = t.getUTCMinutes() === 0 && (t.getUTCHours() === 4 || t.getUTCHours() === 5);
    const [y, m, day] = dateOnly ? [t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()] : [t.getFullYear(), t.getMonth(), t.getDate()];
    const sameDay = await db.shift.findFirst({ where: { opportunityId, startAt: { gte: new Date(y, m, day), lt: new Date(y, m, day + 1) } }, orderBy: { startAt: "asc" } });
    if (sameDay) return sameDay.id;
    const template = await db.shift.findFirst({ where: { opportunityId }, orderBy: { startAt: "asc" } });
    const start = dateOnly ? new Date(y, m, day, template?.startAt.getHours() ?? 9, template?.startAt.getMinutes() ?? 0) : t;
    const templateMs = template ? template.endAt.getTime() - template.startAt.getTime() : 0;
    const durationMs = templateMs > 0 && templateMs <= 12 * 36e5 ? templateMs : (hours ?? 3) * 36e5;
    const name = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    const created = await db.shift.create({ data: { opportunityId, name, startAt: start, endAt: new Date(start.getTime() + durationMs), capacity: template?.capacity ?? 10 } });
    stat("shifts (from sign-up dates)").written++;
    return created.id;
  };

  // ── Registrations (participations) ──
  const ACTIVE_FIRST = ["ATTENDED", "REGISTERED", "NO_SHOW", "CANCELED"];
  for (const r of await all("msnfp_participations")) {
    stat("registrations").read++;
    const id = s(r, "msnfp_participationid")!;
    if (!W) continue;
    const contactId = contactMap.get(lookup(r, "msnfp_contactid") ?? "");
    const oppId = oppMap.get(lookup(r, "msnfp_engagementopportunityid") ?? "");
    const rawStart = s(r, "msnfp_startdate");
    const shiftId =
      shiftMap.get(lookup(r, "aha_volunteershift") ?? "") ??
      (oppId && rawStart ? await shiftForDate(oppId, rawStart, n(r, "msnfp_hours")) : undefined) ??
      (oppId ? (await db.shift.findFirst({ where: { opportunityId: oppId }, orderBy: { startAt: "asc" } }))?.id : undefined);
    if (!contactId || !shiftId) {
      stat("registrations").skipped++;
      continue;
    }
    const st = (fmt(r, "msnfp_status") ?? "").toLowerCase();
    const status = /cancel|withdr/.test(st) ? "CANCELED" : /no.?show|absent/.test(st) ? "NO_SHOW" : /attend|complete/.test(st) ? "ATTENDED" : "REGISTERED";
    const existing = await db.registration.findUnique({ where: { legacyId: id } });
    const clash = await db.registration.findUnique({ where: { shiftId_contactId: { shiftId, contactId } } });
    if (clash && clash.id !== existing?.id) {
      // AHA has the same person on the same shift twice (e.g. cancelled, then signed up again): keep the active one
      if (ACTIVE_FIRST.indexOf(status) < ACTIVE_FIRST.indexOf(clash.status)) await db.registration.update({ where: { id: clash.id }, data: { status } });
      stat("registrations").skipped++;
      continue;
    }
    if (existing) await db.registration.update({ where: { id: existing.id }, data: { shiftId, status } });
    else await db.registration.create({ data: { legacyId: id, shiftId, contactId, status, createdAt: d(r, "createdon") ?? new Date() } });
    stat("registrations").written++;
  }

  // ── Hours ──
  for (const r of await all("aha_volunteerhours")) {
    stat("hours").read++;
    const id = s(r, "aha_volunteerhourid")!;
    const contactId = contactMap.get(lookup(r, "aha_contact") ?? "");
    const hours = n(r, "aha_hoursrecorded");
    const date = d(r, "aha_dateworked", "createdon");
    if (!W) continue;
    if (!contactId || !hours || !date) {
      stat("hours").skipped++;
      continue;
    }
    const st = (fmt(r, "statuscode") ?? "").toLowerCase();
    await db.volunteerHour.upsert({
      where: { legacyId: id },
      create: {
        legacyId: id,
        contactId,
        opportunityId: oppMap.get(lookup(r, "aha_opportunity") ?? "") ?? null,
        date,
        hours,
        description: s(r, "aha_additionalnotes", "aha_name"),
        status: /approv/.test(st) ? "APPROVED" : /cancel|reject/.test(st) ? "REJECTED" : /pend|submit|draft/.test(st) ? "PENDING" : "APPROVED",
        reviewedBy: "Migrated from AHA",
      },
      update: {},
    });
    stat("hours").written++;
  }

  // ── Applications ──
  for (const r of await all("aha_volunteerapplications")) {
    stat("applications").read++;
    const id = s(r, "aha_volunteerapplicationid")!;
    if (!W) continue;
    let contactId = contactMap.get(lookup(r, "aha_contact") ?? "");
    const email = s(r, "aha_email")?.toLowerCase();
    if (!contactId && email) contactId = (await db.contact.findFirst({ where: { email } }))?.id;
    if (!contactId) {
      const c = await db.contact.create({
        data: { constituentNo: await counter("constituent"), firstName: s(r, "aha_firstname") ?? "", lastName: s(r, "aha_lastname") ?? "", email: email ?? null, phone: s(r, "aha_phonenumber"), source: "IMPORT" },
      });
      contactId = c.id;
    }
    const st = (fmt(r, "statuscode") ?? "").toLowerCase();
    const status = /approv|accept/.test(st) ? "APPROVED" : /reject|declin/.test(st) ? "REJECTED" : "PENDING";
    await db.volunteerApplication.upsert({
      where: { legacyId: id },
      create: {
        legacyId: id,
        contactId,
        status,
        motivation: s(r, "aha_areasofinterest", "aha_tasksyouenjoydoing", "aha_additionalcomments"),
        agreedWaiver: true,
        createdAt: d(r, "createdon") ?? new Date(),
        reviewedAt: status === "PENDING" ? null : d(r, "modifiedon"),
        reviewedBy: status === "PENDING" ? null : "Migrated from AHA",
      },
      update: { status },
    });
    await db.contact.update({
      where: { id: contactId },
      data: {
        volunteerStatus: status,
        emergencyContactName: s(r, "aha_emergencycontactname"),
        emergencyContactPhone: s(r, "aha_emergencycontactphone"),
        emergencyContactEmail: s(r, "aha_emergencycontactemailaddress"),
      },
    });
    stat("applications").written++;
  }

  // ── Skills (qualifications) ──
  for (const r of await all("msnfp_qualifications")) {
    stat("volunteer skills").read++;
    if (!W) continue;
    const contactId = contactMap.get(lookup(r, "msnfp_contactid") ?? "");
    const skillName = fmt(r, "_msnfp_typeid_value") ?? s(r, "msnfp_name");
    if (!contactId || !skillName) {
      stat("volunteer skills").skipped++;
      continue;
    }
    const skill = await db.skill.upsert({ where: { name: skillName }, create: { name: skillName }, update: {} });
    await db.volunteerSkill.upsert({
      where: { contactId_skillId_kind: { contactId, skillId: skill.id, kind: "EXPERIENCE" } },
      create: { contactId, skillId: skill.id, kind: "EXPERIENCE" },
      update: {},
    });
    stat("volunteer skills").written++;
  }

  // ── Roll-ups ──
  if (W) {
    console.log("Recomputing giving totals, donor levels and hour badges…");
    const { recomputeAllGiving } = await import("../src/lib/rollups");
    const { awardHourBadges } = await import("../src/lib/badges");
    await recomputeAllGiving();
    for (const { contactId } of await db.volunteerHour.groupBy({ by: ["contactId"], where: { status: "APPROVED" } })) await awardHourBadges(contactId);
  }

  console.log("\nTable".padEnd(22) + "read".padStart(8) + "written".padStart(10) + "skipped".padStart(10));
  for (const [k, v] of Object.entries(stats)) console.log(k.padEnd(21) + String(v.read).padStart(8) + String(v.written).padStart(10) + String(v.skipped).padStart(10));
  const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  console.log("\nGifts by year, Pacific time (ticket purchases excluded)");
  console.log("  The last column is AHA's own \"Donation\" category, which is what AHA's dashboard KPIs add up;");
  console.log("  the total also includes gifts made on event pages and pledge payments.");
  for (const [y, v] of Object.entries(giftsByYear).sort())
    console.log(`  ${y}  ${String(v.count).padStart(5)} gifts  ${usd(v.cents).padStart(13)}   AHA "Donation" category: ${usd(v.ahaDonationCents)}`);
  if (!W) console.log("\nDry run complete — nothing was written. Re-run with --commit to write.");
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
