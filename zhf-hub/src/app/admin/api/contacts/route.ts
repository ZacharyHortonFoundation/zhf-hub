import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getStaff } from "@/lib/auth";
import { buildContactWhere } from "@/lib/queries";
import { fullName } from "@/lib/utils";

/** Typeahead search used by <ContactPicker>. */
export async function GET(req: NextRequest) {
  if (!(await getStaff())) return NextResponse.json([], { status: 401 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json([]);
  const rows = await db.contact.findMany({ where: buildContactWhere({ q }), take: 8, orderBy: { lifetimeCents: "desc" } });
  return NextResponse.json(rows.map((c) => ({ id: c.id, name: fullName(c), email: c.email, no: c.constituentNo })));
}
