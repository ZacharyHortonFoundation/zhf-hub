import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getStaff } from "@/lib/auth";
import { buildDonationWhere } from "@/lib/queries";
import { toCsv } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const staff = await getStaff();
  if (!staff || staff.role === "COORDINATOR") return new NextResponse("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const rows = await db.donation.findMany({
    where: buildDonationWhere(sp),
    orderBy: { receivedAt: "desc" },
    include: { contact: true, campaign: true, fund: true },
  });
  const csv = toCsv(
    rows.map((d) => ({
      receipt_no: d.number,
      date: d.receivedAt.toISOString().slice(0, 10),
      constituent_no: d.contact.constituentNo,
      first_name: d.contact.firstName,
      last_name: d.contact.lastName,
      organization: d.contact.orgName,
      email: d.contact.email,
      amount: (d.amountCents / 100).toFixed(2),
      fee_covered: (d.feeCoveredCents / 100).toFixed(2),
      total_charged: (d.totalCents / 100).toFixed(2),
      frequency: d.frequency,
      method: d.method,
      check_no: d.checkNumber,
      status: d.status,
      source: d.source,
      campaign: d.campaign?.name,
      fund: d.fund?.name,
      anonymous: d.anonymous ? "yes" : "",
      dedication: d.dedicationName ? `${d.dedicationType} ${d.dedicationName}` : "",
      employer_match: d.matchingEmployer,
      test: d.isTest ? "yes" : "",
      comments: d.comments,
    })),
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zhf-donations-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
