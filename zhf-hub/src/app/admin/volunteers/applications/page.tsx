import Link from "next/link";
import { Check, Mail, Phone, ShieldAlert, UserPlus, X } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { Avatar, Badge, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";
import { reviewApplication } from "../actions";
import { cn, fmtDate, fmtDateTime, fullName } from "@/lib/utils";
import { canSeeVolunteerPrivate } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Volunteer applications" };

const TABS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Declined" },
];

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const staff = await requireStaff();
  const showPrivate = canSeeVolunteerPrivate(staff.role);
  const sp = await searchParams;
  const status = TABS.some((t) => t.value === sp.status) ? sp.status! : "PENDING";

  const [apps, counts] = await Promise.all([
    db.volunteerApplication.findMany({
      where: { status },
      orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" },
      take: 100,
      // Private fields are not even loaded for roles that may not see them.
      omit: { motivation: !showPrivate },
      include: {
        contact: {
          omit: {
            portalPasswordHash: true,
            emergencyContactName: !showPrivate,
            emergencyContactPhone: !showPrivate,
            emergencyContactEmail: !showPrivate,
          },
          include: { skills: { include: { skill: true } } },
        },
      },
    }),
    db.volunteerApplication.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const here = `/admin/volunteers/applications?status=${status}`;

  return (
    <>
      <PageHeader
        title="Volunteer applications"
        description="Review new applicants. Approving sends a welcome email and lets them sign up for shifts."
        breadcrumbs={[{ label: "Volunteers", href: "/admin/volunteers" }, { label: "Applications" }]}
      />

      <div className="mb-5 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:inline-flex">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/admin/volunteers/applications?status=${t.value}`}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition sm:flex-none",
              status === t.value ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {t.label}
            <span className={cn("rounded-full px-1.5 text-xs", status === t.value ? "bg-white/20" : "bg-slate-100 text-slate-500")}>{count(t.value)}</span>
          </Link>
        ))}
      </div>

      {apps.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UserPlus className="size-6" />}
            title={status === "PENDING" ? "No applications waiting" : "Nothing here yet"}
            description={status === "PENDING" ? "New applications from the volunteer page will show up here." : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {apps.map((a) => {
            const c = a.contact;
            const interests = c.skills.filter((s) => s.kind === "INTEREST");
            const experience = c.skills.filter((s) => s.kind === "EXPERIENCE");
            return (
              <Card key={a.id} className="overflow-hidden">
                <div className="grid gap-6 p-5 lg:grid-cols-[1fr_320px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <Avatar name={fullName(c)} />
                      <div className="min-w-0">
                        <Link href={`/admin/constituents/${c.id}`} className="font-semibold text-slate-900 hover:text-brand-700">
                          {fullName(c)}
                        </Link>
                        <p className="text-xs text-slate-500">Applied {fmtDateTime(a.createdAt)}</p>
                      </div>
                      <StatusBadge status={a.status} label={a.status === "REJECTED" ? "Declined" : undefined} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                      {c.email ? (
                        <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 hover:text-brand-700">
                          <Mail className="size-3.5" /> {c.email}
                        </a>
                      ) : null}
                      {c.phone ? (
                        <span className="flex items-center gap-1.5">
                          <Phone className="size-3.5" /> {c.phone}
                        </span>
                      ) : null}
                      {c.city ? <span>{c.city}</span> : null}
                    </div>
                    {a.motivation && showPrivate ? (
                      <blockquote className="mt-4 rounded-xl border-l-4 border-brand-200 bg-brand-50/60 px-4 py-3 text-sm italic text-slate-700">“{a.motivation}”</blockquote>
                    ) : null}
                    <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Interested in</dt>
                        <dd className="mt-1 flex flex-wrap gap-1">
                          {interests.length ? interests.map((s) => <Badge key={s.skillId} tone="blue">{s.skill.name}</Badge>) : <span className="text-slate-400">—</span>}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Experience</dt>
                        <dd className="mt-1 flex flex-wrap gap-1">
                          {experience.length ? experience.map((s) => <Badge key={s.skillId} tone="teal">{s.skill.name}</Badge>) : <span className="text-slate-400">—</span>}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Availability</dt>
                        <dd className="mt-1 text-slate-800">{a.availability ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                          <ShieldAlert className="size-3" /> Emergency contact
                        </dt>
                        <dd className="mt-1 text-slate-800">
                          {showPrivate ? (
                            <>
                              {c.emergencyContactName ?? "—"}
                              {c.emergencyContactPhone ? ` · ${c.emergencyContactPhone}` : ""}
                              {c.emergencyContactEmail ? <span className="block text-xs text-slate-500">{c.emergencyContactEmail}</span> : null}
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">Visible to administrators and volunteer coordinators</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Confirmations</dt>
                        <dd className="mt-1 text-slate-800">
                          {a.over18 ? "18+" : "Under 18"} · {a.agreedWaiver ? "Waiver agreed" : "No waiver"}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    {a.status === "PENDING" ? (
                      <form action={reviewApplication} className="space-y-3">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="back" value={here} />
                        <label className="block text-sm font-medium text-slate-700" htmlFor={`note-${a.id}`}>
                          Note to applicant <span className="font-normal text-slate-400">(optional, included in the email)</span>
                        </label>
                        <textarea
                          id={`note-${a.id}`}
                          name="note"
                          rows={3}
                          className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
                          placeholder="e.g. We'd love to see you at the Dec 5 outreach!"
                        />
                        <div className="flex gap-2">
                          <SubmitButton name="decision" value="APPROVED" className="flex-1" pendingText="Saving…">
                            <Check className="size-4" /> Approve
                          </SubmitButton>
                          <SubmitButton name="decision" value="REJECTED" variant="danger-outline" className="flex-1" pendingText="Saving…">
                            <X className="size-4" /> Decline
                          </SubmitButton>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-2 text-sm">
                        <p className="font-medium text-slate-800">
                          {a.status === "APPROVED" ? "Approved" : "Declined"} {a.reviewedAt ? `on ${fmtDate(a.reviewedAt)}` : ""}
                        </p>
                        {a.reviewedBy ? <p className="text-slate-500">by {a.reviewedBy}</p> : null}
                        {a.reviewNotes ? <p className="rounded-lg bg-white p-3 text-slate-700">{a.reviewNotes}</p> : null}
                        <p className="text-xs text-slate-500">
                          Current volunteer status: <StatusBadge status={c.volunteerStatus} />
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
