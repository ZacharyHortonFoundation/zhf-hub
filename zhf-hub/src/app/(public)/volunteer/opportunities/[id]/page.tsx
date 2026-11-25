import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Accessibility, CalendarDays, Clock, Mail, MapPin, Navigation, Phone, ShieldCheck, User, Users } from "lucide-react";
import { db } from "@/lib/db";
import { getVolunteer } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { Badge, LinkButton, Notice, Progress } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";
import {
  OPP_STATUS_META,
  PROGRAM_COLORS,
  SETTING_LABEL,
  fmtHours,
  mapsUrl,
  opportunityWhen,
  shiftFilled,
  shiftHours,
  shiftState,
  shiftTimeLabel,
  shiftsWithSpots,
  summarizeOpportunity,
} from "@/lib/volunteers";
import { cancelShift, signUpForShift } from "../../actions";
import { cn, fmtDate, pct } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await db.opportunity.findUnique({ where: { id }, select: { title: true } });
  return { title: o?.title ?? "Opportunity" };
}

export default async function OpportunityDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const opp = await db.opportunity.findUnique({
    where: { id },
    include: { program: true, skills: { orderBy: { name: "asc" } }, shifts: shiftsWithSpots },
  });
  if (!opp || opp.status === "DRAFT") notFound();

  const now = new Date();
  const [vol, settings] = await Promise.all([getVolunteer(), getSettings()]);
  const contact = vol ? await db.contact.findUnique({ where: { id: vol.contactId }, select: { id: true, volunteerStatus: true } }) : null;
  const canSignUp = !!contact && (!settings.requireApprovalForSignup || contact.volunteerStatus === "APPROVED");
  const sum = summarizeOpportunity(opp, now);
  const meta = OPP_STATUS_META[sum.status];
  const when = opportunityWhen(opp.shifts);
  const back = `/volunteer/opportunities/${opp.id}`;
  const loginHref = `/volunteer/login?next=${encodeURIComponent(back)}`;
  const place = [opp.location, opp.address, opp.city].filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav className="text-sm text-slate-500">
        <Link href="/volunteer/opportunities" className="font-medium text-brand-600 hover:underline">
          Opportunities
        </Link>{" "}
        / <span className="text-slate-700">{opp.title}</span>
      </nav>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <div className="rounded-3xl border border-sand bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              {opp.program ? (
                <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide", PROGRAM_COLORS[opp.program.color] ?? PROGRAM_COLORS.blue)}>
                  {opp.program.name}
                </span>
              ) : null}
              <Badge tone="gray">{SETTING_LABEL[opp.setting] ?? opp.setting}</Badge>
            </div>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-slate-900">{opp.title}</h1>
            {opp.summary ? <p className="mt-2 text-lg text-slate-600">{opp.summary}</p> : null}
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
              <span className="flex items-center gap-2"><CalendarDays className="size-4 text-brand-400" /> {when.date}</span>
              {when.time ? <span className="flex items-center gap-2"><Clock className="size-4 text-brand-400" /> {when.time}</span> : null}
              <span className="flex items-center gap-2"><MapPin className="size-4 text-brand-400" /> {place.join(", ") || "TBA"}</span>
            </div>
            {opp.imageUrl ? <img src={opp.imageUrl} alt="" className="mt-6 max-h-96 w-full rounded-2xl object-cover" /> : null}
            {opp.description ? (
              <div className="mt-6 border-t border-slate-100 pt-6">
                <h2 className="text-lg font-semibold text-slate-900">About this opportunity</h2>
                <p className="mt-3 whitespace-pre-line leading-relaxed text-slate-700">{opp.description}</p>
              </div>
            ) : null}
            {opp.skills.length ? (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-900">Helpful skills</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {opp.skills.map((s) => (
                    <span key={s.id} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Shifts */}
          <div id="shifts" className="mt-6 rounded-3xl border border-sand bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Choose a shift</h2>
                <p className="text-sm text-slate-500">{opp.shifts.length} shift{opp.shifts.length === 1 ? "" : "s"}</p>
              </div>
            </div>

            {!vol ? (
              <Notice className="mt-4">
                <span className="font-medium">Want to help?</span>{" "}
                <Link href={loginHref} className="font-medium underline">Sign in</Link> to sign up, or{" "}
                <Link href={`/volunteer/apply`} className="font-medium underline">apply to volunteer</Link> — it only takes a few minutes.
              </Notice>
            ) : !canSignUp ? (
              <Notice tone="amber" className="mt-4">
                {contact?.volunteerStatus === "REJECTED"
                  ? "Your volunteer application wasn't approved, so you can't sign up for shifts. Please contact us with any questions."
                  : "Your volunteer application is being reviewed. You'll be able to sign up for shifts as soon as it's approved."}
              </Notice>
            ) : null}

            <ul className="mt-5 divide-y divide-slate-100">
              {opp.shifts.map((s) => {
                const state = shiftState(s, opp.registrationCloseAt, now);
                const filled = shiftFilled(s);
                const left = Math.max(0, s.capacity - filled);
                const mine = contact ? s.registrations.find((r) => r.contactId === contact.id) : undefined;
                return (
                  <li key={s.id} className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center">
                    <div className="grid w-16 shrink-0 place-items-center rounded-xl bg-brand-50 py-2 text-center">
                      <p className="text-[10px] font-semibold uppercase text-brand-500">{format(s.startAt, "MMM")}</p>
                      <p className="text-xl font-semibold leading-none text-slate-900">{format(s.startAt, "d")}</p>
                      <p className="text-[10px] text-slate-500">{format(s.startAt, "EEE")}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">
                        {s.name && s.name !== "Main shift" ? `${s.name} · ` : ""}
                        {shiftTimeLabel(s)}
                      </p>
                      <p className="text-sm text-slate-500">
                        {fmtHours(shiftHours(s))} ·{" "}
                        {state === "PAST" ? `${filled} volunteered` : state === "FULL" ? "Full" : `${left} of ${s.capacity} spots left`}
                      </p>
                      <Progress value={pct(filled, s.capacity)} className="mt-2 max-w-xs" tone={state === "FULL" ? "accent" : "brand"} />
                    </div>
                    <div className="shrink-0">
                      {mine && state !== "PAST" ? (
                        <form action={cancelShift} className="flex items-center gap-2">
                          <input type="hidden" name="shiftId" value={s.id} />
                          <input type="hidden" name="back" value={back} />
                          <Badge tone="green">You&apos;re signed up</Badge>
                          <SubmitButton variant="ghost" size="sm" pendingText="Canceling…">
                            Cancel
                          </SubmitButton>
                        </form>
                      ) : mine ? (
                        <Badge tone={mine.status === "NO_SHOW" ? "gray" : "green"}>{mine.status === "NO_SHOW" ? "Missed" : "You volunteered"}</Badge>
                      ) : state === "PAST" ? (
                        <Badge tone="gray">Ended</Badge>
                      ) : state === "FULL" ? (
                        <Badge tone="red">Full</Badge>
                      ) : state === "CLOSED" ? (
                        <Badge tone="gray">Registration closed</Badge>
                      ) : canSignUp ? (
                        <form action={signUpForShift}>
                          <input type="hidden" name="shiftId" value={s.id} />
                          <input type="hidden" name="back" value={back} />
                          <SubmitButton size="sm" className="rounded-full px-5" pendingText="Signing up…">
                            Sign up
                          </SubmitButton>
                        </form>
                      ) : !vol ? (
                        <LinkButton href={loginHref} size="sm" variant="outline" className="rounded-full">
                          Sign in to sign up
                        </LinkButton>
                      ) : null}
                    </div>
                  </li>
                );
              })}
              {!opp.shifts.length && <li className="py-6 text-sm text-slate-500">Shift times will be announced soon.</li>}
            </ul>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="rounded-3xl border border-sand bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-slate-500">{sum.upcomingCount ? "Remaining spots" : "Volunteers"}</p>
            <p className="mt-1 text-4xl font-semibold text-brand-700">
              {sum.upcomingCount ? sum.remaining : sum.filled}
              <span className="text-lg font-medium text-slate-400"> of {sum.capacity}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">across {sum.upcomingCount ? "upcoming " : ""}shifts</p>
            <Progress value={pct(sum.filled, sum.capacity)} className="mt-4" tone={sum.status === "FULL" ? "accent" : "brand"} />
            {sum.status === "OPEN" || sum.status === "FEW" ? (
              vol ? (
                <LinkButton href="#shifts" className="mt-5 w-full rounded-full">
                  {canSignUp ? "Pick a shift" : "View shifts"}
                </LinkButton>
              ) : (
                <div className="mt-5 grid gap-2">
                  <LinkButton href={loginHref} className="w-full rounded-full">Sign in to sign up</LinkButton>
                  <LinkButton href="/volunteer/apply" variant="outline" className="w-full rounded-full">New? Apply to volunteer</LinkButton>
                </div>
              )
            ) : (
              <p className="mt-5 rounded-full bg-slate-100 py-2 text-sm font-medium text-slate-600">{meta.label}</p>
            )}
          </div>

          <div className="rounded-3xl border border-sand bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-slate-900">Details</h3>
            <ul className="mt-3 space-y-2.5 text-sm text-slate-600">
              <li className="flex items-center gap-2.5"><Users className="size-4 text-brand-400" />{opp.adultsOnly ? "Adults only (18+)" : opp.minAge ? `Ages ${opp.minAge}+` : "All ages welcome"}</li>
              {opp.registrationCloseAt ? (
                <li className="flex items-center gap-2.5"><CalendarDays className="size-4 text-brand-400" />Register by {fmtDate(opp.registrationCloseAt, "MMM d, yyyy")}</li>
              ) : null}
              <li className="flex items-center gap-2.5"><Accessibility className="size-4 text-brand-400" />{opp.wheelchairAccessible ? "Wheelchair accessible" : "Not wheelchair accessible"}</li>
              <li className="flex items-center gap-2.5"><ShieldCheck className="size-4 text-brand-400" />{SETTING_LABEL[opp.setting] ?? opp.setting} activity</li>
            </ul>
          </div>

          {place.length && opp.setting !== "VIRTUAL" ? (
            <div className="rounded-3xl border border-sand bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-slate-900">Location</h3>
              <p className="mt-2 text-sm text-slate-600">{opp.location}</p>
              {opp.address ? <p className="text-sm text-slate-600">{[opp.address, opp.city].filter(Boolean).join(", ")}</p> : null}
              <a href={mapsUrl(place)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
                <Navigation className="size-4" /> Get directions
              </a>
            </div>
          ) : null}

          {opp.contactName || opp.contactEmail ? (
            <div className="rounded-3xl border border-sand bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-slate-900">Questions?</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {opp.contactName ? <li className="flex items-center gap-2.5"><User className="size-4 text-brand-400" />{opp.contactName}</li> : null}
                {opp.contactEmail ? (
                  <li className="flex items-center gap-2.5"><Mail className="size-4 text-brand-400" /><a className="hover:underline" href={`mailto:${opp.contactEmail}`}>{opp.contactEmail}</a></li>
                ) : null}
                {opp.contactPhone ? (
                  <li className="flex items-center gap-2.5"><Phone className="size-4 text-brand-400" /><a className="hover:underline" href={`tel:${opp.contactPhone}`}>{opp.contactPhone}</a></li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
