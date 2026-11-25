import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, HandHeart, Mail, Repeat } from "lucide-react";
import { db } from "@/lib/db";
import { FREQ_LABEL } from "@/lib/constants";
import { fmtDate, money } from "@/lib/utils";
import { LinkButton, Notice } from "@/components/ui";
import { CopyButton } from "@/components/client-ui";
import { appUrl } from "@/lib/payments";

export const metadata = { title: "Thank you" };
export const dynamic = "force-dynamic";

export default async function ThankYou({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  if (!d) notFound();
  const donation = await db.donation.findUnique({ where: { id: d }, include: { contact: true, fund: true, campaign: true } });
  if (!donation) notFound();
  const pending = donation.status === "PENDING";
  const name = donation.contact.firstName || donation.contact.orgName || "friend";

  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <div className="overflow-hidden rounded-3xl border border-sand bg-white shadow-xl shadow-brand-900/5">
        <div className="relative bg-brand-800 px-8 py-10 text-center text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,184,63,.3),transparent_60%)]" />
          <div className="relative">
            <CheckCircle2 className="mx-auto size-14 text-accent" />
            <h1 className="mt-4 text-3xl font-semibold">{pending ? "Almost there…" : `Thank you, ${name}!`}</h1>
            <p className="mt-2 text-brand-100">
              {pending
                ? "We're confirming your payment with Stripe. This usually takes a few seconds."
                : `Your ${donation.frequency === "ONE_TIME" ? "" : FREQ_LABEL[donation.frequency]!.toLowerCase() + " "}gift of ${money(donation.amountCents, { decimals: true })} is helping break the stigma of addiction.`}
            </p>
          </div>
        </div>
        <div className="px-8 py-8">
          {donation.isTest ? (
            <Notice tone="amber" className="mb-6">
              Demo mode — no card was charged. This gift was recorded as a test transaction.
            </Notice>
          ) : null}
          {pending ? (
            <LinkButton href={`/donate/thank-you?d=${donation.id}`} variant="outline" className="w-full">
              Refresh status
            </LinkButton>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-slate-500">Receipt #</dt>
                  <dd className="font-semibold text-slate-900">{donation.number}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Date</dt>
                  <dd className="font-semibold text-slate-900">{fmtDate(donation.receivedAt)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Amount charged</dt>
                  <dd className="font-semibold text-slate-900">{money(donation.totalCents, { decimals: true })}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Designation</dt>
                  <dd className="font-semibold text-slate-900">{donation.fund?.name ?? "General Fund"}</dd>
                </div>
              </dl>
              <p className="mt-6 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <Mail className="size-4 text-brand-500" /> A tax receipt is on its way to <strong className="text-slate-800">{donation.contact.email}</strong>.
              </p>
            </>
          )}

          <div className="mt-8">
            <p className="text-sm font-semibold text-slate-900">Spread the word</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <CopyButton text={`${appUrl()}/donate`}>Copy donation link</CopyButton>
              <a className="inline-flex h-8 items-center rounded-xl border border-slate-300 px-3 text-sm hover:bg-slate-50" target="_blank" rel="noreferrer" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(appUrl() + "/donate")}`}>
                Share on Facebook
              </a>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {donation.frequency === "ONE_TIME" ? (
              <Link href="/donate?frequency=MONTHLY" className="rounded-2xl border border-slate-200 p-4 text-sm transition hover:border-brand-300">
                <Repeat className="size-5 text-brand-600" />
                <p className="mt-2 font-semibold text-slate-900">Give monthly</p>
                <p className="text-slate-500">Steady support all year.</p>
              </Link>
            ) : null}
            <Link href="/events" className="rounded-2xl border border-slate-200 p-4 text-sm transition hover:border-brand-300">
              <CalendarDays className="size-5 text-brand-600" />
              <p className="mt-2 font-semibold text-slate-900">Join an event</p>
              <p className="text-slate-500">Meet the community.</p>
            </Link>
            <Link href="/volunteer" className="rounded-2xl border border-slate-200 p-4 text-sm transition hover:border-brand-300">
              <HandHeart className="size-5 text-brand-600" />
              <p className="mt-2 font-semibold text-slate-900">Volunteer</p>
              <p className="text-slate-500">Give your time.</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
