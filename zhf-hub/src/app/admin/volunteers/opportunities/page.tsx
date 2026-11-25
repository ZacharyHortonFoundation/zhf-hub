import Link from "next/link";
import { ClipboardCheck, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Progress, Table, TD, TH, THead, TR } from "@/components/ui";
import { OPP_STATUS_META, opportunityWhen, shiftsWithSpots, summarizeOpportunity } from "@/lib/volunteers";
import { cn, pct } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Volunteer opportunities" };

const TABS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "draft", label: "Drafts & canceled" },
];

export default async function AdminOpportunities({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const tab = TABS.some((t) => t.value === sp.tab) ? sp.tab! : "upcoming";
  const now = new Date();

  const all = await db.opportunity.findMany({
    where: sp.q ? { OR: [{ title: { contains: sp.q } }, { city: { contains: sp.q } }] } : undefined,
    include: { program: true, shifts: shiftsWithSpots },
  });
  const rows = all.map((o) => ({ o, s: summarizeOpportunity(o, now) }));
  const buckets = {
    upcoming: rows.filter((r) => r.o.status === "PUBLISHED" && r.s.upcomingCount > 0).sort((a, b) => a.s.nextShift!.startAt.getTime() - b.s.nextShift!.startAt.getTime()),
    past: rows.filter((r) => r.o.status === "PUBLISHED" && r.s.upcomingCount === 0).sort((a, b) => (b.s.firstStart?.getTime() ?? 0) - (a.s.firstStart?.getTime() ?? 0)),
    draft: rows.filter((r) => r.o.status !== "PUBLISHED").sort((a, b) => b.o.createdAt.getTime() - a.o.createdAt.getTime()),
  };
  const list = buckets[tab as keyof typeof buckets];

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Volunteer opportunities, their shifts and how full they are."
        breadcrumbs={[{ label: "Volunteers", href: "/admin/volunteers" }, { label: "Opportunities" }]}
        actions={
          <LinkButton href="/admin/volunteers/opportunities/new">
            <Plus className="size-4" /> New opportunity
          </LinkButton>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={`/admin/volunteers/opportunities?tab=${t.value}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition",
                tab === t.value ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {t.label}
              <span className={cn("rounded-full px-1.5 text-xs", tab === t.value ? "bg-white/20" : "bg-slate-100 text-slate-500")}>
                {buckets[t.value as keyof typeof buckets].length}
              </span>
            </Link>
          ))}
        </div>
        <form action="/admin/volunteers/opportunities" className="ml-auto">
          <input type="hidden" name="tab" value={tab} />
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="Search…"
            className="h-10 w-56 rounded-xl border border-slate-300 bg-white px-3.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
        </form>
      </div>

      <Card>
        {list.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Opportunity</TH>
                <TH>When</TH>
                <TH>Program</TH>
                <TH className="text-center">Shifts</TH>
                <TH className="w-48">Filled</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <tbody>
              {list.map(({ o, s }) => {
                const when = opportunityWhen(o.shifts);
                const meta = OPP_STATUS_META[s.status];
                return (
                  <TR key={o.id}>
                    <TD>
                      <Link href={`/admin/volunteers/opportunities/${o.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {o.title}
                      </Link>
                      <p className="text-xs text-slate-500">{[o.location, o.city].filter(Boolean).join(", ")}</p>
                    </TD>
                    <TD>
                      <p className="whitespace-nowrap text-slate-800">{when.date}</p>
                      <p className="text-xs text-slate-500">{when.time}</p>
                    </TD>
                    <TD>{o.program?.name ?? <span className="text-slate-400">—</span>}</TD>
                    <TD className="text-center">{o.shifts.length}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Progress value={pct(s.filled, s.capacity)} tone={s.status === "FULL" ? "accent" : "brand"} />
                        <span className="whitespace-nowrap text-xs text-slate-600">
                          {s.filled}/{s.capacity}
                        </span>
                      </div>
                    </TD>
                    <TD>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState
            icon={<ClipboardCheck className="size-6" />}
            title={tab === "upcoming" ? "No upcoming opportunities" : "Nothing here"}
            description={tab === "upcoming" ? "Create an opportunity so volunteers can sign up." : undefined}
            action={
              tab === "upcoming" ? (
                <LinkButton href="/admin/volunteers/opportunities/new" size="sm">
                  <Plus className="size-4" /> New opportunity
                </LinkButton>
              ) : undefined
            }
          />
        )}
      </Card>
    </>
  );
}
