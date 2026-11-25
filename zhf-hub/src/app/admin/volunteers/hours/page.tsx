import Link from "next/link";
import { Check, Clock, Plus, X } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { Avatar, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Pagination, Select, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";
import { addHoursForVolunteer, approveHoursBulk, approveHoursOne, rejectHoursOne } from "../actions";
import { fmtHours } from "@/lib/volunteers";
import { cn, fmtDate, fullName, toDateInput } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Volunteer hours" };

const TABS = [
  { value: "PENDING", label: "Pending approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];
const PAGE_SIZE = 40;

export default async function HoursPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const status = TABS.some((t) => t.value === sp.status) ? sp.status! : "PENDING";
  const page = Math.max(1, Number(sp.page) || 1);
  const here = `/admin/volunteers/hours?status=${status}`;

  const [rows, total, counts, sumAgg, volunteers, opportunities] = await Promise.all([
    db.volunteerHour.findMany({
      where: { status },
      orderBy: status === "PENDING" ? { createdAt: "asc" } : { date: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true, type: true, orgName: true } },
        opportunity: { select: { id: true, title: true } },
        shift: { select: { name: true, startAt: true } },
      },
    }),
    db.volunteerHour.count({ where: { status } }),
    db.volunteerHour.groupBy({ by: ["status"], _count: true }),
    db.volunteerHour.aggregate({ where: { status }, _sum: { hours: true } }),
    db.contact.findMany({
      where: { volunteerStatus: { in: ["APPROVED", "PENDING", "INACTIVE"] } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, type: true, orgName: true },
    }),
    db.opportunity.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, title: true }, take: 100 }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <>
      <PageHeader
        title="Volunteer hours"
        description="Approve logged hours. Approving automatically awards hour badges and emails the volunteer."
        breadcrumbs={[{ label: "Volunteers", href: "/admin/volunteers" }, { label: "Hours" }]}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {TABS.map((t) => (
                <Link
                  key={t.value}
                  href={`/admin/volunteers/hours?status=${t.value}`}
                  className={cn("flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium", status === t.value ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100")}
                >
                  {t.label}
                  <span className={cn("rounded-full px-1.5 text-xs", status === t.value ? "bg-white/20" : "bg-slate-100 text-slate-500")}>{count(t.value)}</span>
                </Link>
              ))}
            </div>
            <span className="ml-auto text-sm text-slate-500">{fmtHours(sumAgg._sum.hours ?? 0)} total</span>
          </div>

          <Card>
            {rows.length ? (
              <form>
                {/* Disabled default button: pressing Enter in a reason box must not approve the first row */}
                <button type="submit" disabled hidden aria-hidden="true" />
                <input type="hidden" name="back" value={here} />
                <Table>
                  <THead>
                    <tr>
                      {status === "PENDING" ? <TH className="w-8" /> : null}
                      <TH>Volunteer</TH>
                      <TH>Activity</TH>
                      <TH>Date</TH>
                      <TH className="text-right">Hours</TH>
                      <TH>{status === "PENDING" ? "Review" : "Status"}</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {rows.map((h) => (
                      <TR key={h.id}>
                        {status === "PENDING" ? (
                          <TD>
                            <input type="checkbox" name="ids" value={h.id} className="size-4 accent-brand-600" aria-label="Select entry" />
                          </TD>
                        ) : null}
                        <TD>
                          <Link href={`/admin/constituents/${h.contactId}`} className="flex items-center gap-2.5">
                            <Avatar name={fullName(h.contact)} size="sm" />
                            <span className="font-medium text-slate-900 hover:text-brand-700">{fullName(h.contact)}</span>
                          </Link>
                        </TD>
                        <TD className="max-w-xs">
                          {h.opportunity ? (
                            <Link href={`/admin/volunteers/opportunities/${h.opportunity.id}`} className="text-slate-800 hover:text-brand-700">
                              {h.opportunity.title}
                            </Link>
                          ) : (
                            <span className="text-slate-500">Other</span>
                          )}
                          {h.description ? <p className="truncate text-xs text-slate-500">{h.description}</p> : null}
                        </TD>
                        <TD className="whitespace-nowrap">{fmtDate(h.date)}</TD>
                        <TD className="text-right font-medium">{fmtHours(h.hours)}</TD>
                        <TD>
                          {status === "PENDING" ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <SubmitButton formAction={approveHoursOne} name="id" value={h.id} size="xs" pendingText="…">
                                <Check className="size-3.5" /> Approve
                              </SubmitButton>
                              <input
                                name={`note-${h.id}`}
                                placeholder="Reason (optional)"
                                className="h-7 w-32 rounded-lg border border-slate-300 px-2 text-xs focus:border-brand-500 focus:outline-none"
                              />
                              <SubmitButton formAction={rejectHoursOne} name="id" value={h.id} size="xs" variant="danger-outline" pendingText="…">
                                <X className="size-3.5" /> Reject
                              </SubmitButton>
                            </div>
                          ) : (
                            <div>
                              <StatusBadge status={h.status} />
                              {h.reviewedBy ? <p className="mt-0.5 text-xs text-slate-500">by {h.reviewedBy}</p> : null}
                            </div>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
                {status === "PENDING" ? (
                  <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
                    <p className="text-xs text-slate-500">Tick entries, then approve them all at once.</p>
                    <SubmitButton formAction={approveHoursBulk} size="sm" pendingText="Approving…">
                      <Check className="size-4" /> Approve selected
                    </SubmitButton>
                  </div>
                ) : null}
              </form>
            ) : (
              <EmptyState
                icon={<Clock className="size-6" />}
                title={status === "PENDING" ? "No hours waiting for approval" : "No entries"}
                description={status === "PENDING" ? "When volunteers log hours in their portal they'll appear here." : undefined}
              />
            )}
            <Pagination page={page} pageCount={Math.ceil(total / PAGE_SIZE)} makeHref={(p) => `${here}&page=${p}`} />
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Add hours" description="Record time on a volunteer's behalf. Saved as approved." />
          <CardBody>
            <form action={addHoursForVolunteer} className="space-y-4">
              <input type="hidden" name="back" value={here} />
              <Field label="Volunteer" required>
                <Select name="contactId" defaultValue="" required>
                  <option value="">Choose…</option>
                  {volunteers.map((v) => (
                    <option key={v.id} value={v.id}>
                      {fullName(v)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Opportunity">
                <Select name="opportunityId" defaultValue="">
                  <option value="">Other / general</option>
                  {opportunities.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" required>
                  <Input type="date" name="date" defaultValue={toDateInput(new Date())} max={toDateInput(new Date())} required />
                </Field>
                <Field label="Hours" required>
                  <Input type="number" name="hours" step="0.25" min="0.25" max="24" required />
                </Field>
              </div>
              <Field label="Notes">
                <Input name="description" placeholder="What they did" />
              </Field>
              <SubmitButton className="w-full" pendingText="Saving…">
                <Plus className="size-4" /> Add approved hours
              </SubmitButton>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
