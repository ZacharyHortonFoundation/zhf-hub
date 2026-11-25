import { db } from "./db";

/**
 * Simple brute-force protection for staff and volunteer sign-in.
 * Failed attempts are counted per email in the Setting table (works on serverless hosts,
 * unlike in-memory counters). After 5 failures within 15 minutes the account is locked
 * for 15 minutes. A successful sign-in clears the counter.
 */
const MAX = 5;
const WINDOW_MS = 15 * 60 * 1000;
const key = (scope: string, email: string) => `login-fail:${scope}:${email.toLowerCase()}`;

type Rec = { count: number; first: number; lockedUntil?: number };

async function read(k: string): Promise<Rec | null> {
  const row = await db.setting.findUnique({ where: { key: k } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as Rec;
  } catch {
    return null;
  }
}

export async function isLocked(scope: "staff" | "volunteer", email: string) {
  const r = await read(key(scope, email));
  return Boolean(r?.lockedUntil && r.lockedUntil > Date.now());
}

export async function recordFailure(scope: "staff" | "volunteer", email: string) {
  const k = key(scope, email);
  const now = Date.now();
  const r = await read(k);
  const fresh = !r || now - r.first > WINDOW_MS;
  const next: Rec = fresh ? { count: 1, first: now } : { ...r!, count: r!.count + 1 };
  if (next.count >= MAX) next.lockedUntil = now + WINDOW_MS;
  await db.setting.upsert({ where: { key: k }, create: { key: k, value: JSON.stringify(next) }, update: { value: JSON.stringify(next) } });
  // slow down guessing a little
  await new Promise((res) => setTimeout(res, 400));
}

export async function clearFailures(scope: "staff" | "volunteer", email: string) {
  await db.setting.deleteMany({ where: { key: key(scope, email) } });
}
