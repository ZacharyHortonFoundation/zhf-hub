import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, isSameDay } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format integer cents as US dollars. */
export function money(cents: number | null | undefined, opts: { decimals?: boolean } = {}) {
  const v = (cents ?? 0) / 100;
  const decimals = opts.decimals ?? !Number.isInteger(v);
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
}

/** Compact money for KPI tiles: $12.4k */
export function moneyCompact(cents: number) {
  const v = cents / 100;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 10_000) return `$${(v / 1000).toFixed(1)}k`;
  return money(cents, { decimals: false });
}

/** Parse "$1,234.50" / "1234.5" into cents. Returns NaN for invalid input. */
export function toCents(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === "") return NaN;
  const n = typeof input === "number" ? input : Number(String(input).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

export function fullName(c: { firstName?: string | null; lastName?: string | null; orgName?: string | null; type?: string | null }) {
  if (c.type === "BUSINESS" && c.orgName) return c.orgName;
  const n = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
  return n || c.orgName || "Unnamed";
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function fmtDate(d: Date | string | null | undefined, pattern = "MMM d, yyyy") {
  if (!d) return "—";
  return format(new Date(d), pattern);
}

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return format(new Date(d), "MMM d, yyyy · h:mm a");
}

/** "Sat, Sep 12 · 9:00 AM – 12:30 PM" (handles multi-day ranges) */
export function fmtRange(start: Date | string, end?: Date | string | null) {
  const s = new Date(start);
  if (!end) return format(s, "EEE, MMM d, yyyy · h:mm a");
  const e = new Date(end);
  if (isSameDay(s, e)) return `${format(s, "EEE, MMM d, yyyy · h:mm a")} – ${format(e, "h:mm a")}`;
  return `${format(s, "MMM d, h:mm a")} – ${format(e, "MMM d, yyyy, h:mm a")}`;
}

export function hoursBetween(start: Date, end: Date) {
  return Math.round(((end.getTime() - start.getTime()) / 36e5) * 100) / 100;
}

export function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

/** Percent change helper for KPI deltas. Returns null when there is no baseline. */
export function delta(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function str(v: FormDataEntryValue | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

export function optStr(v: FormDataEntryValue | null | undefined): string | null {
  const s = str(v);
  return s ? s : null;
}

export function bool(v: FormDataEntryValue | null | undefined): boolean {
  return v === "on" || v === "true" || v === "1";
}

export function optInt(v: FormDataEntryValue | null | undefined): number | null {
  const s = str(v);
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** Parse a <input type="datetime-local"> / <input type="date"> value as local time. */
export function optDate(v: FormDataEntryValue | null | undefined): Date | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Value for <input type="datetime-local"> */
export function toLocalInput(d: Date | string | null | undefined) {
  if (!d) return "";
  return format(new Date(d), "yyyy-MM-dd'T'HH:mm");
}

export function toDateInput(d: Date | string | null | undefined) {
  if (!d) return "";
  return format(new Date(d), "yyyy-MM-dd");
}

export function randomCode(len = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function csvEscape(v: unknown) {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]) {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(","))].join("\n");
}
