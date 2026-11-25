import { db } from "./db";
import type { Prisma } from "@prisma/client";

const STARTS: Record<string, number> = { donation: 10001, order: 5001, constituent: 1001 };

/** Atomically get the next sequential number (receipt #, order #, constituent #). */
export async function nextNumber(name: "donation" | "order" | "constituent", tx?: Prisma.TransactionClient) {
  const client = tx ?? db;
  const row = await client.counter.upsert({
    where: { name },
    create: { name, value: STARTS[name] },
    update: { value: { increment: 1 } },
  });
  return row.value;
}
