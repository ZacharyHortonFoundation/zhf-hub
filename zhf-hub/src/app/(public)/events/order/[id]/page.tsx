import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { format } from "date-fns";
import { CalendarPlus, CheckCircle2, Clock, MapPin, RefreshCw, Ticket } from "lucide-react";
import { db } from "@/lib/db";
import { eventLocation, googleCalendarUrl, markOrderPaid, mapsUrl } from "@/lib/events";
import { appUrl, stripe } from "@/lib/payments";
import { Card, Notice } from "@/components/ui";
import { PrintButton } from "@/components/client-ui";
import { fmtRange, money } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your tickets", robots: { index: false } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const load = () =>
    db.eventOrder.findUnique({
      where: { id },
      include: { event: true, contact: true, discountCode: true, attendees: { include: { ticketType: true }, orderBy: { createdAt: "asc" } } },
    });
  const first = await load();
  if (!first) notFound();

  // Returning from Stripe before the webhook arrived: confirm directly with Stripe.
  let refreshed = false;
  if (first.status === "PENDING" && sp.paid && first.stripeSessionId) {
    const s = stripe();
    if (s) {
      try {
        const session = await s.checkout.sessions.retrieve(first.stripeSessionId);
        if (session.payment_status === "paid") {
          await markOrderPaid(first.id, { stripeSessionId: session.id, isTest: !session.livemode });
          refreshed = true;
        }
      } catch (e) {
        console.error("Could not verify Stripe session", e);
      }
    }
  }
  const order = refreshed ? (await load()) ?? first : first;

  const ev = order.event;
  const url = `${appUrl()}/events/${ev.slug}`;
  const paid = order.status === "PAID";
  const qrs = paid
    ? await Promise.all(order.attendees.map((a) => QRCode.toDataURL(a.ticketCode, { margin: 1, width: 240, color: { dark: "#24384a", light: "#ffffff" } })))
    : [];
  const ticketLines = Object.values(
    order.attendees.reduce<Record<string, { name: string; count: number; per: number; price: number }>>((acc, a) => {
      const k = a.ticketTypeId;
      acc[k] ??= { name: a.ticketType.name, count: 0, per: Math.max(1, a.ticketType.attendeesPerTicket), price: a.ticketType.priceCents };
      acc[k].count++;
      return acc;
    }, {}),
  ).map((l) => ({ ...l, qty: Math.ceil(l.count / l.per) }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="no-print text-center">
        {paid ? (
          <>
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="size-9" />
            </span>
            <h1 className="mt-4 text-3xl font-semibold text-slate-900">You&apos;re going, {order.contact.firstName}!</h1>
            <p className="mt-2 text-slate-600">
              We&apos;ve emailed your confirmation{order.contact.email ? ` to ${order.contact.email}` : ""}. Show the QR codes below at check-in.
            </p>
          </>
        ) : order.status === "PENDING" ? (
          <>
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-amber-100 text-amber-600">
              <Clock className="size-9" />
            </span>
            <h1 className="mt-4 text-3xl font-semibold text-slate-900">Payment processing…</h1>
            <p className="mt-2 text-slate-600">We&apos;re waiting for confirmation from our payment processor. This usually takes a few seconds.</p>
            <Link href={`/events/order/${order.id}?paid=1`} className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800">
              <RefreshCw className="size-4" /> Refresh
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-semibold text-slate-900">This order was {order.status.toLowerCase()}</h1>
            <p className="mt-2 text-slate-600">If you think this is a mistake please contact us.</p>
          </>
        )}
      </div>

      {order.isTest ? (
        <Notice tone="amber" className="no-print mt-6 text-center">
          Demo mode — no card was charged. This order is flagged as a test record.
        </Notice>
      ) : null}

      {/* Summary */}
      <Card className="mt-8 overflow-hidden rounded-3xl border-sand">
        <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-500">Order #{order.number}</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{ev.title}</h2>
            <div className="mt-3 space-y-1.5 text-sm text-slate-600">
              <p className="flex items-center gap-2">
                <Clock className="size-4 text-slate-400" /> {fmtRange(ev.startAt, ev.endAt)}
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="size-4 text-slate-400" />
                <a href={mapsUrl(ev)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {eventLocation(ev) || "Location to be announced"}
                </a>
              </p>
            </div>
            <div className="no-print mt-4 flex flex-wrap gap-2">
              <a href={`/api/events/${ev.slug}/ics`} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <CalendarPlus className="size-4" /> Add to calendar
              </a>
              <a
                href={googleCalendarUrl(ev, url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Google Calendar
              </a>
              {paid ? <PrintButton>Print tickets</PrintButton> : null}
            </div>
          </div>
          <div className="min-w-[220px] rounded-2xl bg-slate-50 p-4 text-sm">
            {ticketLines.map((l) => (
              <div key={l.name} className="flex justify-between py-0.5 text-slate-600">
                <span>
                  {l.qty} × {l.name}
                </span>
                <span className="tabular-nums">{l.price ? money(l.price * l.qty, { decimals: true }) : "Free"}</span>
              </div>
            ))}
            {order.discountCents > 0 && (
              <div className="flex justify-between py-0.5 text-emerald-700">
                <span>Discount{order.discountCode ? ` (${order.discountCode.code})` : ""}</span>
                <span>−{money(order.discountCents, { decimals: true })}</span>
              </div>
            )}
            {order.donationCents > 0 && (
              <div className="flex justify-between py-0.5 text-slate-600">
                <span>Donation</span>
                <span>{money(order.donationCents, { decimals: true })}</span>
              </div>
            )}
            {order.feeCents > 0 && (
              <div className="flex justify-between py-0.5 text-slate-600">
                <span>Processing fee</span>
                <span>{money(order.feeCents, { decimals: true })}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
              <span>Total</span>
              <span>{order.totalCents ? money(order.totalCents, { decimals: true }) : "Free"}</span>
            </div>
            {order.donationCents > 0 ? <p className="mt-2 text-xs text-slate-500">Your {money(order.donationCents, { decimals: true })} donation is tax-deductible.</p> : null}
          </div>
        </div>
      </Card>

      {/* Tickets */}
      {paid ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {order.attendees.map((a, i) => (
            <div key={a.id} className="break-inside-avoid overflow-hidden rounded-3xl border border-sand bg-white shadow-sm print:shadow-none">
              <div className="flex items-center justify-between bg-brand-800 px-5 py-3 text-white">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Ticket className="size-4" /> Ticket {i + 1} of {order.attendees.length}
                </span>
                <span className="text-xs text-brand-200">{format(ev.startAt, "MMM d, yyyy")}</span>
              </div>
              <div className="flex items-center gap-4 p-5">
                <img src={qrs[i]} alt={`QR code for ticket ${a.ticketCode}`} className="size-32 shrink-0 rounded-xl border border-slate-100" />
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-slate-900">
                    {a.firstName} {a.lastName}
                  </p>
                  <p className="text-sm text-slate-500">{a.ticketType.name}</p>
                  <p className="mt-2 font-mono text-sm tracking-widest text-brand-700">{a.ticketCode}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{ev.title}</p>
                  {a.checkedInAt ? <p className="mt-1 text-xs font-medium text-emerald-700">Checked in {format(a.checkedInAt, "MMM d, h:mm a")}</p> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="no-print mt-10 text-center">
        <Link href="/events" className="text-sm font-medium text-brand-700 hover:underline">
          ← Browse more events
        </Link>
      </div>
    </div>
  );
}
