import Link from "next/link";
import { format } from "date-fns";
import { HandHeart, ShieldAlert, X } from "lucide-react";
import { db } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, LinkButton, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";
import { BadgeMedal } from "@/components/volunteer/badge-medal";
import { addHoursForVolunteer, awardBadge, recheckBadges, revokeBadge, setVolunteerStatus } from "@/app/admin/volunteers/actions";
import { fmtHours, shiftTimeLabel } from "@/lib/volunteers";
import { fmtDate, toDateInput } from "@/lib/utils";

const smallInput =
  "h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100";

/**
 * Volunteer section of the constituent profile (/admin/constituents/[id]).
 * Server component — embeds its own forms whose actions revalidate the profile.
 */
export async function VolunteerPanel({ contactId }: { contactId: string }) {
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    include: {
      applications: { orderBy: { createdAt: "desc" }, take: 1 },
      skills: { include: { skill: true } },
      badges: { include: { badge: true }, orderBy: { awardedAt: "desc" } },
    },
  });
  if (!contact) return null;

  const now = new Date();
  const back = `/admin/constituents/${contactId}`;
  const [upcoming, hours, recognition, opportunities, pastCount] = await Promise.all([
    db.registration.findMany({
      where: { contactId, status: "REGISTERED", shift: { startAt: { gte: now } } },
      include: { shift: { include: { opportunity: { select: { id: true, title: true } } } } },
      orderBy: { shift: { startAt: "asc" } },
      take: 5,
    }),
    db.volunteerHour.findMany({
      where: { contactId },
      include: { opportunity: { select: { title: true } } },
      orderBy: { date: "desc" },
    }),
    db.badge.findMany({ where: { kind: "RECOGNITION" }, orderBy: [{ tier: "asc" }, { name: "asc" }] }),
    db.opportunity.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, title: true }, take: 60 }),
    db.registration.count({ where: { contactId, status: "ATTENDED" } }),
  ]);

  const app = contact.applications[0];
  const approved = hours.filter((h) => h.status === "APPROVED").reduce((a, h) => a + h.hours, 0);
  const pending = hours.filter((h) => h.status === "PENDING").reduce((a, h) => a + h.hours, 0);
  const owned = new Set(contact.badges.map((b) => b.badgeId));
  const awardable = recognition.filter((b) => !owned.has(b.id));
  const interests = contact.skills.filter((s) => s.kind === "INTEREST");
  const experience = contact.skills.filter((s) => s.kind === "EXPERIENCE");
  const isVolunteer = contact.volunteerStatus !== "NONE" || hours.length > 0;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <HandHeart className="size-4 text-brand-500" /> Volunteering
          </span>
        }
        description={isVolunteer ? `${fmtHours(approved)} approved${pending ? ` · ${fmtHours(pending)} pending` : ""} · ${pastCount} shift${pastCount === 1 ? "" : "s"} attended` : "Not a volunteer yet."}
        action={
          <form action={setVolunteerStatus} className="flex items-center gap-2">
            <input type="hidden" name="contactId" value={contactId} />
            <input type="hidden" name="back" value={back} />
            <select name="status" defaultValue={contact.volunteerStatus} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs shadow-sm" aria-label="Volunteer status">
              <option value="NONE">Not a volunteer</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="INACTIVE">Inactive</option>
              <option value="REJECTED">Declined</option>
            </select>
            <SubmitButton size="xs" variant="outline" pendingText="…">
              Set
            </SubmitButton>
          </form>
        }
      />
      <CardBody className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={contact.volunteerStatus} label={contact.volunteerStatus === "NONE" ? "Not a volunteer" : undefined} />
          {app ? (
            <span className="text-xs text-slate-500">
              Applied {fmtDate(app.createdAt)} · application <StatusBadge status={app.status} />
            </span>
          ) : null}
          {app?.status === "PENDING" ? (
            <LinkButton href="/admin/volunteers/applications" size="xs" variant="secondary">
              Review application
            </LinkButton>
          ) : null}
        </div>

        {app || contact.emergencyContactName ? (
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {app?.motivation ? (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Why they volunteer</dt>
                <dd className="mt-1 italic text-slate-700">“{app.motivation}”</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Availability</dt>
              <dd className="mt-1 text-slate-800">{app?.availability ?? "—"}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <ShieldAlert className="size-3" /> Emergency contact
              </dt>
              <dd className="mt-1 text-slate-800">
                {contact.emergencyContactName ?? "—"}
                {contact.emergencyContactPhone ? ` · ${contact.emergencyContactPhone}` : ""}
                {contact.emergencyContactEmail ? <span className="block text-xs text-slate-500">{contact.emergencyContactEmail}</span> : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Interests</dt>
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
          </dl>
        ) : null}

        {/* Upcoming shifts */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Upcoming shifts</p>
          {upcoming.length ? (
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
              {upcoming.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <Link href={`/admin/volunteers/opportunities/${r.shift.opportunity.id}#shift-${r.shiftId}`} className="min-w-0 truncate font-medium text-slate-800 hover:text-brand-700">
                    {r.shift.opportunity.title}
                  </Link>
                  <span className="shrink-0 text-xs text-slate-500">
                    {format(r.shift.startAt, "MMM d")} · {shiftTimeLabel(r.shift)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No upcoming shifts.</p>
          )}
        </div>

        {/* Hours */}
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent hours</p>
            {hours.some((h) => h.status === "PENDING") ? (
              <Link href="/admin/volunteers/hours" className="text-xs font-medium text-brand-700 hover:underline">
                Review pending →
              </Link>
            ) : null}
          </div>
          {hours.length ? (
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
              {hours.slice(0, 6).map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-slate-800">{h.opportunity?.title ?? h.description ?? "Volunteer time"}</span>
                    <span className="text-xs text-slate-500">{fmtDate(h.date)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-medium text-slate-700">{fmtHours(h.hours)}</span>
                    <StatusBadge status={h.status} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No hours logged.</p>
          )}
          <details className="mt-3 rounded-xl border border-slate-200 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-brand-700">+ Log hours</summary>
            <form action={addHoursForVolunteer} className="mt-3 grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="contactId" value={contactId} />
              <input type="hidden" name="back" value={back} />
              <select name="opportunityId" defaultValue="" className={`${smallInput} sm:col-span-2`} aria-label="Opportunity">
                <option value="">Other / general</option>
                {opportunities.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
              <input type="date" name="date" defaultValue={toDateInput(now)} max={toDateInput(now)} className={smallInput} aria-label="Date" required />
              <input type="number" name="hours" step="0.25" min="0.25" max="24" placeholder="Hours" className={smallInput} aria-label="Hours" required />
              <input name="description" placeholder="Notes (optional)" className={`${smallInput} sm:col-span-2`} aria-label="Notes" />
              <div className="sm:col-span-2">
                <SubmitButton size="sm" pendingText="Saving…">
                  Add approved hours
                </SubmitButton>
              </div>
            </form>
          </details>
        </div>

        {/* Badges */}
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Badges</p>
            <form action={recheckBadges}>
              <input type="hidden" name="contactId" value={contactId} />
              <input type="hidden" name="back" value={back} />
              <button className="text-xs font-medium text-brand-700 hover:underline">Re-check hour badges</button>
            </form>
          </div>
          {contact.badges.length ? (
            <div className="mt-3 flex flex-wrap gap-3">
              {contact.badges.map((cb) => (
                <div key={cb.id} className="group relative">
                  <BadgeMedal name={cb.badge.name} tier={cb.badge.tier} kind={cb.badge.kind} size="sm" />
                  <form action={revokeBadge} className="absolute -right-1 -top-1 hidden group-hover:block">
                    <input type="hidden" name="id" value={cb.id} />
                    <input type="hidden" name="back" value={back} />
                    <button className="grid size-5 place-items-center rounded-full bg-white text-slate-400 shadow ring-1 ring-slate-200 hover:text-red-600" title="Remove badge" aria-label={`Remove ${cb.badge.name}`}>
                      <X className="size-3" />
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No badges yet.</p>
          )}
          {awardable.length ? (
            <form action={awardBadge} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="contactId" value={contactId} />
              <input type="hidden" name="back" value={back} />
              <select name="badgeId" defaultValue="" className={`${smallInput} min-w-48 flex-1`} aria-label="Recognition badge">
                <option value="">Award a recognition badge…</option>
                {awardable.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <input name="note" placeholder="Why? (optional)" className={`${smallInput} min-w-40 flex-1`} aria-label="Note" />
              <SubmitButton size="sm" variant="secondary" pendingText="…">
                Award
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
