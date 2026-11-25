// Edge-safe session helpers (used by middleware and server code).
import { SignJWT, jwtVerify } from "jose";

export const STAFF_COOKIE = "zhf_staff";
export const VOLUNTEER_COOKIE = "zhf_volunteer";

export type StaffSession = { kind: "staff"; userId: string; role: string; name: string };
export type VolunteerSession = { kind: "volunteer"; contactId: string; name: string };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not set");
    return new TextEncoder().encode("dev-only-insecure-secret-change-me");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(payload: StaffSession | VolunteerSession, days = 7) {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(secret());
}

/** Generic signed token for public links (e.g. a donor's year-end statement). */
export async function signToken(payload: Record<string, unknown>, days = 30) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${days}d`).sign(secret());
}

export async function verifyToken<T = Record<string, unknown>>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as T;
  } catch {
    return null;
  }
}

export async function verifySession<T extends StaffSession | VolunteerSession>(token?: string): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as T;
  } catch {
    return null;
  }
}
