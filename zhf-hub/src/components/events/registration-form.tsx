"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Lock, Minus, Plus, Tag, Ticket, X } from "lucide-react";
import { checkDiscountCode, registerForEvent, type RegState } from "@/app/(public)/events/[slug]/actions";
import { SubmitButton, submitNoReset } from "@/components/client-ui";
import { Input, Notice, Select } from "@/components/ui";
import { cn, money } from "@/lib/utils";
import { computeTotals, discountLabel, type DiscountInfo } from "./pricing";

export type TicketOption = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  attendeesPerTicket: number;
  countsTowardCapacity: boolean;
  remaining: number | null;
};
export type QuestionOption = { id: string; label: string; type: string; options: string[]; required: boolean };

type Person = { firstName: string; lastName: string; email: string; answers: Record<string, string> };
const emptyPerson = (): Person => ({ firstName: "", lastName: "", email: "", answers: {} });

const MAX_PER_TYPE = 20;

export function RegistrationForm({
  eventId,
  collectAttendeeInfo,
  coverFeeEnabled,
  allowDonation,
  tickets,
  questions,
  feePercent,
  feeFixedCents,
  capacityRemaining,
  mode,
}: {
  eventId: string;
  collectAttendeeInfo: boolean;
  coverFeeEnabled: boolean;
  allowDonation: boolean;
  tickets: TicketOption[];
  questions: QuestionOption[];
  feePercent: number;
  feeFixedCents: number;
  capacityRemaining: number | null;
  mode: "demo" | "test" | "live";
}) {
  const [state, formAction, pending] = useActionState<RegState, FormData>(registerForEvent, null);
  const fe = state?.fieldErrors ?? {};

  const [qty, setQty] = useState<Record<string, number>>(() =>
    tickets.length === 1 && tickets[0]!.remaining !== 0 ? { [tickets[0]!.id]: 1 } : {},
  );
  const [buyer, setBuyer] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [selfIsFirst, setSelfIsFirst] = useState(true);
  const [shared, setShared] = useState<Record<string, string>>({});
  const [codeInput, setCodeInput] = useState("");
  const [discount, setDiscount] = useState<DiscountInfo>(null);
  const [codeMsg, setCodeMsg] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();
  const [coverFee, setCoverFee] = useState(true);
  const [donationChoice, setDonationChoice] = useState<string>("0");
  const [customDonation, setCustomDonation] = useState("");

  // capacity in attendee units used by current selection
  const capacityUsed = tickets.reduce((s, t) => s + (t.countsTowardCapacity ? (qty[t.id] ?? 0) * Math.max(1, t.attendeesPerTicket) : 0), 0);

  const maxFor = (t: TicketOption) => {
    const current = qty[t.id] ?? 0;
    let max = Math.min(MAX_PER_TYPE, t.remaining ?? MAX_PER_TYPE);
    if (t.countsTowardCapacity && capacityRemaining != null) {
      const freeUnits = capacityRemaining - (capacityUsed - current * Math.max(1, t.attendeesPerTicket));
      max = Math.min(max, Math.floor(freeUnits / Math.max(1, t.attendeesPerTicket)));
    }
    return Math.max(0, max);
  };

  const slots = useMemo(() => {
    const out: { key: string; ticketId: string; label: string }[] = [];
    for (const t of tickets) {
      const n = qty[t.id] ?? 0;
      const per = Math.max(1, t.attendeesPerTicket);
      for (let i = 0; i < n; i++) {
        for (let a = 0; a < per; a++) {
          out.push({
            key: `${t.id}:${i * per + a}`,
            ticketId: t.id,
            label: per > 1 ? `${t.name}${n > 1 ? ` #${i + 1}` : ""} — person ${a + 1} of ${per}` : t.name,
          });
        }
      }
    }
    return out;
  }, [qty, tickets]);

  const subtotalCents = tickets.reduce((s, t) => s + (qty[t.id] ?? 0) * t.priceCents, 0);
  const donationCents = allowDonation
    ? donationChoice === "custom"
      ? Math.max(0, Math.round((parseFloat(customDonation.replace(/[$,]/g, "")) || 0) * 100))
      : parseInt(donationChoice, 10) * 100
    : 0;
  const totals = computeTotals({ subtotalCents, discount, coverFee: coverFeeEnabled && coverFee, donationCents, feePercent, feeFixedCents });
  const showFee = coverFeeEnabled && subtotalCents - totals.discountCents + donationCents > 0;

  const person = (key: string) => people[key] ?? emptyPerson();
  const setPerson = (key: string, patch: Partial<Person>) => setPeople((p) => ({ ...p, [key]: { ...(p[key] ?? emptyPerson()), ...patch } }));

  const payload = JSON.stringify({
    eventId,
    tickets: tickets.map((t) => ({ ticketTypeId: t.id, qty: qty[t.id] ?? 0 })),
    buyer,
    attendees: collectAttendeeInfo
      ? slots.map((s, i) => {
          const p = person(s.key);
          const me = i === 0 && selfIsFirst;
          return {
            ticketTypeId: s.ticketId,
            firstName: me ? buyer.firstName : p.firstName,
            lastName: me ? buyer.lastName : p.lastName,
            email: me ? buyer.email : p.email,
            answers: p.answers,
          };
        })
      : [],
    sharedAnswers: shared,
    discountCode: discount?.code ?? "",
    coverFee: showFee && coverFee,
    donationCents,
  });

  const anySelected = slots.length > 0;
  const submitLabel = totals.totalCents > 0 ? (mode === "demo" ? `Complete registration · ${money(totals.totalCents, { decimals: true })}` : `Continue to secure payment · ${money(totals.totalCents, { decimals: true })}`) : "Complete registration";

  const applyCode = () => {
    setCodeMsg(null);
    startCheck(async () => {
      const res = await checkDiscountCode(eventId, codeInput);
      if (res.ok) {
        setDiscount(res.discount);
        setCodeMsg(null);
      } else {
        setDiscount(null);
        setCodeMsg(res.message);
      }
    });
  };

  return (
    <form onSubmit={submitNoReset(formAction)} className="space-y-6">
      <input type="hidden" name="payload" value={payload} />

      {/* Tickets */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Ticket className="size-4" /> Tickets
        </h3>
        <div className="space-y-2.5">
          {tickets.map((t) => {
            const n = qty[t.id] ?? 0;
            const max = maxFor(t);
            const soldOut = t.remaining === 0;
            return (
              <div key={t.id} className={cn("rounded-xl border p-3.5 transition", n > 0 ? "border-brand-300 bg-brand-50/50" : "border-slate-200 bg-white")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{t.name}</p>
                    <p className="text-sm font-semibold text-brand-700">{t.priceCents ? money(t.priceCents, { decimals: true }) : "Free"}</p>
                    {t.description ? <p className="mt-0.5 text-xs text-slate-500">{t.description}</p> : null}
                    {t.attendeesPerTicket > 1 ? <p className="mt-0.5 text-xs text-slate-500">Admits {t.attendeesPerTicket}</p> : null}
                    {t.remaining != null && t.remaining > 0 && t.remaining <= 10 ? <p className="mt-0.5 text-xs font-medium text-amber-700">Only {t.remaining} left</p> : null}
                  </div>
                  {soldOut ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">Sold out</span>
                  ) : (
                    <div className="flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white p-1">
                      <button
                        type="button"
                        aria-label={`Fewer ${t.name}`}
                        disabled={n === 0}
                        onClick={() => setQty((q) => ({ ...q, [t.id]: Math.max(0, n - 1) }))}
                        className="grid size-8 place-items-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <Minus className="size-4" />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold tabular-nums">{n}</span>
                      <button
                        type="button"
                        aria-label={`More ${t.name}`}
                        disabled={n >= max}
                        onClick={() => setQty((q) => ({ ...q, [t.id]: Math.min(max, n + 1) }))}
                        className="grid size-8 place-items-center rounded-full bg-brand-700 text-white hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400"
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  )}
                </div>
                {fe[`qty_${t.id}`] ? <p className="mt-1 text-xs text-red-600">{fe[`qty_${t.id}`]}</p> : null}
              </div>
            );
          })}
        </div>
      </section>

      {anySelected && (
        <>
          {/* Buyer */}
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Your details</h3>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="First name" value={buyer.firstName} onChange={(v) => setBuyer({ ...buyer, firstName: v })} error={fe["buyer.firstName"]} autoComplete="given-name" required />
              <TextField label="Last name" value={buyer.lastName} onChange={(v) => setBuyer({ ...buyer, lastName: v })} error={fe["buyer.lastName"]} autoComplete="family-name" required />
              <TextField className="col-span-2" type="email" label="Email" value={buyer.email} onChange={(v) => setBuyer({ ...buyer, email: v })} error={fe["buyer.email"]} autoComplete="email" required hint="Your tickets will be emailed here." />
              <TextField className="col-span-2" type="tel" label="Phone (optional)" value={buyer.phone} onChange={(v) => setBuyer({ ...buyer, phone: v })} autoComplete="tel" />
            </div>
          </section>

          {/* Attendees */}
          {collectAttendeeInfo ? (
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Attendees</h3>
              <div className="space-y-3">
                {slots.map((s, i) => {
                  const p = person(s.key);
                  const me = i === 0 && selfIsFirst;
                  return (
                    <div key={s.key} className="rounded-xl border border-slate-200 bg-white p-3.5">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900">
                          Attendee {i + 1} <span className="font-normal text-slate-500">· {s.label}</span>
                        </p>
                        {i === 0 ? (
                          <label className="flex items-center gap-1.5 text-xs text-slate-600">
                            <input type="checkbox" checked={selfIsFirst} onChange={(e) => setSelfIsFirst(e.target.checked)} className="accent-brand-600" />
                            This is me
                          </label>
                        ) : null}
                      </div>
                      {fe[`att_${i}`] ? <p className="mb-1 text-xs text-red-600">{fe[`att_${i}`]}</p> : null}
                      {!me && (
                        <div className="grid grid-cols-2 gap-3">
                          <TextField label="First name" value={p.firstName} onChange={(v) => setPerson(s.key, { firstName: v })} error={fe[`att_${i}.firstName`]} required />
                          <TextField label="Last name" value={p.lastName} onChange={(v) => setPerson(s.key, { lastName: v })} error={fe[`att_${i}.lastName`]} required />
                          <TextField className="col-span-2" type="email" label="Email (optional)" value={p.email} onChange={(v) => setPerson(s.key, { email: v })} error={fe[`att_${i}.email`]} />
                        </div>
                      )}
                      {me && (fe[`att_${i}.firstName`] || fe[`att_${i}.lastName`]) ? <p className="text-xs text-red-600">Fill in your name above.</p> : null}
                      {questions.length > 0 && (
                        <div className={cn("grid gap-3", !me && "mt-3")}>
                          {questions.map((q) => (
                            <QuestionField
                              key={q.id}
                              q={q}
                              value={p.answers[q.id] ?? ""}
                              onChange={(v) => setPerson(s.key, { answers: { ...p.answers, [q.id]: v } })}
                              error={fe[`att_${i}.q_${q.id}`]}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : questions.length > 0 ? (
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">A few questions</h3>
              <div className="grid gap-3">
                {questions.map((q) => (
                  <QuestionField key={q.id} q={q} value={shared[q.id] ?? ""} onChange={(v) => setShared({ ...shared, [q.id]: v })} error={fe[`shared.q_${q.id}`]} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Discount */}
          {subtotalCents > 0 && (
            <section>
              {discount ? (
                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm">
                  <span className="flex items-center gap-2 font-medium text-emerald-800">
                    <Tag className="size-4" /> {discount.code} · {discountLabel(discount)}
                  </span>
                  <button type="button" onClick={() => setDiscount(null)} className="text-emerald-700 hover:text-emerald-900" aria-label="Remove code">
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Discount code</label>
                  <div className="flex gap-2">
                    <Input
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          applyCode();
                        }
                      }}
                      placeholder="e.g. EARLYBIRD"
                      className="uppercase"
                    />
                    <button type="button" onClick={applyCode} disabled={checking || !codeInput} className="h-10 shrink-0 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      {checking ? "Checking…" : "Apply"}
                    </button>
                  </div>
                  {codeMsg || fe.discountCode ? <p className="mt-1 text-xs text-red-600">{codeMsg ?? fe.discountCode}</p> : null}
                </div>
              )}
            </section>
          )}

          {/* Donation */}
          {allowDonation && (
            <section>
              <h3 className="mb-1 text-sm font-semibold text-slate-800">Add a tax-deductible gift?</h3>
              <p className="mb-2.5 text-xs text-slate-500">100% goes to outreach, recovery support and family programs.</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { v: "0", l: "No thanks" },
                  { v: "10", l: "$10" },
                  { v: "25", l: "$25" },
                  { v: "50", l: "$50" },
                  { v: "custom", l: "Other" },
                ].map((c) => (
                  <button
                    key={c.v}
                    type="button"
                    onClick={() => setDonationChoice(c.v)}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
                      donationChoice === c.v ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand-300",
                    )}
                  >
                    {c.l}
                  </button>
                ))}
              </div>
              {donationChoice === "custom" && (
                <div className="relative mt-2.5 max-w-[180px]">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
                  <Input inputMode="decimal" value={customDonation} onChange={(e) => setCustomDonation(e.target.value)} placeholder="Amount" className="pl-7" />
                </div>
              )}
            </section>
          )}

          {/* Fee */}
          {showFee && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-sand/60 p-3.5">
              <input type="checkbox" checked={coverFee} onChange={(e) => setCoverFee(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
              <span className="text-sm text-slate-700">
                <span className="font-medium text-slate-900">Cover the {money(computeTotals({ subtotalCents, discount, coverFee: true, donationCents, feePercent, feeFixedCents }).feeCents, { decimals: true })} processing fee</span>
                <span className="block text-xs text-slate-500">So the foundation receives 100% of your payment.</span>
              </span>
            </label>
          )}

          {/* Summary */}
          <section className="rounded-xl bg-slate-50 p-4 text-sm">
            {tickets
              .filter((t) => (qty[t.id] ?? 0) > 0)
              .map((t) => (
                <Row key={t.id} label={`${qty[t.id]} × ${t.name}`} value={t.priceCents ? money(t.priceCents * (qty[t.id] ?? 0), { decimals: true }) : "Free"} />
              ))}
            {totals.discountCents > 0 && <Row label={`Discount (${discount?.code})`} value={`−${money(totals.discountCents, { decimals: true })}`} className="text-emerald-700" />}
            {totals.donationCents > 0 && <Row label="Donation" value={money(totals.donationCents, { decimals: true })} />}
            {totals.feeCents > 0 && <Row label="Processing fee" value={money(totals.feeCents, { decimals: true })} />}
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
              <span>Total</span>
              <span>{totals.totalCents ? money(totals.totalCents, { decimals: true }) : "Free"}</span>
            </div>
          </section>

          {state?.error ? <Notice tone="red">{state.error}</Notice> : null}

          <SubmitButton pending={pending} size="lg" className="w-full rounded-full" pendingText={totals.totalCents > 0 && mode !== "demo" ? "Opening secure checkout…" : "Registering…"}>
            {submitLabel}
          </SubmitButton>
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
            <Lock className="size-3" />
            {totals.totalCents > 0
              ? mode === "demo"
                ? "Demo mode — no card will be charged."
                : "Payments are processed securely by Stripe."
              : "No payment needed — you'll get your tickets by email."}
          </p>
        </>
      )}
    </form>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between py-0.5 text-slate-600", className)}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  className,
  type = "text",
  required,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  className?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} className={cn(error && "border-red-400")} />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function QuestionField({ q, value, onChange, error }: { q: QuestionOption; value: string; onChange: (v: string) => void; error?: string }) {
  if (q.type === "CHECKBOX") {
    return (
      <div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={value === "Yes"} onChange={(e) => onChange(e.target.checked ? "Yes" : "")} className="size-4 accent-brand-600" />
          {q.label}
          {q.required ? <span className="text-red-500">*</span> : null}
        </label>
        {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {q.label}
        {q.required ? <span className="text-red-500"> *</span> : null}
      </label>
      {q.type === "SELECT" ? (
        <Select value={value} onChange={(e) => onChange(e.target.value)} className={cn(error && "border-red-400")}>
          <option value="">Choose…</option>
          {q.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} className={cn(error && "border-red-400")} />
      )}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
