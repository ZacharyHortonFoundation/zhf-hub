import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "./db";
import {
  STAFF_COOKIE,
  VOLUNTEER_COOKIE,
  signSession,
  verifySession,
  type StaffSession,
  type VolunteerSession,
} from "./session";

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function checkPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

// ── Staff ──────────────────────────────────────────────────────────

export async function getStaff(): Promise<StaffSession | null> {
  const jar = await cookies();
  return verifySession<StaffSession>(jar.get(STAFF_COOKIE)?.value);
}

/** Use at the top of every admin server action / page. */
export async function requireStaff(roles?: string[]): Promise<StaffSession> {
  const s = await getStaff();
  if (!s || s.kind !== "staff") redirect("/login");
  if (roles && !roles.includes(s.role)) redirect("/admin?denied=1");
  return s;
}

export async function startStaffSession(user: { id: string; role: string; name: string }) {
  const token = await signSession({ kind: "staff", userId: user.id, role: user.role, name: user.name });
  const jar = await cookies();
  jar.set(STAFF_COOKIE, token, { ...cookieOpts, maxAge: 60 * 60 * 24 * 7 });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
}

export async function endStaffSession() {
  const jar = await cookies();
  jar.delete(STAFF_COOKIE);
}

// ── Volunteer portal ───────────────────────────────────────────────

export async function getVolunteer(): Promise<VolunteerSession | null> {
  const jar = await cookies();
  return verifySession<VolunteerSession>(jar.get(VOLUNTEER_COOKIE)?.value);
}

export async function requireVolunteer(): Promise<VolunteerSession> {
  const s = await getVolunteer();
  if (!s || s.kind !== "volunteer") redirect("/volunteer/login");
  return s;
}

export async function startVolunteerSession(contact: { id: string; firstName: string; lastName: string }) {
  const token = await signSession(
    { kind: "volunteer", contactId: contact.id, name: `${contact.firstName} ${contact.lastName}`.trim() },
    30,
  );
  const jar = await cookies();
  jar.set(VOLUNTEER_COOKIE, token, { ...cookieOpts, maxAge: 60 * 60 * 24 * 30 });
}

export async function endVolunteerSession() {
  const jar = await cookies();
  jar.delete(VOLUNTEER_COOKIE);
}
