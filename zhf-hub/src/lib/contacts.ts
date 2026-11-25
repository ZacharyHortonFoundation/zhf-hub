import { db } from "./db";
import { nextNumber } from "./counters";
import type { Prisma } from "@prisma/client";

export type ContactInput = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  type?: "INDIVIDUAL" | "BUSINESS";
  orgName?: string | null;
  spouseFirstName?: string | null;
  spouseLastName?: string | null;
  taxId?: string | null;
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  source?: string;
};

/**
 * Find a constituent by email (case-insensitive) or create one.
 * Existing records are only filled in, never overwritten with blanks — this keeps
 * staff edits safe when the same person donates, registers and volunteers.
 */
export async function upsertContactByEmail(input: ContactInput, tx?: Prisma.TransactionClient) {
  const client = tx ?? db;
  const email = input.email?.trim().toLowerCase() || null;
  const existing = email
    ? await client.contact.findFirst({ where: { email }, orderBy: { createdAt: "asc" } })
    : null;

  const clean = Object.fromEntries(
    Object.entries({
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      type: input.type,
      orgName: input.orgName,
      spouseFirstName: input.spouseFirstName,
      spouseLastName: input.spouseLastName,
      taxId: input.taxId,
      address1: input.address1,
      city: input.city,
      state: input.state,
      zip: input.zip,
    }).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as Prisma.ContactUpdateInput;

  if (existing) {
    // fill blanks only
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(clean)) {
      const cur = (existing as Record<string, unknown>)[k];
      if (cur === null || cur === undefined || cur === "") patch[k] = v;
    }
    if (Object.keys(patch).length) {
      return client.contact.update({ where: { id: existing.id }, data: patch });
    }
    return existing;
  }

  const constituentNo = await nextNumber("constituent", tx);
  return client.contact.create({
    data: {
      ...(clean as Prisma.ContactCreateInput),
      firstName: input.firstName ?? "",
      lastName: input.lastName ?? "",
      email,
      constituentNo,
      source: input.source ?? "MANUAL",
    },
  });
}
