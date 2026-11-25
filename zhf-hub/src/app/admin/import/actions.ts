"use server";

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { csvObjects, pickCol } from "@/lib/csv";
import { nextNumber } from "@/lib/counters";
import { upsertContactByEmail } from "@/lib/contacts";
import { recomputeContactGiving } from "@/lib/rollups";
import { defaultCampaignId, defaultFundId } from "@/lib/donations";
import { slugify, toCents } from "@/lib/utils";

export type ImportResult = {
  kind: string;
  dryRun: boolean;
  rows: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  mapped: Record<string, string>;
} | null;

// Column aliases — Dynamics 365 "Export to Excel" headers first, then generic names.
const C = {
  legacyId: ["(Do Not Modify) Contact", "Contact ID", "contactid", "Legacy ID"],
  firstName: ["First Name", "firstname", "First"],
  lastName: ["Last Name", "lastname", "Last"],
  fullName: ["Full Name", "Receipt On Contact", "Donor", "Donor Name", "Contact", "Name"],
  email: ["Email", "E-mail", "Email Address", "emailaddress1", "Email (Receipt On Contact)"],
  phone: ["Mobile Phone", "Business Phone", "Phone", "Telephone", "telephone1", "mobilephone"],
  org: ["Company Name", "Organization", "Account Name", "Business Name"],
  street: ["Address 1: Street 1", "Address 1", "Street", "Address"],
  city: ["Address 1: City", "City"],
  state: ["Address 1: State/Province", "State/Province", "State"],
  zip: ["Address 1: ZIP/Postal Code", "ZIP/Postal Code", "Zip Code", "Zip", "Postal Code"],
  birthday: ["Birthday", "Birth Date"],
  // donations
  txnId: ["(Do Not Modify) Transaction", "Transaction ID", "Receipt Number", "Name"],
  amount: ["Amount", "Total Amount", "Donation Amount", "Gift Amount"],
  date: ["Received Date", "Date Received", "Book Date", "Date", "Created On"],
  campaign: ["Donation Campaign", "Campaign", "Appeal"],
  fund: ["Designation", "Fund"],
  method: ["Payment Method", "Payment Type", "Method"],
  check: ["Check Number", "Cheque Number", "Reference"],
  status: ["Status Reason", "Status"],
};

const METHOD_MAP: Record<string, string> = {
  card: "CARD", "credit card": "CARD", credit: "CARD", stripe: "CARD", online: "CARD",
  check: "CHECK", cheque: "CHECK", cash: "CASH", ach: "ACH", "bank transfer": "ACH", eft: "ACH",
  "in kind": "IN_KIND", "in-kind": "IN_KIND", stock: "STOCK", securities: "STOCK",
};

function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return { first: parts[0] ?? "", last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts.at(-1)! };
}

function mappedColumns(header: string[], keys: (keyof typeof C)[]) {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const hit = C[k].find((c) => header.includes(c.toLowerCase().replace(/\(do not modify\)/g, "dnm ").replace(/[^a-z0-9]+/g, " ").trim()));
    out[k] = hit ?? "—";
  }
  return out;
}

export async function runImport(_prev: ImportResult, fd: FormData): Promise<ImportResult> {
  await requireStaff(["ADMIN"]);
  const kind = String(fd.get("kind") ?? "contacts");
  const dryRun = fd.get("dryRun") === "on";
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { kind, dryRun, rows: 0, created: 0, updated: 0, skipped: 0, errors: ["Choose a CSV file to import."], mapped: {} };
  if (file.size > 8 * 1024 * 1024) return { kind, dryRun, rows: 0, created: 0, updated: 0, skipped: 0, errors: ["File is larger than 8 MB — split it into smaller files."], mapped: {} };
  const { header, records } = csvObjects(await file.text());
  const res: NonNullable<ImportResult> = { kind, dryRun, rows: records.length, created: 0, updated: 0, skipped: 0, errors: [], mapped: {} };

  if (kind === "contacts") {
    res.mapped = mappedColumns(header, ["legacyId", "firstName", "lastName", "fullName", "email", "phone", "org", "street", "city", "state", "zip"]);
    for (const [i, r] of records.entries()) {
      let first = pickCol(r, C.firstName);
      let last = pickCol(r, C.lastName);
      if (!first && !last) ({ first, last } = splitName(pickCol(r, C.fullName)));
      const email = pickCol(r, C.email).toLowerCase();
      const org = pickCol(r, C.org);
      if (!first && !last && !org) {
        res.skipped++;
        if (res.errors.length < 15) res.errors.push(`Row ${i + 2}: no name — skipped`);
        continue;
      }
      const legacyId = pickCol(r, C.legacyId);
      const existing = legacyId
        ? await db.contact.findFirst({ where: { legacyId } })
        : email
          ? await db.contact.findFirst({ where: { email } })
          : await db.contact.findFirst({ where: { firstName: first, lastName: last, email: null } });
      if (existing) res.updated++;
      else res.created++;
      if (dryRun) continue;
      if (existing) {
        await db.contact.update({
          where: { id: existing.id },
          data: {
            legacyId: existing.legacyId ?? (legacyId || null),
            phone: existing.phone ?? (pickCol(r, C.phone) || null),
            address1: existing.address1 ?? (pickCol(r, C.street) || null),
            city: existing.city ?? (pickCol(r, C.city) || null),
            state: existing.state ?? (pickCol(r, C.state) || null),
            zip: existing.zip ?? (pickCol(r, C.zip) || null),
          },
        });
      } else {
        const bday = pickCol(r, C.birthday);
        await db.contact.create({
          data: {
            constituentNo: await nextNumber("constituent"),
            type: org && !first ? "BUSINESS" : "INDIVIDUAL",
            firstName: first,
            lastName: last,
            orgName: org || null,
            email: email || null,
            phone: pickCol(r, C.phone) || null,
            address1: pickCol(r, C.street) || null,
            city: pickCol(r, C.city) || null,
            state: pickCol(r, C.state) || null,
            zip: pickCol(r, C.zip) || null,
            birthday: bday && !isNaN(Date.parse(bday)) ? new Date(bday) : null,
            legacyId: legacyId || null,
            source: "IMPORT",
          },
        });
      }
    }
  } else {
    res.mapped = mappedColumns(header, ["txnId", "fullName", "email", "amount", "date", "campaign", "fund", "method", "check", "status"]);
    const defCampaign = await defaultCampaignId();
    const defFund = await defaultFundId();
    const touched = new Set<string>();
    const campaignCache = new Map<string, string>();
    const fundCache = new Map<string, string>();
    for (const [i, r] of records.entries()) {
      const amount = toCents(pickCol(r, C.amount));
      const dateStr = pickCol(r, C.date);
      const date = dateStr && !isNaN(Date.parse(dateStr)) ? new Date(dateStr) : null;
      const email = pickCol(r, C.email).toLowerCase();
      const full = pickCol(r, C.fullName);
      const status = pickCol(r, C.status).toLowerCase();
      if (!Number.isFinite(amount) || amount <= 0 || !date) {
        res.skipped++;
        if (res.errors.length < 15) res.errors.push(`Row ${i + 2}: missing amount or date — skipped`);
        continue;
      }
      if (status && /(fail|cancel|refund|void)/.test(status)) {
        res.skipped++;
        continue;
      }
      const legacyId = pickCol(r, C.txnId);
      if (legacyId && (await db.donation.findFirst({ where: { legacyId } }))) {
        res.skipped++;
        continue;
      }
      if (!email && !full) {
        res.skipped++;
        if (res.errors.length < 15) res.errors.push(`Row ${i + 2}: no donor name or email — skipped`);
        continue;
      }
      res.created++;
      if (dryRun) continue;
      const { first, last } = splitName(full);
      const contact = email
        ? await upsertContactByEmail({ email, firstName: first, lastName: last, source: "IMPORT" })
        : (await db.contact.findFirst({ where: { firstName: first, lastName: last } })) ??
          (await db.contact.create({ data: { constituentNo: await nextNumber("constituent"), firstName: first, lastName: last, source: "IMPORT" } }));

      const campName = pickCol(r, C.campaign).replace(/[“”]/g, "").trim();
      let campaignId = defCampaign;
      if (campName) {
        if (!campaignCache.has(campName)) {
          const found = await db.campaign.findFirst({ where: { name: campName } });
          const c = found ?? (await db.campaign.create({ data: { name: campName, slug: `${slugify(campName)}-${Date.now().toString(36).slice(-4)}`, active: false } }));
          campaignCache.set(campName, c.id);
        }
        campaignId = campaignCache.get(campName)!;
      }
      const fundName = pickCol(r, C.fund);
      let fundId = defFund;
      if (fundName) {
        if (!fundCache.has(fundName)) {
          const f = await db.fund.upsert({ where: { name: fundName }, create: { name: fundName }, update: {} });
          fundCache.set(fundName, f.id);
        }
        fundId = fundCache.get(fundName)!;
      }
      const method = METHOD_MAP[pickCol(r, C.method).toLowerCase()] ?? "CARD";
      await db.donation.create({
        data: {
          number: await nextNumber("donation"),
          contactId: contact.id,
          amountCents: amount,
          totalCents: amount,
          receivedAt: date,
          createdAt: date,
          method,
          checkNumber: pickCol(r, C.check) || null,
          status: "SUCCEEDED",
          source: "IMPORT",
          campaignId,
          fundId,
          legacyId: legacyId || null,
          receiptSentAt: date,
        },
      });
      touched.add(contact.id);
    }
    for (const id of touched) await recomputeContactGiving(id);
  }
  return res;
}
