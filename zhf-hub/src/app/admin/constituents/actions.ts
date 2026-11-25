"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { nextNumber } from "@/lib/counters";
import { recomputeContactGiving } from "@/lib/rollups";
import { sendTemplate } from "@/lib/email";
import { bool, money, optDate, optStr, str } from "@/lib/utils";
import { signToken } from "@/lib/session";
import { appUrl } from "@/lib/payments";
import { sendPortalPasswordLink } from "@/lib/portal-password";

function contactData(fd: FormData) {
  const type = str(fd.get("type")) === "BUSINESS" ? "BUSINESS" : "INDIVIDUAL";
  return {
    type,
    firstName: str(fd.get("firstName")),
    lastName: str(fd.get("lastName")),
    spouseFirstName: optStr(fd.get("spouseFirstName")),
    spouseLastName: optStr(fd.get("spouseLastName")),
    orgName: optStr(fd.get("orgName")),
    taxId: optStr(fd.get("taxId")),
    email: optStr(fd.get("email"))?.toLowerCase() ?? null,
    phone: optStr(fd.get("phone")),
    address1: optStr(fd.get("address1")),
    city: optStr(fd.get("city")),
    state: optStr(fd.get("state")),
    zip: optStr(fd.get("zip")),
    birthday: optDate(fd.get("birthday")),
    notes: optStr(fd.get("notes")),
    isVip: bool(fd.get("isVip")),
    isDeceased: bool(fd.get("isDeceased")),
    doNotEmail: bool(fd.get("doNotEmail")),
  };
}

export async function createContact(fd: FormData) {
  await requireStaff();
  const data = contactData(fd);
  if (!data.firstName && !data.lastName && !data.orgName) redirect("/admin/constituents/new?err=Please enter a name");
  if (data.email) {
    const dupe = await db.contact.findFirst({ where: { email: data.email } });
    if (dupe) redirect(`/admin/constituents/${dupe.id}?err=A constituent with that email already exists`);
  }
  const c = await db.contact.create({ data: { ...data, constituentNo: await nextNumber("constituent"), source: "MANUAL" } });
  redirect(`/admin/constituents/${c.id}?ok=Constituent created`);
}

export async function updateContact(id: string, fd: FormData) {
  await requireStaff();
  const data = contactData(fd);
  await db.contact.update({ where: { id }, data });
  revalidatePath(`/admin/constituents/${id}`);
  redirect(`/admin/constituents/${id}?ok=Saved`);
}

export async function setTags(id: string, fd: FormData) {
  await requireStaff();
  const ids = fd.getAll("tagId").map(String);
  const newTag = str(fd.get("newTag"));
  if (newTag) {
    const t = await db.tag.upsert({ where: { name: newTag }, create: { name: newTag }, update: {} });
    ids.push(t.id);
  }
  await db.contact.update({ where: { id }, data: { tags: { set: ids.map((tid) => ({ id: tid })) } } });
  revalidatePath(`/admin/constituents/${id}`);
}

export async function toggleStewardship(id: string, field: string) {
  await requireStaff();
  const allowed = ["sentThankYou", "invitedToEvents", "offeredMeeting", "sharedImpactStory", "informedMonthly", "isVip", "doNotEmail"] as const;
  if (!allowed.includes(field as (typeof allowed)[number])) return;
  const c = await db.contact.findUnique({ where: { id } });
  if (!c) return;
  await db.contact.update({ where: { id }, data: { [field]: !(c as Record<string, unknown>)[field] } });
  revalidatePath(`/admin/constituents/${id}`);
}

export async function addActivity(id: string, fd: FormData) {
  const staff = await requireStaff();
  const subject = str(fd.get("subject"));
  if (!subject) return;
  await db.activity.create({
    data: {
      contactId: id,
      type: str(fd.get("type")) || "NOTE",
      subject,
      body: optStr(fd.get("body")),
      dueAt: optDate(fd.get("dueAt")),
      createdById: staff.userId,
    },
  });
  revalidatePath(`/admin/constituents/${id}`);
}

export async function toggleActivity(activityId: string) {
  await requireStaff();
  const a = await db.activity.findUnique({ where: { id: activityId } });
  if (!a) return;
  await db.activity.update({ where: { id: activityId }, data: { done: !a.done } });
  revalidatePath(`/admin/constituents/${a.contactId}`);
  revalidatePath("/admin");
}

export async function deleteActivity(activityId: string) {
  await requireStaff();
  const a = await db.activity.delete({ where: { id: activityId } });
  revalidatePath(`/admin/constituents/${a.contactId}`);
}

/** Merge `sourceNo` (constituent #) into `targetId`, moving every related record. */
export async function mergeContact(targetId: string, fd: FormData) {
  await requireStaff(["ADMIN", "STAFF"]);
  const no = parseInt(str(fd.get("sourceNo")), 10);
  const source = Number.isFinite(no) ? await db.contact.findUnique({ where: { constituentNo: no }, include: { tags: true } }) : null;
  if (!source || source.id === targetId) redirect(`/admin/constituents/${targetId}?tab=overview&err=Constituent #${no || "?"} not found`);
  const target = await db.contact.findUnique({ where: { id: targetId } });
  if (!target) redirect("/admin/constituents");

  await db.$transaction(async (tx) => {
    const where = { contactId: source.id };
    const data = { contactId: targetId };
    await tx.donation.updateMany({ where, data });
    await tx.recurringPlan.updateMany({ where, data });
    await tx.activity.updateMany({ where, data });
    await tx.eventOrder.updateMany({ where, data });
    await tx.attendee.updateMany({ where, data });
    await tx.volunteerApplication.updateMany({ where, data });
    await tx.volunteerHour.updateMany({ where, data });
    await tx.emailLog.updateMany({ where, data });
    // composite-key tables: move what doesn't collide, drop the rest
    for (const r of await tx.registration.findMany({ where })) {
      const clash = await tx.registration.findUnique({ where: { shiftId_contactId: { shiftId: r.shiftId, contactId: targetId } } });
      if (clash) await tx.registration.delete({ where: { id: r.id } });
      else await tx.registration.update({ where: { id: r.id }, data });
    }
    for (const b of await tx.contactBadge.findMany({ where })) {
      const clash = await tx.contactBadge.findUnique({ where: { contactId_badgeId: { contactId: targetId, badgeId: b.badgeId } } });
      if (clash) await tx.contactBadge.delete({ where: { id: b.id } });
      else await tx.contactBadge.update({ where: { id: b.id }, data });
    }
    for (const s of await tx.volunteerSkill.findMany({ where })) {
      await tx.volunteerSkill.delete({ where: { contactId_skillId_kind: { contactId: s.contactId, skillId: s.skillId, kind: s.kind } } });
      await tx.volunteerSkill.upsert({
        where: { contactId_skillId_kind: { contactId: targetId, skillId: s.skillId, kind: s.kind } },
        create: { contactId: targetId, skillId: s.skillId, kind: s.kind },
        update: {},
      });
    }
    // fill blank fields on the target from the source
    const fill: Record<string, unknown> = {};
    for (const k of ["email", "phone", "address1", "city", "state", "zip", "spouseFirstName", "spouseLastName", "orgName", "taxId", "birthday", "emergencyContactName", "emergencyContactPhone", "emergencyContactEmail", "portalPasswordHash", "stripeCustomerId"] as const) {
      if (!target[k] && source[k]) fill[k] = source[k];
    }
    if (target.volunteerStatus === "NONE" && source.volunteerStatus !== "NONE") fill.volunteerStatus = source.volunteerStatus;
    await tx.contact.update({ where: { id: targetId }, data: { ...fill, tags: { connect: source.tags.map((t) => ({ id: t.id })) } } });
    await tx.activity.create({ data: { contactId: targetId, type: "SYSTEM", subject: `Merged constituent #${source.constituentNo} (${source.firstName} ${source.lastName}) into this record` } });
    await tx.contact.delete({ where: { id: source.id } });
  });
  await recomputeContactGiving(targetId);
  redirect(`/admin/constituents/${targetId}?ok=Records merged`);
}

export async function deleteContact(id: string) {
  await requireStaff(["ADMIN"]);
  const counts = await db.contact.findUnique({
    where: { id },
    select: { _count: { select: { donations: true, eventOrders: true, hours: true } } },
  });
  if (!counts) redirect("/admin/constituents");
  if (counts._count.donations || counts._count.eventOrders || counts._count.hours) {
    redirect(`/admin/constituents/${id}?err=This record has gifts, orders or hours. Merge it into another record instead.`);
  }
  await db.contact.delete({ where: { id } });
  redirect("/admin/constituents?ok=Constituent deleted");
}

export async function sendVolunteerPortalLink(id: string) {
  await requireStaff();
  const c = await db.contact.findUnique({ where: { id } });
  if (!c?.email) redirect(`/admin/constituents/${id}?tab=volunteering&err=No email address on file`);
  await sendPortalPasswordLink(id);
  redirect(`/admin/constituents/${id}?tab=volunteering&ok=Set-password link emailed to ${c.email}`);
}

export async function emailStatement(id: string, year: number) {
  await requireStaff();
  const c = await db.contact.findUnique({ where: { id } });
  if (!c?.email) redirect(`/admin/constituents/${id}/statement?year=${year}&err=No email address on file`);
  const gifts = await db.donation.findMany({
    where: { contactId: id, status: "SUCCEEDED", receivedAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
  });
  const token = await signToken({ t: "statement", contactId: id, year }, 400);
  await sendTemplate({
    templateKey: "donation.year_end",
    to: c.email,
    toName: `${c.firstName} ${c.lastName}`,
    contactId: id,
    vars: {
      first_name: c.firstName || c.orgName || "friend",
      year,
      total: money(gifts.reduce((a, g) => a + g.amountCents, 0), { decimals: true }),
      gift_count: gifts.length,
      statement_url: `${appUrl()}/statement/${token}`,
    },
  });
  redirect(`/admin/constituents/${id}/statement?year=${year}&ok=Statement emailed`);
}
