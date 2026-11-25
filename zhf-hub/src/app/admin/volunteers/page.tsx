import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Clock, Download, HandHeart, Settings2, UserPlus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { Avatar, Badge, Card, EmptyState, LinkButton, PageHeader, Pagination, Stat, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { AutoSubmitSelect } from "@/components/client-ui";
import { HOLDS_SPOT, fmtHours, hoursSince, startOfYear } from "@/lib/volunteers";
import { fmtDate, fullName, pct } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Volunteers" };

const PAGE_SIZE = 25;

type SP = { q?: string; status?: string; skill?: string; program?: string; page?: string };

export default async function VolunteersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const now = new Date();
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.ContactWhereInput = { volunteerStatus: sp.status ? sp.status : { not: "NONE" } };
  const and: Prisma.ContactWhereInput[] = [];
  if (sp.q) {
    and.push({ OR: [{ firstName: { contains: sp.q } }, { lastName: { contains: sp.q } }, { email: { contains: sp.q } }, { phone: { contains: sp.q } }] });
  }
  if (sp.skill) and.push({ skills: { some: { skillId: sp.skill } } });
  if (sp.program) and.push({ registrations: { some: { status: { in: HOLDS_SPOT }, shift: { opportunity: { programId: sp.program } } } } });
  if (and.length) where.AND = and;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [total, volunteers, active, pendingApps, hoursMonth, hoursYear, upcomingShifts, skills, programs] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        skills: { where: { kind: "INTEREST" }, include: { skill: true }, take: 3 },
        _count: { select: { badges: true } },
      },
    }),
    db.contact.count({ where: { volunteerStatus: "APPROVED" } }),
    db.volunteerApplication.count({ where: { status: "PENDING" } }),
    hoursSince(monthStart),
    hoursSince(startOfYear(now)),
    db.shift.findMany({
      where: { startAt: { gte: now }, opportunity: { status: "PUBLISHED" } },
      select: { capacity: true, _count: { select: { registrations: { where: { status: { in: HOLDS_SPOT } } } } } },
    }),
    db.skill.findMany({ orderBy: { name: "asc" } }),
    db.program.findMany({ orderBy: { name: "asc" } }),
  ]);

  const ids = volunteers.map((v) => v.id);
  const [hourTotals, lastShifts] = await Promise.all([
    db.volunteerHour.groupBy({ by: ["contactId"], where: { contactId: { in: ids }, status: "APPROVED" }, _sum: { hours: true } }),
    db.registration.findMany({
      where: { contactId: { in: ids }, status: { in: HOLDS_SPOT }, shift: { startAt: { lte: now } } },
      select: { contactId: true, shift: { select: { startAt: true } } },
    }),
  ]);
  const hoursBy = new Map(hourTotals.map((h) => [h.contactId, h._sum.hours ?? 0]));
  const lastBy = new Map<string, Date>();
  for (const r of lastShifts) {
    const cur = lastBy.get(r.contactId);
    if (!cur || r.shift.startAt > cur) lastBy.set(r.contactId, r.shift.startAt);
  }
  const cap = upcomingShifts.reduce((a, s) => a + s.capacity, 0);
  const filled = upcomingShifts.reduce((a, s) => a + s._count.registrations, 0);

  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, String(v));
    return `/admin/volunteers?${p.toString()}`;
  };
  const exportQs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Volunteers"
        description="Your volunteer roster, hours and recognition."
        actions={
          <>
            <LinkButton href="/admin/volunteers/setup" variant="outline">
              <Settings2 className="size-4" /> Programs, skills & badges
            </LinkButton>
            <LinkButton href={`/admin/volunteers/export${exportQs ? `?${exportQs}` : ""}`} variant="outline" prefetch={false}>
              <Download className="size-4" /> Export CSV
            </LinkButton>
            <LinkButton href="/admin/volunteers/opportunities/new">
              <HandHeart className="size-4" /> New opportunity
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active volunteers" value={active} icon={<Users className="size-5" />} hint="approved & ready to serve" href="/admin/volunteers?status=APPROVED" />
        <Stat label="Pending applications" value={pendingApps} icon={<UserPlus className="size-5" />} hint={pendingApps ? "waiting for review" : "all caught up"} href="/admin/volunteers/applications" />
        <Stat label="Hours this month" value={hoursMonth} icon={<Clock className="size-5" />} hint={`${hoursYear} hrs this year`} href="/admin/volunteers/hours?status=APPROVED" />
        <Stat label="Upcoming shift fill rate" value={`${pct(filled, cap)}%`} icon={<HandHeart className="size-5" />} hint={`${filled} of ${cap} spots filled`} href="/admin/volunteers/opportunities" />
      </div>

      <Card className="mt-6">
        <form className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4" action="/admin/volunteers">
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="Search name, email or phone…"
            className="h-10 min-w-56 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
          <AutoSubmitSelect name="status" defaultValue={sp.status ?? ""} aria-label="Status">
            <option value="">All statuses</option>
            <option value="APPROVED">Approved</option>
            <option value="PENDING">Pending</option>
            <option value="INACTIVE">Inactive</option>
            <option value="REJECTED">Rejected</option>
          </AutoSubmitSelect>
          <AutoSubmitSelect name="skill" defaultValue={sp.skill ?? ""} aria-label="Skill">
            <option value="">Any skill</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </AutoSubmitSelect>
          <AutoSubmitSelect name="program" defaultValue={sp.program ?? ""} aria-label="Program served">
            <option value="">Any program served</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </AutoSubmitSelect>
          {sp.q || sp.status || sp.skill || sp.program ? (
            <Link href="/admin/volunteers" className="text-sm text-brand-700 hover:underline">
              Clear
            </Link>
          ) : null}
          <span className="ml-auto text-sm text-slate-500">{total} volunteers</span>
        </form>

        {volunteers.length ? (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Volunteer</TH>
                  <TH>Status</TH>
                  <TH>Interests</TH>
                  <TH className="text-right">Approved hours</TH>
                  <TH>Last shift</TH>
                  <TH className="text-right">Badges</TH>
                </tr>
              </THead>
              <tbody>
                {volunteers.map((v) => (
                  <TR key={v.id}>
                    <TD>
                      <Link href={`/admin/constituents/${v.id}`} className="flex items-center gap-3">
                        <Avatar name={fullName(v)} size="sm" />
                        <span>
                          <span className="block font-medium text-slate-900 hover:text-brand-700">{fullName(v)}</span>
                          <span className="block text-xs text-slate-500">{v.email ?? v.phone ?? "—"}</span>
                        </span>
                      </Link>
                    </TD>
                    <TD>
                      <StatusBadge status={v.volunteerStatus} />
                    </TD>
                    <TD>
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {v.skills.map((s) => (
                          <Badge key={s.skillId} tone="blue">
                            {s.skill.name}
                          </Badge>
                        ))}
                        {!v.skills.length ? <span className="text-slate-400">—</span> : null}
                      </div>
                    </TD>
                    <TD className="text-right font-medium">{fmtHours(hoursBy.get(v.id) ?? 0)}</TD>
                    <TD>{lastBy.get(v.id) ? fmtDate(lastBy.get(v.id)) : <span className="text-slate-400">Never</span>}</TD>
                    <TD className="text-right">{v._count.badges || <span className="text-slate-400">0</span>}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageCount={Math.ceil(total / PAGE_SIZE)} makeHref={(p) => qs({ page: String(p) })} />
          </>
        ) : (
          <EmptyState icon={<Users className="size-6" />} title="No volunteers match" description="Try a different search or filter." />
        )}
      </Card>
    </>
  );
}
