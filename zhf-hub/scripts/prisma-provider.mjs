#!/usr/bin/env node
/**
 * Points prisma/schema.prisma at the right database engine for the current DATABASE_URL:
 *   file:./dev.db            → provider = "sqlite"      (local development)
 *   postgres(ql)://…         → provider = "postgresql"  (production)
 * Runs automatically before `prisma generate`, `next build` and the db:* scripts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let url = process.env.DATABASE_URL;
if (!url) {
  const envFile = path.join(root, ".env");
  if (existsSync(envFile)) {
    const line = readFileSync(envFile, "utf8").split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
    if (line) url = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  }
}
const provider = /^postgres(ql)?:\/\//i.test(url ?? "") ? "postgresql" : "sqlite";
const schemaPath = path.join(root, "prisma", "schema.prisma");
const schema = readFileSync(schemaPath, "utf8");
const next = schema.replace(/(datasource\s+db\s*\{[^}]*?provider\s*=\s*)"(sqlite|postgresql)"/, `$1"${provider}"`);
if (next !== schema) {
  writeFileSync(schemaPath, next);
  console.log(`[prisma-provider] schema switched to ${provider}`);
} else {
  console.log(`[prisma-provider] using ${provider}`);
}

// --generate: regenerate the Prisma client only if it was built for the other engine
if (process.argv.includes("--generate")) {
  const generated = path.join(root, "node_modules", ".prisma", "client", "schema.prisma");
  const current = existsSync(generated) ? (readFileSync(generated, "utf8").match(/datasource\s+db\s*\{[^}]*?provider\s*=\s*"(\w+)"/)?.[1] ?? "") : "";
  if (current !== provider) {
    console.log(`[prisma-provider] regenerating Prisma client for ${provider}…`);
    execSync("npx prisma generate", { cwd: root, stdio: "inherit" });
  }
}
