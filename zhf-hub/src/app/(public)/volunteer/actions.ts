"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  checkPassword,
  endVolunteerSession,
  getVolunteer,
  hashPassword,
  requireVolunteer,
  startVolunteerSession,
} from "@/lib/auth";
import { upsertContactByEmail } from "@/lib/contacts";
import { sendTemplate } from "@/lib/email";
import { getSettings } from "@/lib/settings";
import { cancelRegistration, portalUrl, registerForShift } from "@/lib/volunteers";
import { readPasswordToken, sendPortalPasswordLink } from "@/lib/portal-password";
import { clearFailures, isLocked, recordFailure } from "@/lib/login-throttle";
import { fullName, optDate, str } from "@/lib/utils";

function safeNext(next: string, fallback: string) {
  return next.startsWith("/volunteer") ? next : fallback;
}

/* ───────────────────────── Apply ───────────────────────── */

export type ApplyState = { errors?: Record<string, string>; message?: string; step?: number };

const applySchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().optional(),
  emergencyName: z.string().trim().min(1, "Emergency contact name is required"),
  emergencyPhone: z.string().trim().min(7, "Emergency contact phone is required"),
  emergencyEmail: z.union([z.literal(""), z.string().trim().email("Enter a valid email address")]).optional(),
  motivation: z.string().trim().max(2000).optional(),
  password: z.string().min(8, "Use at least 8 characters"),
  over18: z.literal("on", { message: "You must be 18 or older to apply online" }),
  waiver: z.literal("on", { message: "Please agree to the volunteer waiver" }),
});

const STEP_OF: Record<string, number> = {
  firstName: 1, lastName: 1, email: 1, phone: 1, emergencyName: 1, emergencyPhone: 1, emergencyEmail: 1,
  motivation: 2, password: 2,
  over18: 3, waiver: 3,
};

export async function applyAction(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  const raw = {
    firstName: str(formData.get("firstName")),
    lastName: str(formData.get("lastName")),
    email: str(formData.get("email")),
    phone: str(formData.get("phone")),
    emergencyName: str(formData.get("emergencyName")),
    emergencyPhone: str(formData.get("emergencyPhone")),
    emergencyEmail: str(formData.get("emergencyEmail")),
    motivation: str(formData.get("motivation")),
    password: String(formData.get("password") ?? ""),
    over18: formData.get("over18") ?? undefined,
    waiver: formData.get("waiver") ?? undefined,
  };
  const parsed = applySchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? "form");
      if (!errors[k]) errors[k] = issue.message;
    }
    const step = Math.min(...Object.keys(errors).map((k) => STEP_OF[k] ?? 3));
    return { errors, step, message: "Please fix the highlighted fields." };
  }
  const v = parsed.data;

  const existing = await db.contact.findFirst({ where: { email: v.email }, orderBy: { createdAt: "asc" } });
  if (existing?.portalPasswordHash && (existing.volunteerStatus === "APPROVED" || existing.volunteerStatus === "PENDING")) {
    return {
      step: 1,
      errors: { email: "You already have a volunteer account with this email." },
      message: "Looks like you're already registered — please sign in instead.",
    };
  }

  // A brand-new person gets their portal right away. If the email already belongs to a
  // constituent (donor, attendee, migrated volunteer…), we never set a password from this
  // public form — we email a secure set-password link instead, so nobody can claim someone
  // else's record just by knowing their email address.
  const isNewPerson = !existing;
  const keepApproved = existing?.volunteerStatus === "APPROVED";
  const contact = await upsertContactByEmail({ email: v.email, firstName: v.firstName, lastName: v.lastName, phone: v.phone || null, source: "VOLUNTEER" });
  await db.contact.update({
    where: { id: contact.id },
    data: {
      volunteerStatus: keepApproved ? "APPROVED" : "PENDING",
      ...(isNewPerson
        ? {
            emergencyContactName: v.emergencyName,
            emergencyContactPhone: v.emergencyPhone,
            emergencyContactEmail: v.emergencyEmail || null,
            portalPasswordHash: await hashPassword(v.password),
          }
        : {
            emergencyContactName: contact.emergencyContactName ?? v.emergencyName,
            emergencyContactPhone: contact.emergencyContactPhone ?? v.emergencyPhone,
            emergencyContactEmail: contact.emergencyContactEmail ?? (v.emergencyEmail || null),
          }),
      phone: contact.phone || v.phone || null,
    },
  });

  const availability = formData.getAll("availability").map(String).filter(Boolean).join(", ");
  await db.volunteerApplication.create({
    data: {
      contactId: contact.id,
      status: keepApproved ? "APPROVED" : "PENDING",
      reviewNotes: keepApproved ? "Existing approved volunteer re-registered online." : null,
      motivation: v.motivation || null,
      availability: availability || null,
      over18: true,
      agreedWaiver: true,
    },
  });

  const validSkills = new Set((await db.skill.findMany({ select: { id: true } })).map((s) => s.id));
  for (const [kind, field] of [["INTEREST", "interest"], ["EXPERIENCE", "experience"]] as const) {
    for (const skillId of formData.getAll(field).map(String)) {
      if (!validSkills.has(skillId)) continue;
      await db.volunteerSkill.upsert({
        where: { contactId_skillId_kind: { contactId: contact.id, skillId, kind } },
        create: { contactId: contact.id, skillId, kind },
        update: {},
      });
    }
  }

  if (!keepApproved) {
    await sendTemplate({
      templateKey: "volunteer.application_received",
      to: v.email,
      toName: `${v.firstName} ${v.lastName}`,
      contactId: contact.id,
      vars: { first_name: v.firstName, last_name: v.lastName, portal_url: portalUrl() },
    });
  }

  if (!isNewPerson) {
    await sendPortalPasswordLink(contact.id);
    redirect("/volunteer/reset?sent=1&welcome=1");
  }

  await startVolunteerSession({ id: contact.id, firstName: v.firstName, lastName: v.lastName });
  redirect("/volunteer/portal?ok=" + encodeURIComponent("Application received — we'll be in touch soon!"));
}

/* ───────────────────────── Set / reset portal password ───────────────────────── */

export async function requestPasswordLink(formData: FormData) {
  const email = str(formData.get("email")).toLowerCase();
  if (email) {
    const contact = await db.contact.findFirst({
      where: { email, OR: [{ portalPasswordHash: { not: null } }, { volunteerStatus: { not: "NONE" } }] },
      orderBy: { createdAt: "asc" },
    });
    if (contact) await sendPortalPasswordLink(contact.id);
  }
  // Same answer whether or not the email exists, so the form can't be used to probe for donors.
  redirect("/volunteer/reset?sent=1");
}

export async function setPortalPassword(token: string, formData: FormData) {
  const p = await readPasswordToken(token);
  if (!p) redirect("/volunteer/reset?expired=1");
  const pw = String(formData.get("password") ?? "");
  if (pw.length < 8 || pw !== String(formData.get("password2") ?? "")) {
    redirect(`/volunteer/reset/${token}?err=${encodeURIComponent("Use at least 8 characters and make sure both passwords match.")}`);
  }
  const contact = await db.contact.update({ where: { id: p.contact.id }, data: { portalPasswordHash: await hashPassword(pw) } });
  await startVolunteerSession(contact);
  redirect("/volunteer/portal?ok=" + encodeURIComponent("Your password is set — welcome to your volunteer portal!"));
}

/* ───────────────────────── Login / logout ───────────────────────── */

export async function volunteerLogin(formData: FormData) {
  const email = str(formData.get("email")).toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(str(formData.get("next")), "/volunteer/portal");
  if (email && (await isLocked("volunteer", email))) redirect(`/volunteer/login?error=locked&next=${encodeURIComponent(next)}`);
  const contact = email
    ? await db.contact.findFirst({ where: { email, portalPasswordHash: { not: null } }, orderBy: { createdAt: "asc" } })
    : null;
  if (!contact?.portalPasswordHash || !(await checkPassword(password, contact.portalPasswordHash))) {
    if (email) await recordFailure("volunteer", email);
    redirect(`/volunteer/login?error=1&next=${encodeURIComponent(next)}`);
  }
  await clearFailures("volunteer", email);
  await startVolunteerSession(contact);
  redirect(next);
}

export async function volunteerLogout() {
  await endVolunteerSession();
  redirect("/volunteer?ok=" + encodeURIComponent("You've been signed out."));
}

/* ───────────────────────── Shifts ───────────────────────── */

export async function signUpForShift(formData: FormData) {
  const shiftId = str(formData.get("shiftId"));
  const back = safeNext(str(formData.get("back")), "/volunteer/portal");
  const vol = await getVolunteer();
  if (!vol) redirect(`/volunteer/login?next=${encodeURIComponent(back)}`);
  const contact = await db.contact.findUnique({ where: { id: vol.contactId } });
  if (!contact) {
    await endVolunteerSession();
    redirect("/volunteer/login");
  }
  const settings = await getSettings();
  if (settings.requireApprovalForSignup && contact.volunteerStatus !== "APPROVED") {
    redirect(`${back}?err=${encodeURIComponent("Your volunteer application needs to be approved before you can sign up for shifts.")}`);
  }
  const err = await registerForShift(contact.id, shiftId);
  revalidatePath(back);
  if (err) redirect(`${back}?err=${encodeURIComponent(err)}`);
  redirect(`${back}?ok=${encodeURIComponent("You're signed up! A confirmation email is on its way.")}`);
}

export async function cancelShift(formData: FormData) {
  const shiftId = str(formData.get("shiftId"));
  const back = safeNext(str(formData.get("back")), "/volunteer/portal");
  const vol = await requireVolunteer();
  const err = await cancelRegistration(vol.contactId, shiftId);
  revalidatePath(back);
  if (err) redirect(`${back}?err=${encodeURIComponent(err)}`);
  redirect(`${back}?ok=${encodeURIComponent("Your registration was canceled.")}`);
}

/* ───────────────────────── Portal: hours & profile ───────────────────────── */

export async function logHours(formData: FormData) {
  const vol = await requireVolunteer();
  const ref = str(formData.get("shiftId")); // shift id or "" for "Other"
  const hours = Number(str(formData.get("hours")));
  let date = optDate(formData.get("date"));
  const description = str(formData.get("description")) || null;

  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    redirect("/volunteer/portal?err=" + encodeURIComponent("Enter between 0.25 and 24 hours.") + "#log-hours");
  }
  let shiftId: string | null = null;
  let opportunityId: string | null = null;
  if (ref) {
    const reg = await db.registration.findFirst({
      where: { contactId: vol.contactId, shiftId: ref, status: { not: "CANCELED" } },
      include: { shift: true },
    });
    if (!reg) redirect("/volunteer/portal?err=" + encodeURIComponent("Pick a shift you signed up for, or choose Other."));
    const dup = await db.volunteerHour.findFirst({ where: { contactId: vol.contactId, shiftId: ref, status: { not: "REJECTED" } } });
    if (dup) redirect("/volunteer/portal?err=" + encodeURIComponent("You've already logged hours for that shift."));
    shiftId = reg.shiftId;
    opportunityId = reg.shift.opportunityId;
    date = date ?? reg.shift.startAt;
  } else if (!description) {
    redirect("/volunteer/portal?err=" + encodeURIComponent("Tell us what you did when choosing Other.") + "#log-hours");
  }
  if (!date) redirect("/volunteer/portal?err=" + encodeURIComponent("Please choose a date."));
  if (date > new Date()) redirect("/volunteer/portal?err=" + encodeURIComponent("Hours can't be logged for a future date."));

  await db.volunteerHour.create({
    data: { contactId: vol.contactId, shiftId, opportunityId, date, hours: Math.round(hours * 100) / 100, description, status: "PENDING" },
  });
  const contact = await db.contact.findUnique({ where: { id: vol.contactId } });
  if (contact) {
    await sendTemplate({
      templateKey: "volunteer.hours_submitted",
      to: contact.email,
      toName: fullName(contact),
      contactId: contact.id,
      vars: { first_name: contact.firstName, last_name: contact.lastName, hours, portal_url: portalUrl() },
    });
  }
  revalidatePath("/volunteer/portal");
  redirect("/volunteer/portal?ok=" + encodeURIComponent("Thanks! Your hours were submitted for approval."));
}

export async function updateVolunteerProfile(formData: FormData) {
  const vol = await requireVolunteer();
  await db.contact.update({
    where: { id: vol.contactId },
    data: {
      phone: str(formData.get("phone")) || null,
      emergencyContactName: str(formData.get("emergencyName")) || null,
      emergencyContactPhone: str(formData.get("emergencyPhone")) || null,
      emergencyContactEmail: str(formData.get("emergencyEmail")) || null,
    },
  });
  const interests = new Set(formData.getAll("interest").map(String));
  const valid = await db.skill.findMany({ select: { id: true } });
  await db.volunteerSkill.deleteMany({ where: { contactId: vol.contactId, kind: "INTEREST" } });
  for (const s of valid) {
    if (interests.has(s.id)) await db.volunteerSkill.create({ data: { contactId: vol.contactId, skillId: s.id, kind: "INTEREST" } });
  }
  revalidatePath("/volunteer/portal");
  redirect("/volunteer/portal?ok=" + encodeURIComponent("Profile updated."));
}
