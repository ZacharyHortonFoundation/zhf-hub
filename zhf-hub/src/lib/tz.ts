/**
 * ZHF operates in Fresno, so every date the server parses or formats is in Pacific time,
 * regardless of where the server runs (cloud hosts default to UTC).
 * Node re-reads the zone when process.env.TZ is assigned, so this takes effect immediately.
 * Override with ORG_TIMEZONE if ever needed.
 */
export const ORG_TZ = process.env.ORG_TIMEZONE || "America/Los_Angeles";

if (typeof process !== "undefined" && process.env && process.env.TZ !== ORG_TZ) {
  process.env.TZ = ORG_TZ;
}
