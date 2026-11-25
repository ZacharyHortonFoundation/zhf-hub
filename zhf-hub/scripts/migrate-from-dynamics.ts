/* eslint-disable no-console */
/**
 * Migrate ZHF data out of Dynamics 365 / Dataverse (AHA "Aha Impact") into ZHF Hub.
 *
 *   1. Sign in with an account that can read the environment, then get a token:
 *        az login
 *        az account get-access-token --resource https://<org>.crm.dynamics.com --query accessToken -o tsv
 *   2. Run (PowerShell):
 *        $env:DYNAMICS_URL="https://<org>.crm.dynamics.com"; $env:DYNAMICS_TOKEN="<token>"
 *        npx tsx scripts/migrate-from-dynamics.ts --inspect     # counts + sample fields per table
 *        npx tsx scripts/migrate-from-dynamics.ts               # DRY RUN: reads everything, writes nothing
 *        npx tsx scripts/migrate-from-dynamics.ts --commit      # writes to DATABASE_URL
 *
 * Safe to re-run: every record keeps its Dataverse id in `legacyId` and is upserted on it.
 * Field names below were read from the zacharydev sandbox metadata (Nov 2026). If production
 * differs, adjust the `pick(...)` candidates — `--inspect` prints the real column names.
 */
process.env.TZ = process.env.ORG_TIMEZONE || "America/Los_Angeles";

import { PrismaClient } from "@prisma/client";

const BASE = (process.env.DYNAMICS_URL ?? "").replace(/\/$/, "");
const TOKEN = process.env.DYNAMICS_TOKEN ?? "";
const argv = new Set(process.argv.slice(2));
const COMMIT = argv.has("--commit");
const INSPECT = argv.has("--inspect");
const db = new PrismaClient();

type Row = Record<string, unknown>;
const FV = "@OData.Community.Display.V1.FormattedValue";

if (!BASE || !TOKEN) {
  console.error("Set DYNAMICS_URL and DYNAMICS_TOKEN first (see header of this file).");
  process.exit(1);
}

async function* fetchAll(entitySet: string): AsyncGenerator<Row> {
  let url: string | null = `${BASE}/api/data/v9.2/${entitySet}`;
  while (url) {
    const res: Response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Prefer: `odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=500`,
      },
    });
    if (res.status === 404) {
      console.warn(`  (table ${entitySet} not found — skipping)`);
      return;
    }
    if (!res.ok) throw new Error(`${entitySet}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    const j = (await res.json()) as { value: Row[]; "@odata.nextLink"?: string };
    for (const r of j.value) yield r;
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
];

async function inspect() {
  for (const t of TABLES) {
    const res = await fetch(`${BASE}/api/data/v9.2/${t}?$top=1&$count=true`, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json", Prefer: `odata.include-annotations="*"` },
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
    const c = await db.campaign.upsert({
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
      isDeceased: b(r, "aha_deceased"),
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

  // ── Donations (transactions) ──
  const METHOD: [RegExp, string][] = [[/check|cheque/i, "CHECK"], [/cash/i, "CASH"], [/ach|bank|eft/i, "ACH"], [/in.?kind|goods/i, "IN_KIND"], [/stock|secur/i, "STOCK"], [/card|credit|stripe|online/i, "CARD"]];
  for (const r of await all("msnfp_transactions")) {
    stat("donations").read++;
    const id = s(r, "msnfp_transactionid")!;
    const sub = fmt(r, "_aha_transactionsubcategory_value") ?? "";
    if (/ticket|registration|order/i.test(sub)) {
      stat("donations").skipped++; // ticket revenue comes over with event orders
      continue;
    }
    const contactLegacy = lookup(r, "msnfp_receiptoncontactid", "aha_customer", "msnfp_transaction_receiptonaccountid");
    const amount = cents(n(r, "msnfp_amount", "aha_finalamount"));
    const date = d(r, "msnfp_receiveddate", "msnfp_bookdate", "createdon");
    if (!contactLegacy || !amount || !date) {
      stat("donations").skipped++;
      continue;
    }
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
    const data = {
      contactId,
      amountCents: amount,
      feeCoveredCents: fee,
      totalCents: amount + fee,
      receivedAt: date,
      createdAt: date,
      frequency: /recurr|monthly/i.test(sub) || lookup(r, "aha_subscription") ? "MONTHLY" : "ONE_TIME",
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

  // ── Volunteer programs, opportunities, shifts ──
  const programMap = new Map<string, string>();
  for (const r of await all("msnfp_deliveryframeworks")) {
    stat("programs").read++;
    const id = s(r, "msnfp_deliveryframeworkid")!;
    const name = (s(r, "msnfp_name") ?? nameOf(r) ?? "Program").replace(/^[^\w]+/, "").trim();
    if (!W) continue;
    const existing = await db.program.findFirst({ where: { OR: [{ legacyId: id }, { name: { equals: name } }] } });
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
    const programLegacy = Object.keys(r).find((k) => /_program_value$|_msnfp_deliveryframeworkid_value$/.test(k));
    const o = await db.opportunity.upsert({
      where: { legacyId: id },
      create: {
        legacyId: id,
        title: s(r, "msnfp_engagementopportunitytitle") ?? nameOf(r) ?? "Opportunity",
        description: s(r, "msnfp_description"),
        location: s(r, "msnfp_location"),
        programId: programLegacy ? programMap.get(String(r[programLegacy])) ?? null : null,
        setting: /indoor/i.test(fmt(r, programLegacy ?? "") ?? "") ? "INDOOR" : b(r, "msnfp_virtualopportunity") ? "VIRTUAL" : "OUTDOOR",
        registrationCloseAt: d(r, "msnfp_registrationcloseddate"),
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
      const start = d(r, "msnfp_startdate");
      if (!start) continue;
      await db.shift.create({ data: { opportunityId: oppId, name: "Main shift", startAt: start, endAt: d(r, "msnfp_enddate") ?? new Date(start.getTime() + 3 * 36e5), capacity: n(r, "msnfp_maximum") ?? 10 } });
    }
  }

  // ── Registrations (participations) ──
  for (const r of await all("msnfp_participations")) {
    stat("registrations").read++;
    const id = s(r, "msnfp_participationid")!;
    if (!W) continue;
    const contactId = contactMap.get(lookup(r, "msnfp_contactid") ?? "");
    const oppId = oppMap.get(lookup(r, "msnfp_engagementopportunityid") ?? "");
    const shiftId = shiftMap.get(lookup(r, "aha_volunteershift") ?? "") ?? (oppId ? (await db.shift.findFirst({ where: { opportunityId: oppId }, orderBy: { startAt: "asc" } }))?.id : undefined);
    if (!contactId || !shiftId) {
      stat("registrations").skipped++;
      continue;
    }
    const st = (fmt(r, "msnfp_status") ?? "").toLowerCase();
    const status = /cancel|withdr/.test(st) ? "CANCELED" : /no.?show|absent/.test(st) ? "NO_SHOW" : /attend|complete/.test(st) ? "ATTENDED" : "REGISTERED";
    const clash = await db.registration.findUnique({ where: { shiftId_contactId: { shiftId, contactId } } });
    if (clash) await db.registration.update({ where: { id: clash.id }, data: { legacyId: id, status } });
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
  if (!W) console.log("\nDry run complete. Re-run with --commit to write.");
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
