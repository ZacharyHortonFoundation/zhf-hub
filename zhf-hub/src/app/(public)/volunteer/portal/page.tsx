import Link from "next/link";
import { format } from "date-fns";
import { Award, CalendarCheck, CalendarDays, Clock, LogOut, MapPin, Search, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { endVolunteerSession, requireVolunteer } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Badge, Card, CardBody, CardHeader, Field, Input, LinkButton, Notice, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";
import { LogHoursForm } from "@/components/volunteer/log-hours-form";
import { BadgeMedal } from "@/components/volunteer/badge-medal";
import { cancelShift, logHours, updateVolunteerProfile, volunteerLogout } from "../actions";
import { fmtHours, shiftHours, shiftTimeLabel, startOfYear } from "@/lib/volunteers";
import { fmtDate, toDateInput } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "My volunteer portal" };

export default async function PortalPage() {
  const session = await requireVolunteer();
  const contact = await db.contact.findUnique({
    where: { id: session.contactId },
    include: {
      skills: { include: { skill: true } },
      badges: { include: { badge: true }, orderBy: { awardedAt: "desc" } },
      applications: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!contact) {
    await endVolunteerSession();
    redirect("/volunteer/login");
  }

  const now = new Date();
  const [registrations, hours, allBadges, skills] = await Promise.all([
    db.registration.findMany({
      where: { contactId: contact.id, status: { not: "CANCELED" } },
      include: { shift: { include: { opportunity: true } } },
      orderBy: { shift: { startAt: "asc" } },
    }),
    db.volunteerHour.findMany({
      where: { contactId: contact.id },
      include: { opportunity: { select: { title: true } } },
      orderBy: { date: "desc" },
    }),
    db.badge.findMany({ orderBy: [{ kind: "asc" }, { hoursThreshold: "asc" }, { name: "asc" }] }),
    db.skill.findMany({ orderBy: { name: "asc" } }),
  ]);

  const upcoming = registrations.filter((r) => r.shift.startAt > now && r.status === "REGISTERED");
  const loggedShiftIds = new Set(hours.filter((h) => h.status !== "REJECTED" && h.shiftId).map((h) => h.shiftId!));
  const loggable = registrations
    .filter((r) => r.shift.startAt <= now && r.status !== "NO_SHOW" && !loggedShiftIds.has(r.shiftId))
    .reverse()
    .map((r) => ({
      id: r.shiftId,
      label: `${r.shift.opportunity.title} — ${format(r.shift.startAt, "MMM d, yyyy")}`,
      hours: shiftHours(r.shift),
      date: toDateInput(r.shift.startAt),
    }));
  const approved = hours.filter((h) => h.status === "APPROVED");
  const lifetime = approved.reduce((a, h) => a + h.hours, 0);
  const thisYear = approved.filter((h) => h.date >= startOfYear(now)).reduce((a, h) => a + h.hours, 0);
  const pendingHours = hours.filter((h) => h.status === "PENDING").reduce((a, h) => a + h.hours, 0);
  const earnedIds = new Set(contact.badges.map((b) => b.badgeId));
  const hourBadges = allBadges.filter((b) => b.kind === "HOURS");
  const nextBadge = hourBadges.find((b) => !earnedIds.has(b.id) && (b.hoursThreshold ?? 0) > lifetime);
  const recognition = allBadges.filter((b) => b.kind !== "HOURS");
  const interests = new Set(contact.skills.filter((s) => s.kind === "INTEREST").map((s) => s.skillId));
  const status = contact.volunteerStatus;
  const app = contact.applications[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-500">Volunteer portal</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-900">Hi, {contact.firstName || "friend"} 👋</h1>
          <p className="mt-1 text-slate-600">Thank you for showing up for our community.</p>
        </div>
        <div className="flex gap-2">
          <LinkButton href="/volunteer/opportunities" className="rounded-full">
            <Search className="size-4" /> Find opportunities
          </LinkButton>
          <form action={volunteerLogout}>
            <SubmitButton variant="outline" className="rounded-full">
              <LogOut className="size-4" /> Sign out
            </SubmitButton>
          </form>
        </div>
      </div>

      {status === "PENDING" ? (
        <Notice tone="amber" className="mt-6">
          <span className="font-semibold">Your application is under review.</span> We received it on {fmtDate(app?.createdAt ?? contact.createdAt)}. Our volunteer
          coordinator will be in touch soon — once you&apos;re approved you can sign up for shifts right here.
        </Notice>
      ) : status === "REJECTED" ? (
        <Notice tone="red" className="mt-6">
          <span className="font-semibold">Your application wasn&apos;t approved.</span> {app?.reviewNotes ?? ""} Questions? Please contact our volunteer coordinator.
        </Notice>
      ) : status === "INACTIVE" ? (
        <Notice className="mt-6">Your volunteer profile is currently inactive. Contact us to reactivate it.</Notice>
      ) : status === "APPROVED" ? (
        <Notice tone="green" className="mt-6">
          <span className="font-semibold">You&apos;re an approved ZHF volunteer.</span> Browse opportunities and sign up for any open shift.
        </Notice>
      ) : null}

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { icon: <Clock className="size-5" />, label: `Hours in ${now.getFullYear()}`, value: Math.round(thisYear * 10) / 10 },
          { icon: <Sparkles className="size-5" />, label: "Lifetime hours", value: Math.round(lifetime * 10) / 10 },
          { icon: <CalendarCheck className="size-5" />, label: "Upcoming shifts", value: upcoming.length },
          { icon: <Award className="size-5" />, label: "Badges earned", value: contact.badges.length },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-sand bg-white p-5 shadow-sm">
            <span className="text-brand-500">{s.icon}</span>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>
      {pendingHours > 0 ? <p className="mt-2 text-sm text-slate-500">+ {fmtHours(pendingHours)} waiting for approval</p> : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          {/* Upcoming */}
          <Card className="rounded-3xl border-sand">
            <CardHeader title="Your upcoming shifts" description="Can't make it? Cancel so someone else can take your spot." />
            <CardBody className="p-0">
              {upcoming.length ? (
                <ul className="divide-y divide-slate-100">
                  {upcoming.map((r) => (
                    <li key={r.id} className="flex items-center gap-4 px-5 py-4">
                      <div className="grid w-14 shrink-0 place-items-center rounded-xl bg-brand-50 py-2 text-center">
                        <p className="text-[10px] font-semibold uppercase text-brand-500">{format(r.shift.startAt, "MMM")}</p>
                        <p className="text-lg font-semibold leading-none text-slate-900">{format(r.shift.startAt, "d")}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link href={`/volunteer/opportunities/${r.shift.opportunityId}`} className="font-medium text-slate-900 hover:text-brand-700">
                          {r.shift.opportunity.title}
                        </Link>
                        <p className="flex flex-wrap items-center gap-x-3 text-sm text-slate-500">
                          <span className="flex items-center gap-1"><CalendarDays className="size-3.5" />{format(r.shift.startAt, "EEE")} · {shiftTimeLabel(r.shift)}</span>
                          <span className="flex items-center gap-1"><MapPin className="size-3.5" />{r.shift.opportunity.location ?? r.shift.opportunity.city}</span>
                        </p>
                      </div>
                      <form action={cancelShift}>
                        <input type="hidden" name="shiftId" value={r.shiftId} />
                        <input type="hidden" name="back" value="/volunteer/portal" />
                        <SubmitButton variant="ghost" size="sm" pendingText="…">
                          Cancel
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-5 py-10 text-center">
                  <p className="font-medium text-slate-900">No upcoming shifts</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {status === "APPROVED" ? "Find something that fits your schedule." : "You'll be able to sign up once your application is approved."}
                  </p>
                  <LinkButton href="/volunteer/opportunities" variant="secondary" size="sm" className="mt-4 rounded-full">
                    Browse opportunities
                  </LinkButton>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Log hours */}
          <Card className="rounded-3xl border-sand" id="log-hours">
            <CardHeader title="Log your hours" description="Hours are reviewed by our coordinator, then count toward your badges." />
            <CardBody>
              <LogHoursForm options={loggable} action={logHours} today={toDateInput(now)} />
            </CardBody>
          </Card>

          {/* History */}
          <Card className="rounded-3xl border-sand">
            <CardHeader title="Hours history" description={`${fmtHours(lifetime)} approved all-time`} />
            <CardBody className="p-0">
              {hours.length ? (
                <ul className="divide-y divide-slate-100">
                  {hours.slice(0, 15).map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-800">{h.opportunity?.title ?? h.description ?? "Volunteer time"}</p>
                        <p className="text-slate-500">{fmtDate(h.date)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-medium text-slate-700">{fmtHours(h.hours)}</span>
                        <StatusBadge status={h.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-8 text-center text-sm text-slate-500">No hours logged yet.</p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Badges */}
          <Card className="rounded-3xl border-sand">
            <CardHeader
              title="Your badges"
              description={nextBadge ? `${Math.max(0, Math.round(((nextBadge.hoursThreshold ?? 0) - lifetime) * 10) / 10)} more hours to earn “${nextBadge.name}”` : "You've earned every hours badge — amazing!"}
            />
            <CardBody>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hour milestones</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {hourBadges.map((b) => (
                  <BadgeMedal
                    key={b.id}
                    name={b.name}
                    tier={b.tier}
                    kind={b.kind}
                    earned={earnedIds.has(b.id)}
                    progress={b.hoursThreshold ? (lifetime / b.hoursThreshold) * 100 : undefined}
                  />
                ))}
              </div>
              <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Recognition</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {recognition.filter((b) => earnedIds.has(b.id)).map((b) => (
                  <BadgeMedal key={b.id} name={b.name} tier={b.tier} kind={b.kind} />
                ))}
                {!recognition.some((b) => earnedIds.has(b.id)) ? (
                  <p className="text-sm text-slate-500">Recognition badges are awarded by our team for going above and beyond.</p>
                ) : null}
              </div>
            </CardBody>
          </Card>

          {/* Profile */}
          <Card className="rounded-3xl border-sand">
            <CardHeader title="Your profile" description={contact.email ?? undefined} />
            <CardBody>
              <form action={updateVolunteerProfile} className="space-y-4">
                <Field label="Phone">
                  <Input name="phone" type="tel" defaultValue={contact.phone ?? ""} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Emergency contact">
                    <Input name="emergencyName" defaultValue={contact.emergencyContactName ?? ""} />
                  </Field>
                  <Field label="Emergency phone">
                    <Input name="emergencyPhone" type="tel" defaultValue={contact.emergencyContactPhone ?? ""} />
                  </Field>
                </div>
                <Field label="Emergency email">
                  <Input name="emergencyEmail" type="email" defaultValue={contact.emergencyContactEmail ?? ""} />
                </Field>
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">I&apos;m interested in</p>
                  <div className="flex flex-wrap gap-2">
                    {skills.map((s) => (
                      <label
                        key={s.id}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800"
                      >
                        <input type="checkbox" name="interest" value={s.id} defaultChecked={interests.has(s.id)} className="size-3.5 accent-brand-600" />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
                <SubmitButton variant="secondary" pendingText="Saving…" className="rounded-full">
                  Save profile
                </SubmitButton>
              </form>
            </CardBody>
          </Card>

          {contact.skills.some((s) => s.kind === "EXPERIENCE") ? (
            <div className="rounded-2xl bg-sand/70 p-5 text-sm">
              <p className="font-semibold text-slate-900">Experience on file</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {contact.skills.filter((s) => s.kind === "EXPERIENCE").map((s) => (
                  <Badge key={s.skillId} tone="blue">{s.skill.name}</Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
