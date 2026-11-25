import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getStaff } from "@/lib/auth";
import { buildContactWhere } from "@/lib/queries";
import { toCsv } from "@/lib/utils";

export async function GET(req: NextRequest) {
  if (!(await getStaff())) return new NextResponse("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const rows = await db.contact.findMany({ where: buildContactWhere(sp), orderBy: [{ lastName: "asc" }], include: { tags: true } });
  const csv = toCsv(
    rows.map((c) => ({
      constituent_no: c.constituentNo,
      type: c.type,
      first_name: c.firstName,
      last_name: c.lastName,
      spouse_first_name: c.spouseFirstName,
      spouse_last_name: c.spouseLastName,
      organization: c.orgName,
      email: c.email,
      phone: c.phone,
      address: c.address1,
      city: c.city,
      state: c.state,
      zip: c.zip,
      donor_level: c.donorLevel,
      lifetime_giving: (c.lifetimeCents / 100).toFixed(2),
      gift_count: c.giftCount,
      largest_gift: (c.largestCents / 100).toFixed(2),
      first_gift: c.firstGiftAt?.toISOString().slice(0, 10) ?? "",
      last_gift: c.lastGiftAt?.toISOString().slice(0, 10) ?? "",
      volunteer_status: c.volunteerStatus,
      vip: c.isVip ? "yes" : "",
      do_not_email: c.doNotEmail ? "yes" : "",
      tags: c.tags.map((t) => t.name).join("; "),
      created: c.createdAt.toISOString().slice(0, 10),
    })),
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zhf-constituents-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
