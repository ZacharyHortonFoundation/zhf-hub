/* eslint-disable no-console */
/**
 * Database lockdown — runs automatically at the end of `npm run db:deploy`.
 *
 * Supabase publishes every table it can see through its auto-generated web API (PostgREST),
 * reachable with the project's public "anon" key. ZHF Hub never uses that API — it talks to
 * PostgreSQL directly — so this script makes sure the API can't read or change our data:
 *
 *   1. Row Level Security is enabled on every ZHF Hub table (with no policies = deny by default
 *      for API roles; the app's database user owns the tables, so it is unaffected).
 *   2. All privileges are revoked from Supabase's API roles (anon, authenticated) on our schema,
 *      including default privileges for tables created later.
 *
 * Harmless on other PostgreSQL hosts (e.g. Azure): the API roles simply don't exist there.
 * Does nothing on SQLite.
 */
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env file */
}

import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\//i.test(url)) {
  console.log("[db-lockdown] not PostgreSQL — nothing to do");
  process.exit(0);
}

const schema = new URL(url).searchParams.get("schema") || "public";
const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const db = new PrismaClient();

async function main() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = ${schema}`;
  for (const { tablename } of tables) {
    await db.$executeRawUnsafe(`ALTER TABLE ${ident(schema)}.${ident(tablename)} ENABLE ROW LEVEL SECURITY`);
  }

  const apiRoles = (await db.$queryRaw<{ rolname: string }[]>`SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')`).map((r) => r.rolname);
  for (const role of apiRoles) {
    const r = ident(role);
    const s = ident(schema);
    await db.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA ${s} FROM ${r}`);
    await db.$executeRawUnsafe(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${s} FROM ${r}`);
    await db.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} REVOKE ALL ON TABLES FROM ${r}`);
    await db.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} REVOKE ALL ON SEQUENCES FROM ${r}`);
    // Our own schema: also hide it entirely. (Never revoke USAGE on "public" — Supabase relies on it.)
    if (schema !== "public") await db.$executeRawUnsafe(`REVOKE ALL ON SCHEMA ${s} FROM ${r}`);
  }

  console.log(
    `[db-lockdown] schema "${schema}": row level security on ${tables.length} tables` +
      (apiRoles.length ? `; revoked access for ${apiRoles.join(", ")}` : "; no Supabase API roles found (not Supabase)"),
  );
  if (schema === "public" && apiRoles.length) {
    console.warn('[db-lockdown] Tip: on Supabase add "&schema=zhf" to DATABASE_URL so ZHF Hub tables live outside the API-exposed "public" schema.');
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("[db-lockdown] failed:", e);
    await db.$disconnect();
    process.exit(1);
  });
