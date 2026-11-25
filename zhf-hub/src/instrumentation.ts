/** Runs once when the server starts. */
export async function register() {
  // Pin the process to ZHF's local time zone (cloud hosts default to UTC).
  process.env.TZ = process.env.ORG_TIMEZONE || "America/Los_Angeles";

  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;

  // Loud, early warnings for production misconfiguration (visible in the host's logs).
  const problems: string[] = [];
  const warn: string[] = [];
  const env = process.env;
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32 || env.AUTH_SECRET.includes("change-me")) problems.push("AUTH_SECRET is missing or too short (use 48+ random bytes)");
  if (!env.APP_URL || !env.APP_URL.startsWith("https://")) problems.push("APP_URL must be the public https:// address (used in emails and Stripe redirects)");
  if (!/^postgres/i.test(env.DATABASE_URL ?? "")) problems.push("DATABASE_URL is not PostgreSQL — SQLite is for local development only");
  if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET) problems.push("STRIPE_WEBHOOK_SECRET is missing — online payments will never be marked as paid");
  if (!env.STRIPE_SECRET_KEY) warn.push("Stripe not configured: payments run in DEMO mode");
  if (env.STRIPE_SECRET_KEY?.startsWith("sk_test")) warn.push("Stripe is in TEST mode");
  if (!env.RESEND_API_KEY) warn.push("RESEND_API_KEY not set: emails are only logged to the outbox");
  if (!env.CRON_SECRET) warn.push("CRON_SECRET not set: daily reminders are disabled");

  for (const p of problems) console.error(`[ZHF Hub config] ERROR: ${p}`);
  for (const w of warn) console.warn(`[ZHF Hub config] ${w}`);
}
