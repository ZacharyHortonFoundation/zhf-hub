import "./tz";
import { PrismaClient } from "@prisma/client";

export const isPostgres = /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL ?? "");

/**
 * Text search must be case-insensitive everywhere ("maria" finds "Maria").
 * SQLite's LIKE already is; on PostgreSQL we add `mode: "insensitive"` to every
 * contains / startsWith / endsWith filter, so call sites stay database-agnostic.
 */
function insensitive(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(insensitive);
  if (!node || typeof node !== "object" || node instanceof Date) return node;
  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) out[k] = insensitive(v);
  const isTextFilter = ["contains", "startsWith", "endsWith"].some((k) => typeof src[k] === "string");
  if (isTextFilter && !("mode" in src)) out.mode = "insensitive";
  return out;
}

function createClient(): PrismaClient {
  const base = new PrismaClient();
  if (!isPostgres) return base;
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const a = args as { where?: unknown } | undefined;
          if (a && typeof a === "object" && "where" in a && a.where) a.where = insensitive(a.where);
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
