import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { CalendarPlus, CheckCheck, Copy, ExternalLink, Pencil, UserPlus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, LinkButton, PageHeader, Progress, StatusBadge } from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/client-ui";
import { OpportunityForm } from "@/components/volunteer/opportunity-form";
import {
  addVolunteerToShift,
  deleteOpportunity,
  deleteShift,
  duplicateOpportunity,
  markShiftAttended,
  saveShift,
  setRegistrationStatus,
} from "../../actions";
import { OPP_STATUS_META, fmtHours, shiftFilled, shiftHours, shiftTimeLabel, summarizeOpportunity } from "@/lib/volunteers";
import { cn, fullName, pct, toLocalInput } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await db.opportunity.findUnique({ where: { id }, select: { title: true } });
  return { title: o?.title ?? "Opportunity" };
}

export default async function AdminOpportunityDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab === "details" ? "details" : "shifts";

  const opp = await db.opportunity.findUnique({
    where: { id },
    include: {
      program: true,
      skills: true,
      shifts: {
        orderBy: { startAt: "asc" },
        include: {
          registrations: {
            where: { status: { not: "CANCELED" } },
            orderBy: { createdAt: "asc" },
            include: { contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, type: true, orgName: true } } },
          },
        },
      },
    },
  });
  if (!opp) notFound();

  const now = new Date();
  const sum = summarizeOpportunity(opp, now);
  const meta = OPP_STATUS_META[sum.status];
  const [programs, skills, approved, hourRows] = await Promise.all([
    db.program.findMany({ orderBy: { name: "asc" } }),
    db.skill.findMany({ orderBy: { name: "asc" } }),
    db.contact.findMany({
      where: { volunteerStatus: "APPROVED" },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true, type: true, orgName: true },
    }),
    db.volunteerHour.findMany({ where: { shiftId: { in: opp.shifts.map((s) => s.id) } }, select: { shiftId: true, contactId: true, status: true, hours: true } }),
  ]);
  const hoursKey = new Map(hourRows.map((h) => [`${h.shiftId}:${h.contactId}`, h]));
  const totalApprovedHours = hourRows.filter((h) => h.status === "APPROVED").reduce((a, h) => a + h.hours, 0);

  return (
    <>
      <PageHeader
        title={opp.title}
        breadcrumbs={[
          { label: "Volunteers", href: "/admin/volunteers" },
          { label: "Opportunities", href: "/admin/volunteers/opportunities" },
          { label: opp.title },
        ]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {opp.program ? <span>{opp.program.name}</span> : null}
            <span>· {[opp.location, opp.city].filter(Boolean).join(", ")}</span>
          </span>
        }
        actions={
          <>
            {opp.status !== "DRAFT" ? (
              <LinkButton href={`/volunteer/opportunities/${opp.id}`} target="_blank" variant="outline" size="sm">
                <ExternalLink className="size-4" /> Public page
              </LinkButton>
            ) : null}
            <form action={duplicateOpportunity}>
              <input type="hidden" name="id" value={opp.id} />
              <SubmitButton variant="outline" size="sm" pendingText="Copying…">
                <Copy className="size-4" /> Duplicate
              </SubmitButton>
            </form>
            <form action={deleteOpportunity}>
              <input type="hidden" name="id" value={opp.id} />
              <ConfirmSubmit confirmText="Delete permanently?">Delete</ConfirmSubmit>
            </form>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-slate-500">Shifts</p>
          <p className="mt-1 text-2xl font-semibold">{opp.shifts.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">{sum.upcomingCount ? "Signed up (upcoming)" : "Signed up"}</p>
          <p className="mt-1 text-2xl font-semibold">
            {sum.filled}
            <span className="text-base font-normal text-slate-400"> / {sum.capacity}</span>
          </p>
          <Progress value={pct(sum.filled, sum.capacity)} className="mt-2" />
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Spots open</p>
          <p className="mt-1 text-2xl font-semibold">{sum.upcomingCount ? sum.remaining : "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Approved hours</p>
          <p className="mt-1 text-2xl font-semibold">{fmtHours(totalApprovedHours)}</p>
        </Card>
      </div>

      <div className="mb-5 inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {[
          { v: "shifts", label: "Shifts & rosters", icon: <Users className="size-4" /> },
          { v: "details", label: "Edit details", icon: <Pencil className="size-4" /> },
        ].map((t) => (
          <Link
            key={t.v}
            href={`/admin/volunteers/opportunities/${opp.id}${t.v === "details" ? "?tab=details" : ""}`}
            className={cn("flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium", tab === t.v ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100")}
          >
            {t.icon} {t.label}
          </Link>
        ))}
      </div>

      {tab === "details" ? (
        <div className="max-w-4xl">
          <OpportunityForm opp={opp} programs={programs} skills={skills} />
        </div>
      ) : (
        <div id="shifts" className="space-y-5">
          {opp.shifts.map((s) => {
            const filled = shiftFilled(s);
            const past = s.startAt <= now;
            const registeredIds = new Set(s.registrations.map((r) => r.contactId));
            const addable = approved.filter((a) => !registeredIds.has(a.id));
            const awaiting = s.registrations.filter((r) => r.status === "REGISTERED").length;
            return (
              <Card key={s.id} id={`shift-${s.id}`} className="scroll-mt-20">
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {s.name && s.name !== "Main shift" ? <span>{s.name} ·</span> : null}
                      <span>{format(s.startAt, "EEE, MMM d, yyyy")}</span>
                      <span className="font-normal text-slate-500">{shiftTimeLabel(s)}</span>
                      {past ? <Badge tone="gray">Past</Badge> : filled >= s.capacity ? <Badge tone="red">Full</Badge> : <Badge tone="green">Open</Badge>}
                    </span>
                  }
                  description={`${fmtHours(shiftHours(s))} · ${filled} of ${s.capacity} spots filled`}
                  action={
                    <div className="flex items-center gap-2">
                      {past && awaiting ? (
                        <form action={markShiftAttended}>
                          <input type="hidden" name="shiftId" value={s.id} />
                          <SubmitButton size="sm" variant="secondary" pendingText="Saving…">
                            <CheckCheck className="size-4" /> Mark all attended + hours
                          </SubmitButton>
                        </form>
                      ) : null}
                      <form action={deleteShift}>
                        <input type="hidden" name="shiftId" value={s.id} />
                        <ConfirmSubmit size="sm" confirmText="Delete shift?">Delete</ConfirmSubmit>
                      </form>
                    </div>
                  }
                />
                <div className="px-5 pt-3">
                  <Progress value={pct(filled, s.capacity)} tone={filled >= s.capacity ? "accent" : "brand"} />
                </div>

                <CardBody className="space-y-4">
                  {s.registrations.length ? (
                    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                      {s.registrations.map((r) => {
                        const h = hoursKey.get(`${s.id}:${r.contactId}`);
                        return (
                          <li key={r.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                            <Link href={`/admin/constituents/${r.contactId}`} className="flex min-w-0 flex-1 items-center gap-3">
                              <Avatar name={fullName(r.contact)} size="sm" />
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-slate-900 hover:text-brand-700">{fullName(r.contact)}</span>
                                <span className="block truncate text-xs text-slate-500">{r.contact.email ?? r.contact.phone ?? ""}</span>
                              </span>
                            </Link>
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge status={r.status} label={r.status === "NO_SHOW" ? "No-show" : undefined} />
                              {h ? <Badge tone={h.status === "APPROVED" ? "green" : h.status === "PENDING" ? "amber" : "red"}>{fmtHours(h.hours)} {h.status.toLowerCase()}</Badge> : null}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {r.status === "REGISTERED" ? (
                                <>
                                  {past ? (
                                    <form action={setRegistrationStatus}>
                                      <input type="hidden" name="registrationId" value={r.id} />
                                      <input type="hidden" name="status" value="ATTENDED" />
                                      <input type="hidden" name="withHours" value="on" />
                                      <SubmitButton size="xs" pendingText="…">Attended + hours</SubmitButton>
                                    </form>
                                  ) : null}
                                  <form action={setRegistrationStatus} className="flex gap-1.5">
                                    <input type="hidden" name="registrationId" value={r.id} />
                                    <SubmitButton size="xs" variant="outline" name="status" value="ATTENDED">
                                      Attended
                                    </SubmitButton>
                                    <SubmitButton size="xs" variant="outline" name="status" value="NO_SHOW">
                                      No-show
                                    </SubmitButton>
                                    <SubmitButton size="xs" variant="ghost" name="status" value="CANCELED">
                                      Remove
                                    </SubmitButton>
                                  </form>
                                </>
                              ) : (
                                <>
                                  {r.status === "ATTENDED" && !h ? (
                                    <form action={setRegistrationStatus}>
                                      <input type="hidden" name="registrationId" value={r.id} />
                                      <input type="hidden" name="status" value="ATTENDED" />
                                      <input type="hidden" name="withHours" value="on" />
                                      <SubmitButton size="xs" variant="secondary" pendingText="…">Create hours</SubmitButton>
                                    </form>
                                  ) : null}
                                  <form action={setRegistrationStatus}>
                                    <input type="hidden" name="registrationId" value={r.id} />
                                    <SubmitButton size="xs" variant="ghost" name="status" value="REGISTERED">
                                      Reset
                                    </SubmitButton>
                                  </form>
                                </>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-500">No one has signed up for this shift yet.</p>
                  )}

                  <div className="grid gap-4 lg:grid-cols-2">
                    <form action={addVolunteerToShift} className="flex items-end gap-2">
                      <input type="hidden" name="shiftId" value={s.id} />
                      <input type="hidden" name="opportunityId" value={opp.id} />
                      <Field label="Add a volunteer" className="flex-1">
                        <select
                          name="contactId"
                          defaultValue=""
                          className="block h-9 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
                        >
                          <option value="">Choose an approved volunteer…</option>
                          {addable.map((a) => (
                            <option key={a.id} value={a.id}>
                              {fullName(a)}
                              {a.email ? ` — ${a.email}` : ""}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <SubmitButton size="sm" variant="secondary" pendingText="Adding…">
                        <UserPlus className="size-4" /> Add
                      </SubmitButton>
                    </form>

                    <details className="group rounded-xl border border-slate-200 px-4 py-2 open:pb-4">
                      <summary className="cursor-pointer list-none text-sm font-medium text-brand-700">
                        <Pencil className="mr-1.5 inline size-3.5" /> Edit shift
                      </summary>
                      <form action={saveShift} className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="opportunityId" value={opp.id} />
                        <input type="hidden" name="shiftId" value={s.id} />
                        <Field label="Name">
                          <Input name="name" defaultValue={s.name} />
                        </Field>
                        <Field label="Capacity">
                          <Input type="number" name="capacity" min={1} defaultValue={s.capacity} />
                        </Field>
                        <Field label="Starts">
                          <Input type="datetime-local" name="startAt" defaultValue={toLocalInput(s.startAt)} />
                        </Field>
                        <Field label="Ends">
                          <Input type="datetime-local" name="endAt" defaultValue={toLocalInput(s.endAt)} />
                        </Field>
                        <div className="sm:col-span-2">
                          <SubmitButton size="sm" pendingText="Saving…">
                            Save shift
                          </SubmitButton>
                        </div>
                      </form>
                    </details>
                  </div>
                </CardBody>
              </Card>
            );
          })}

          {!opp.shifts.length ? (
            <Card>
              <EmptyState icon={<CalendarPlus className="size-6" />} title="No shifts yet" description="Add a shift below so volunteers can sign up." />
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Add a shift" description="Recurring opportunity? Add one shift per date." />
            <CardBody>
              <form action={saveShift} className="grid gap-4 sm:grid-cols-5 sm:items-end">
                <input type="hidden" name="opportunityId" value={opp.id} />
                <Field label="Name">
                  <Input name="name" placeholder="e.g. Morning" />
                </Field>
                <Field label="Starts" required>
                  <Input type="datetime-local" name="startAt" required />
                </Field>
                <Field label="Ends" required>
                  <Input type="datetime-local" name="endAt" required />
                </Field>
                <Field label="Volunteers needed" required>
                  <Input type="number" name="capacity" min={1} defaultValue={6} required />
                </Field>
                <SubmitButton pendingText="Adding…">
                  <CalendarPlus className="size-4" /> Add shift
                </SubmitButton>
              </form>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
