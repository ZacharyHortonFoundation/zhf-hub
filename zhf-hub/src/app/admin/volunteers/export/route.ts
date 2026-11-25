import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getStaff } from "@/lib/auth";
import { HOLDS_SPOT } from "@/lib/volunteers";
import { toCsv } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const staff = await getStaff();
  if (!staff) return new NextResponse("Unauthorized", { status: 401 });
  const sp = req.nextUrl.searchParams;

  const where: Prisma.ContactWhereInput = { volunteerStatus: sp.get("status") || { not: "NONE" } };
  const and: Prisma.ContactWhereInput[] = [];
  const q = sp.get("q");
  if (q) and.push({ OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { email: { contains: q } }] });
  if (sp.get("skill")) and.push({ skills: { some: { skillId: sp.get("skill")! } } });
  if (sp.get("program")) and.push({ registrations: { some: { status: { in: HOLDS_SPOT }, shift: { opportunity: { programId: sp.get("program")! } } } } });
  if (and.length) where.AND = and;

  const contacts = await db.contact.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: {
      skills: { include: { skill: true } },
      badges: { include: { badge: true } },
      hours: { where: { status: "APPROVED" }, select: { hours: true } },
      applications: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const rows = contacts.map((c) => ({
    constituent_no: c.constituentNo,
    first_name: c.firstName,
    last_name: c.lastName,
    email: c.email,
    phone: c.phone,
    city: c.city,
    volunteer_status: c.volunteerStatus,
    applied_on: c.applications[0]?.createdAt.toISOString().slice(0, 10) ?? "",
    availability: c.applications[0]?.availability ?? "",
    approved_hours: Math.round(c.hours.reduce((a, h) => a + h.hours, 0) * 100) / 100,
    interests: c.skills.filter((s) => s.kind === "INTEREST").map((s) => s.skill.name).join("; "),
    experience: c.skills.filter((s) => s.kind === "EXPERIENCE").map((s) => s.skill.name).join("; "),
    badges: c.badges.map((b) => b.badge.name).join("; "),
    emergency_contact: c.emergencyContactName,
    emergency_phone: c.emergencyContactPhone,
    emergency_email: c.emergencyContactEmail,
  }));

  const csv = toCsv(rows, [
    "constituent_no", "first_name", "last_name", "email", "phone", "city", "volunteer_status", "applied_on", "availability",
    "approved_hours", "interests", "experience", "badges", "emergency_contact", "emergency_phone", "emergency_email",
  ]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zhf-volunteers-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
