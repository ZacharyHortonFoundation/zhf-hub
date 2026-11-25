"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { sendTemplate } from "@/lib/email";
import { awardHourBadges } from "@/lib/badges";
import {
  approveHourEntries,
  createApprovedHours,
  notifyBadges,
  portalUrl,
  registerForShift,
  rejectHourEntry,
  shiftHours,
} from "@/lib/volunteers";
import { bool, fullName, optDate, optInt, optStr, str } from "@/lib/utils";

function back(formData: FormData, fallback: string) {
  const b = str(formData.get("back"));
  return b.startsWith("/admin") ? b : fallback;
}
function go(path: string, kind: "ok" | "err", msg: string): never {
  const [base, hash] = path.split("#");
  const sep = base!.includes("?") ? "&" : "?";
  redirect(`${base}${sep}${kind}=${encodeURIComponent(msg)}${hash ? `#${hash}` : ""}`);
}
function refreshContact(contactId: string) {
  revalidatePath(`/admin/constituents/${contactId}`);
}

/* ───────────────────────── Applications ───────────────────────── */

export async function reviewApplication(formData: FormData) {
  const staff = await requireStaff();
  const id = str(formData.get("id"));
  const decision = str(formData.get("decision"));
  const note = optStr(formData.get("note"));
  const to = back(formData, "/admin/volunteers/applications");
  if (decision !== "APPROVED" && decision !== "REJECTED") go(to, "err", "Unknown decision.");
  const app = await db.volunteerApplication.findUnique({ where: { id }, include: { contact: true } });
  if (!app) go(to, "err", "Application not found.");

  await db.volunteerApplication.update({
    where: { id },
    data: { status: decision, reviewNotes: note, reviewedAt: new Date(), reviewedBy: staff.name },
  });
  await db.contact.update({ where: { id: app.contactId }, data: { volunteerStatus: decision } });
  await sendTemplate({
    templateKey: decision === "APPROVED" ? "volunteer.application_approved" : "volunteer.application_rejected",
    to: app.contact.email,
    toName: fullName(app.contact),
    contactId: app.contactId,
    vars: { first_name: app.contact.firstName, last_name: app.contact.lastName, review_notes: note ?? "", portal_url: portalUrl() },
  });
  revalidatePath("/admin/volunteers", "layout");
  refreshContact(app.contactId);
  go(to, "ok", decision === "APPROVED" ? `${fullName(app.contact)} approved — welcome email sent.` : `Application from ${fullName(app.contact)} declined.`);
}

export async function setVolunteerStatus(formData: FormData) {
  await requireStaff();
  const contactId = str(formData.get("contactId"));
  const status = str(formData.get("status"));
  if (!["NONE", "PENDING", "APPROVED", "REJECTED", "INACTIVE"].includes(status)) return;
  await db.contact.update({ where: { id: contactId }, data: { volunteerStatus: status } });
  refreshContact(contactId);
  revalidatePath("/admin/volunteers");
  go(back(formData, `/admin/constituents/${contactId}`), "ok", "Volunteer status updated.");
}

/* ───────────────────────── Opportunities ───────────────────────── */

export async function saveOpportunity(formData: FormData) {
  await requireStaff();
  const id = str(formData.get("id"));
  const title = str(formData.get("title"));
  const fallback = id ? `/admin/volunteers/opportunities/${id}` : "/admin/volunteers/opportunities/new";
  if (!title) go(fallback, "err", "Title is required.");

  const data = {
    title,
    summary: optStr(formData.get("summary")),
    description: optStr(formData.get("description")),
    imageUrl: optStr(formData.get("imageUrl")),
    programId: optStr(formData.get("programId")),
    setting: str(formData.get("setting")) || "OUTDOOR",
    location: optStr(formData.get("location")),
    address: optStr(formData.get("address")),
    city: optStr(formData.get("city")),
    wheelchairAccessible: bool(formData.get("wheelchairAccessible")),
    adultsOnly: bool(formData.get("adultsOnly")),
    minAge: optInt(formData.get("minAge")),
    registrationCloseAt: optDate(formData.get("registrationCloseAt")),
    contactName: optStr(formData.get("contactName")),
    contactEmail: optStr(formData.get("contactEmail")),
    contactPhone: optStr(formData.get("contactPhone")),
    status: str(formData.get("status")) || "PUBLISHED",
  };
  const skillIds = formData.getAll("skills").map(String).filter(Boolean);

  if (id) {
    await db.opportunity.update({ where: { id }, data: { ...data, skills: { set: skillIds.map((s) => ({ id: s })) } } });
    revalidatePath(`/admin/volunteers/opportunities/${id}`);
    revalidatePath(`/volunteer/opportunities/${id}`);
    go(`/admin/volunteers/opportunities/${id}`, "ok", "Opportunity saved.");
  }

  const start = optDate(formData.get("shiftStart"));
  const end = optDate(formData.get("shiftEnd"));
  const capacity = optInt(formData.get("shiftCapacity"));
  if (!start || !end || end <= start || !capacity || capacity < 1) {
    go("/admin/volunteers/opportunities/new", "err", "Add a first shift with a start, an end after it, and a capacity.");
  }
  const opp = await db.opportunity.create({
    data: {
      ...data,
      skills: { connect: skillIds.map((s) => ({ id: s })) },
      shifts: { create: { name: str(formData.get("shiftName")) || "Main shift", startAt: start, endAt: end, capacity } },
    },
  });
  revalidatePath("/admin/volunteers/opportunities");
  go(`/admin/volunteers/opportunities/${opp.id}`, "ok", "Opportunity created.");
}

export async function duplicateOpportunity(formData: FormData) {
  await requireStaff();
  const id = str(formData.get("id"));
  const src = await db.opportunity.findUnique({ where: { id }, include: { skills: true, shifts: true } });
  if (!src) go("/admin/volunteers/opportunities", "err", "Opportunity not found.");
  const { id: _id, createdAt: _c, skills, shifts, ...rest } = src;
  void _id;
  void _c;
  const copy = await db.opportunity.create({
    data: {
      ...rest,
      title: `${src.title} (copy)`,
      status: "DRAFT",
      skills: { connect: skills.map((s) => ({ id: s.id })) },
      shifts: { create: shifts.map((s) => ({ name: s.name, startAt: s.startAt, endAt: s.endAt, capacity: s.capacity })) },
    },
  });
  go(`/admin/volunteers/opportunities/${copy.id}`, "ok", "Draft copy created — update the dates, then publish.");
}

export async function deleteOpportunity(formData: FormData) {
  await requireStaff();
  const id = str(formData.get("id"));
  const [regs, hours] = await Promise.all([
    db.registration.count({ where: { shift: { opportunityId: id }, status: { not: "CANCELED" } } }),
    db.volunteerHour.count({ where: { opportunityId: id } }),
  ]);
  if (regs || hours) {
    go(`/admin/volunteers/opportunities/${id}`, "err", "This opportunity has registrations or hours, so it can't be deleted. Set its status to Canceled instead.");
  }
  await db.opportunity.delete({ where: { id } });
  revalidatePath("/admin/volunteers/opportunities");
  go("/admin/volunteers/opportunities", "ok", "Opportunity deleted.");
}

/* ───────────────────────── Shifts ───────────────────────── */

export async function saveShift(formData: FormData) {
  await requireStaff();
  const opportunityId = str(formData.get("opportunityId"));
  const shiftId = str(formData.get("shiftId"));
  const to = `/admin/volunteers/opportunities/${opportunityId}#shifts`;
  const startAt = optDate(formData.get("startAt"));
  const endAt = optDate(formData.get("endAt"));
  const capacity = optInt(formData.get("capacity"));
  if (!startAt || !endAt || endAt <= startAt) go(to, "err", "Shift end must be after its start.");
  if (!capacity || capacity < 1) go(to, "err", "Capacity must be at least 1.");
  const data = { name: str(formData.get("name")) || "Main shift", startAt, endAt, capacity };
  if (shiftId) await db.shift.update({ where: { id: shiftId }, data });
  else await db.shift.create({ data: { ...data, opportunityId } });
  revalidatePath(`/volunteer/opportunities/${opportunityId}`);
  go(to, "ok", shiftId ? "Shift updated." : "Shift added.");
}

export async function deleteShift(formData: FormData) {
  await requireStaff();
  const shiftId = str(formData.get("shiftId"));
  const shift = await db.shift.findUnique({ where: { id: shiftId }, include: { _count: { select: { registrations: { where: { status: { not: "CANCELED" } } }, hours: true } } } });
  if (!shift) go("/admin/volunteers/opportunities", "err", "Shift not found.");
  const to = `/admin/volunteers/opportunities/${shift.opportunityId}#shifts`;
  if (shift._count.registrations || shift._count.hours) go(to, "err", "Remove the volunteers (and their hours) from this shift before deleting it.");
  await db.shift.delete({ where: { id: shiftId } });
  go(to, "ok", "Shift deleted.");
}

export async function addVolunteerToShift(formData: FormData) {
  await requireStaff();
  const shiftId = str(formData.get("shiftId"));
  const contactId = str(formData.get("contactId"));
  const opportunityId = str(formData.get("opportunityId"));
  const to = `/admin/volunteers/opportunities/${opportunityId}#shift-${shiftId}`;
  if (!contactId) go(to, "err", "Choose a volunteer.");
  const err = await registerForShift(contactId, shiftId, { staffOverride: true });
  if (err) go(to, "err", err.replace("You're", "They're"));
  refreshContact(contactId);
  go(to, "ok", "Volunteer added to the shift.");
}

export async function setRegistrationStatus(formData: FormData) {
  const staff = await requireStaff();
  const id = str(formData.get("registrationId"));
  const status = str(formData.get("status"));
  const withHours = bool(formData.get("withHours"));
  if (!["REGISTERED", "ATTENDED", "NO_SHOW", "CANCELED"].includes(status)) return;
  const reg = await db.registration.update({ where: { id }, data: { status }, include: { shift: true } });
  const to = back(formData, `/admin/volunteers/opportunities/${reg.shift.opportunityId}#shift-${reg.shiftId}`);
  let msg = status === "ATTENDED" ? "Marked attended." : status === "NO_SHOW" ? "Marked as no-show." : status === "CANCELED" ? "Removed from shift." : "Updated.";
  if (status === "ATTENDED" && withHours) {
    const created = await createApprovedHours({
      contactId: reg.contactId,
      hours: shiftHours(reg.shift),
      date: reg.shift.startAt,
      shiftId: reg.shiftId,
      opportunityId: reg.shift.opportunityId,
      reviewer: staff.name,
    });
    msg = created ? `Marked attended and ${shiftHours(reg.shift)} hours approved.` : "Marked attended (hours were already logged — approved).";
  }
  refreshContact(reg.contactId);
  revalidatePath("/admin/volunteers/hours");
  go(to, "ok", msg);
}

export async function markShiftAttended(formData: FormData) {
  const staff = await requireStaff();
  const shiftId = str(formData.get("shiftId"));
  const shift = await db.shift.findUnique({ where: { id: shiftId }, include: { registrations: { where: { status: "REGISTERED" } } } });
  if (!shift) go("/admin/volunteers/opportunities", "err", "Shift not found.");
  for (const r of shift.registrations) {
    await db.registration.update({ where: { id: r.id }, data: { status: "ATTENDED" } });
    await createApprovedHours({
      contactId: r.contactId,
      hours: shiftHours(shift),
      date: shift.startAt,
      shiftId: shift.id,
      opportunityId: shift.opportunityId,
      reviewer: staff.name,
    });
  }
  revalidatePath("/admin/volunteers/hours");
  go(`/admin/volunteers/opportunities/${shift.opportunityId}#shift-${shift.id}`, "ok", `${shift.registrations.length} volunteer(s) marked attended with hours approved.`);
}

/* ───────────────────────── Hours ───────────────────────── */

export async function approveHoursOne(formData: FormData) {
  const staff = await requireStaff();
  const id = str(formData.get("id"));
  const row = await db.volunteerHour.findUnique({ where: { id }, select: { contactId: true } });
  const n = await approveHourEntries([id], staff.name);
  if (row) refreshContact(row.contactId);
  revalidatePath("/admin/volunteers", "layout");
  go(back(formData, "/admin/volunteers/hours"), "ok", n ? "Hours approved." : "Nothing to approve.");
}

export async function approveHoursBulk(formData: FormData) {
  const staff = await requireStaff();
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const to = back(formData, "/admin/volunteers/hours");
  if (!ids.length) go(to, "err", "Select at least one entry.");
  const n = await approveHourEntries(ids, staff.name);
  revalidatePath("/admin/volunteers", "layout");
  go(to, "ok", `${n} entr${n === 1 ? "y" : "ies"} approved.`);
}

export async function rejectHoursOne(formData: FormData) {
  const staff = await requireStaff();
  const id = str(formData.get("id"));
  const note = optStr(formData.get(`note-${id}`)) ?? optStr(formData.get("note"));
  const row = await db.volunteerHour.findUnique({ where: { id }, select: { contactId: true } });
  await rejectHourEntry(id, staff.name, note);
  if (row) refreshContact(row.contactId);
  revalidatePath("/admin/volunteers", "layout");
  go(back(formData, "/admin/volunteers/hours"), "ok", "Hours rejected.");
}

export async function addHoursForVolunteer(formData: FormData) {
  const staff = await requireStaff();
  const contactId = str(formData.get("contactId"));
  const to = back(formData, "/admin/volunteers/hours");
  const hours = Number(str(formData.get("hours")));
  const date = optDate(formData.get("date"));
  if (!contactId) go(to, "err", "Choose a volunteer.");
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) go(to, "err", "Hours must be between 0.25 and 24.");
  if (!date) go(to, "err", "Choose a date.");
  await createApprovedHours({
    contactId,
    hours: Math.round(hours * 100) / 100,
    date,
    reviewer: staff.name,
    opportunityId: optStr(formData.get("opportunityId")),
    description: optStr(formData.get("description")),
  });
  refreshContact(contactId);
  revalidatePath("/admin/volunteers", "layout");
  go(to, "ok", `${hours} hour(s) added and approved.`);
}

/* ───────────────────────── Badges ───────────────────────── */

export async function awardBadge(formData: FormData) {
  const staff = await requireStaff();
  const contactId = str(formData.get("contactId"));
  const badgeId = str(formData.get("badgeId"));
  const to = back(formData, `/admin/constituents/${contactId}`);
  if (!badgeId) go(to, "err", "Choose a badge.");
  const exists = await db.contactBadge.findUnique({ where: { contactId_badgeId: { contactId, badgeId } } });
  if (exists) go(to, "err", "They already have that badge.");
  const badge = await db.contactBadge.create({
    data: { contactId, badgeId, awardedBy: staff.name, note: optStr(formData.get("note")) },
    include: { badge: true },
  });
  await notifyBadges(contactId, [badge.badge.name]);
  refreshContact(contactId);
  go(to, "ok", `“${badge.badge.name}” awarded.`);
}

export async function revokeBadge(formData: FormData) {
  await requireStaff();
  const id = str(formData.get("id"));
  const cb = await db.contactBadge.delete({ where: { id } });
  refreshContact(cb.contactId);
  go(back(formData, `/admin/constituents/${cb.contactId}`), "ok", "Badge removed.");
}

export async function recheckBadges(formData: FormData) {
  await requireStaff();
  const contactId = str(formData.get("contactId"));
  const awarded = await awardHourBadges(contactId);
  await notifyBadges(contactId, awarded);
  refreshContact(contactId);
  go(back(formData, `/admin/constituents/${contactId}`), "ok", awarded.length ? `Awarded: ${awarded.join(", ")}` : "No new hour badges earned yet.");
}

/* ───────────────────────── Setup: programs, skills, badges ───────────────────────── */

const SETUP = "/admin/volunteers/setup";

export async function saveProgram(formData: FormData) {
  await requireStaff();
  const id = str(formData.get("id"));
  const name = str(formData.get("name"));
  if (!name) go(SETUP, "err", "Program name is required.");
  const data = { name, description: optStr(formData.get("description")), color: str(formData.get("color")) || "blue" };
  try {
    if (id) await db.program.update({ where: { id }, data });
    else await db.program.create({ data });
  } catch {
    go(SETUP, "err", `A program called “${name}” already exists.`);
  }
  revalidatePath("/volunteer");
  go(SETUP, "ok", "Program saved.");
}

export async function deleteProgram(formData: FormData) {
  await requireStaff();
  const id = str(formData.get("id"));
  const used = await db.opportunity.count({ where: { programId: id } });
  if (used) go(SETUP, "err", `This program is used by ${used} opportunit${used === 1 ? "y" : "ies"} — move them to another program first.`);
  await db.program.delete({ where: { id } });
  go(SETUP, "ok", "Program deleted.");
}

export async function saveSkill(formData: FormData) {
  await requireStaff();
  const id = str(formData.get("id"));
  const name = str(formData.get("name"));
  if (!name) go(SETUP, "err", "Skill name is required.");
  try {
    if (id) await db.skill.update({ where: { id }, data: { name } });
    else await db.skill.create({ data: { name } });
  } catch {
    go(SETUP, "err", `A skill called “${name}” already exists.`);
  }
  go(SETUP, "ok", "Skill saved.");
}

export async function deleteSkill(formData: FormData) {
  await requireStaff();
  const id = str(formData.get("id"));
  const s = await db.skill.findUnique({ where: { id }, include: { _count: { select: { volunteers: true, opportunities: true } } } });
  if (!s) go(SETUP, "err", "Skill not found.");
  if (s._count.volunteers || s._count.opportunities) {
    go(SETUP, "err", `“${s.name}” is used by ${s._count.volunteers} volunteer(s) and ${s._count.opportunities} opportunit${s._count.opportunities === 1 ? "y" : "ies"}, so it can't be deleted. Rename it instead.`);
  }
  await db.skill.delete({ where: { id } });
  go(SETUP, "ok", "Skill deleted.");
}

export async function saveBadge(formData: FormData) {
  await requireStaff();
  const id = str(formData.get("id"));
  const name = str(formData.get("name"));
  const kind = str(formData.get("kind")) === "HOURS" ? "HOURS" : "RECOGNITION";
  const tier = ["BRONZE", "SILVER", "GOLD"].includes(str(formData.get("tier"))) ? str(formData.get("tier")) : "BRONZE";
  const threshold = Number(str(formData.get("hoursThreshold")));
  if (!name) go(SETUP, "err", "Badge name is required.");
  if (kind === "HOURS" && !(threshold > 0)) go(SETUP, "err", "Hours badges need an hours threshold.");
  const data = { name, kind, tier, hoursThreshold: kind === "HOURS" ? threshold : null, description: optStr(formData.get("description")) };
  try {
    if (id) await db.badge.update({ where: { id }, data });
    else await db.badge.create({ data });
  } catch {
    go(SETUP, "err", `A badge called “${name}” already exists.`);
  }
  go(SETUP, "ok", "Badge saved.");
}

export async function deleteBadge(formData: FormData) {
  await requireStaff();
  const id = str(formData.get("id"));
  const used = await db.contactBadge.count({ where: { badgeId: id } });
  if (used) go(SETUP, "err", `This badge has been awarded to ${used} volunteer(s), so it can't be deleted.`);
  await db.badge.delete({ where: { id } });
  go(SETUP, "ok", "Badge deleted.");
}
