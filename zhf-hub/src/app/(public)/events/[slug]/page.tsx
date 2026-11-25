import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { format } from "date-fns";
import { ArrowLeft, CalendarDays, CalendarPlus, Clock, Mail, MapPin, Navigation, Users } from "lucide-react";
import { db } from "@/lib/db";
import { eventAvailability, eventLocation, googleCalendarUrl, mapsUrl, priceSummary, registrationState } from "@/lib/events";
import { appUrl, paymentsMode } from "@/lib/payments";
import { getSettings } from "@/lib/settings";
import { Card, Notice } from "@/components/ui";
import { CopyButton } from "@/components/client-ui";
import { RegistrationForm } from "@/components/events/registration-form";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  return db.event.findUnique({
    where: { slug },
    include: {
      ticketTypes: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }] },
      questions: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const e = await load(slug);
  if (!e) return { title: "Event not found" };
  return { title: e.title, description: e.summary ?? undefined };
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ canceled?: string; preview?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const event = await load(slug);
  if (!event || event.status === "DRAFT") notFound();

  const [avail, settings] = await Promise.all([eventAvailability(event.id), getSettings()]);
  const state = registrationState(event, avail?.soldOut ?? false);
  const url = `${appUrl()}/events/${event.slug}`;
  const location = eventLocation(event);
  const sameDay = !event.endAt || format(event.startAt, "yyyy-MM-dd") === format(event.endAt, "yyyy-MM-dd");
  const remainingById = new Map((avail?.tickets ?? []).map((t) => [t.id, t.remaining]));

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-800 text-white">
        {event.imageUrl ? (
          <>
            <img src={event.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-900 via-brand-900/70 to-brand-900/30" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(114,147,178,.55),transparent_50%),radial-gradient(circle_at_90%_90%,rgba(245,184,63,.22),transparent_45%)]" />
        )}
        <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-6 sm:pb-16">
          <Link href="/events" className="inline-flex items-center gap-1.5 text-sm text-brand-200 hover:text-white">
            <ArrowLeft className="size-4" /> All events
          </Link>
          <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end">
            <div className="grid w-20 shrink-0 place-items-center rounded-2xl bg-white py-3 text-center text-ink shadow-lg">
              <p className="text-xs font-semibold uppercase text-brand-500">{format(event.startAt, "MMM")}</p>
              <p className="text-3xl font-semibold leading-none">{format(event.startAt, "d")}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{format(event.startAt, "EEE")}</p>
            </div>
            <div className="min-w-0">
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">{event.category}</span>
              {event.status === "CANCELED" ? <span className="ml-2 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold">Canceled</span> : null}
              <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">{event.title}</h1>
              {event.summary ? <p className="mt-2 max-w-2xl text-brand-100">{event.summary}</p> : null}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_400px]">
        {/* Main column */}
        <div className="min-w-0 space-y-8">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoTile icon={<CalendarDays className="size-5" />} label="Date">
              {sameDay ? format(event.startAt, "EEEE, MMMM d, yyyy") : `${format(event.startAt, "EEE, MMM d")} – ${format(event.endAt!, "EEE, MMM d, yyyy")}`}
            </InfoTile>
            <InfoTile icon={<Clock className="size-5" />} label="Time">
              {format(event.startAt, "h:mm a")}
              {event.endAt ? ` – ${format(event.endAt, sameDay ? "h:mm a" : "MMM d, h:mm a")}` : ""}
            </InfoTile>
            <InfoTile icon={<MapPin className="size-5" />} label="Location">
              <span className="block">{event.venueName ?? event.city ?? "To be announced"}</span>
              {event.address || (event.venueName && event.city) ? (
                <span className="block text-sm font-normal text-slate-500">{[event.address, event.city].filter(Boolean).join(", ")}</span>
              ) : null}
            </InfoTile>
            <InfoTile icon={<Users className="size-5" />} label="Admission">
              {priceSummary(event.ticketTypes)}
              {avail?.capacityRemaining != null && state.open ? (
                <span className={cn("block text-sm font-normal", avail.capacityRemaining <= 10 ? "text-amber-700" : "text-slate-500")}>
                  {avail.capacityRemaining} of {event.capacity} spots left
                </span>
              ) : null}
            </InfoTile>
          </div>

          {event.description ? (
            <section>
              <h2 className="text-xl font-semibold text-slate-900">About this event</h2>
              <div className="mt-3 whitespace-pre-line leading-relaxed text-slate-700">{event.description}</div>
            </section>
          ) : null}

          <section className="flex flex-wrap gap-2">
            <a href={`/api/events/${event.slug}/ics`} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <CalendarPlus className="size-4" /> Add to calendar (.ics)
            </a>
            <a href={googleCalendarUrl(event, url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <CalendarPlus className="size-4" /> Google Calendar
            </a>
            <a href={mapsUrl(event)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Navigation className="size-4" /> Get directions
            </a>
          </section>

          <section className="rounded-2xl border border-sand bg-white p-5">
            <p className="text-sm font-semibold text-slate-900">Share this event</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CopyButton text={url}>Copy link</CopyButton>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Facebook
              </a>
              <a
                href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(event.title)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                X
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                LinkedIn
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent(event.title)}&body=${encodeURIComponent(`${event.title}\n${url}`)}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Mail className="size-3.5" /> Email
              </a>
            </div>
          </section>

          {location ? (
            <section>
              <h2 className="text-xl font-semibold text-slate-900">Location</h2>
              <div className="mt-3 overflow-hidden rounded-2xl border border-sand bg-white">
                <iframe
                  title="Map"
                  className="h-64 w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.google.com/maps?q=${encodeURIComponent(location)}&output=embed`}
                />
                <div className="flex items-center justify-between gap-3 p-4 text-sm">
                  <span className="text-slate-700">{location}</span>
                  <a href={mapsUrl(event)} target="_blank" rel="noopener noreferrer" className="shrink-0 font-medium text-brand-700 hover:underline">
                    Directions →
                  </a>
                </div>
              </div>
            </section>
          ) : null}

          {event.coordinatorEmail ? (
            <p className="text-sm text-slate-500">
              Questions? Contact {event.coordinatorName ?? "our events team"} at{" "}
              <a href={`mailto:${event.coordinatorEmail}`} className="font-medium text-brand-700 hover:underline">
                {event.coordinatorEmail}
              </a>
              .
            </p>
          ) : null}
        </div>

        {/* Registration */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="overflow-hidden rounded-3xl border-sand shadow-lg">
            <div className="border-b border-slate-100 bg-brand-50/60 px-6 py-4">
              <p className="font-semibold text-slate-900">{state.open ? "Register" : "Registration"}</p>
              {state.open && event.registrationDeadline ? (
                <p className="text-xs text-slate-500">Registration closes {format(event.registrationDeadline, "MMM d 'at' h:mm a")}</p>
              ) : null}
            </div>
            <div className="p-6">
              {sp.canceled ? (
                <Notice tone="amber" className="mb-4">
                  Checkout was canceled — your card was not charged. You can try again below.
                </Notice>
              ) : null}
              {state.open ? (
                event.ticketTypes.length ? (
                  <RegistrationForm
                    eventId={event.id}
                    collectAttendeeInfo={event.collectAttendeeInfo}
                    coverFeeEnabled={event.coverFeeEnabled}
                    allowDonation={event.allowDonation}
                    feePercent={settings.feePercent}
                    feeFixedCents={settings.feeFixedCents}
                    capacityRemaining={avail?.capacityRemaining ?? null}
                    mode={paymentsMode()}
                    privacyUrl={settings.privacyPolicyUrl}
                    tickets={event.ticketTypes.map((t) => ({
                      id: t.id,
                      name: t.name,
                      description: t.description,
                      priceCents: t.priceCents,
                      attendeesPerTicket: t.attendeesPerTicket,
                      countsTowardCapacity: t.countsTowardCapacity,
                      remaining: remainingById.get(t.id) ?? null,
                    }))}
                    questions={event.questions.map((q) => ({
                      id: q.id,
                      label: q.label,
                      type: q.type,
                      required: q.required,
                      options: (q.options ?? "").split("\n").map((o) => o.trim()).filter(Boolean),
                    }))}
                  />
                ) : (
                  <p className="text-sm text-slate-600">Registration details are coming soon.</p>
                )
              ) : (
                <div className="text-center">
                  <p className="font-medium text-slate-900">{state.reason}</p>
                  <p className="mt-1 text-sm text-slate-500">Browse other ways to get involved.</p>
                  <div className="mt-4 flex flex-col gap-2">
                    <Link href="/events" className="rounded-full bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800">
                      See upcoming events
                    </Link>
                    <Link href="/donate" className="rounded-full border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      Make a donation
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}

function InfoTile({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-sand bg-white p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 font-medium text-slate-900">{children}</p>
      </div>
    </div>
  );
}
