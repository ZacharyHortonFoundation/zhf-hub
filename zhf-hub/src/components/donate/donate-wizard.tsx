"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Building2, Check, ChevronLeft, Heart, Lock, Repeat, User, Users } from "lucide-react";
import { donate, type DonateState } from "@/app/(public)/donate/actions";
import { buttonClass, Field, Input, Select, Textarea, Notice } from "@/components/ui";
import { SubmitButton, submitNoReset } from "@/components/client-ui";
import { cn } from "@/lib/utils";

type Fund = { id: string; name: string; description: string | null };
type Props = {
  presetAmounts: number[];
  funds: Fund[];
  defaultFundId: string | null;
  campaign: { slug: string; name: string } | null;
  initialFrequency: string;
  initialAmount: number | null;
  fee: { percent: number; fixedCents: number };
  mode: "demo" | "test" | "live";
  orgName: string;
};

const FREQS = [
  { value: "ONE_TIME", label: "One-time", per: "" },
  { value: "MONTHLY", label: "Monthly", per: "/mo" },
  { value: "QUARTERLY", label: "Quarterly", per: "/qtr" },
  { value: "ANNUAL", label: "Annual", per: "/yr" },
];
const STEPS = ["Amount", "Your details", "Dedication", "Review"];
const STEP_FIELDS: Record<number, string[]> = {
  0: ["amount", "frequency", "fundId"],
  1: ["firstName", "lastName", "email", "phone", "orgName", "spouseFirstName", "spouseLastName"],
  2: ["dedicationName", "notifyName", "notifyEmail"],
};

function feeFor(amountCents: number, percent: number, fixed: number) {
  if (amountCents <= 0) return 0;
  return Math.ceil((amountCents + fixed) / (1 - percent / 100)) - amountCents;
}
const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: c % 100 ? 2 : 0 });

export function DonateWizard(p: Props) {
  const [state, action, pending] = useActionState<DonateState, FormData>(donate, null);
  const [step, setStep] = useState(0);
  const [frequency, setFrequency] = useState(p.initialFrequency);
  const [preset, setPreset] = useState<number | null>(p.initialAmount && p.presetAmounts.includes(p.initialAmount) ? p.initialAmount : p.initialAmount ? null : p.presetAmounts[1] ?? 50);
  const [custom, setCustom] = useState(p.initialAmount && !p.presetAmounts.includes(p.initialAmount) ? String(p.initialAmount) : "");
  const [coverFee, setCoverFee] = useState(true);
  const [fundId, setFundId] = useState(p.defaultFundId ?? "");
  const [donorType, setDonorType] = useState<"INDIVIDUAL" | "BUSINESS">("INDIVIDUAL");
  const [asCouple, setAsCouple] = useState(false);
  const [dedication, setDedication] = useState<"" | "HONOR" | "MEMORY">("");
  const [notify, setNotify] = useState(false);
  const [matching, setMatching] = useState(false);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const amount = custom ? Number(custom) : preset ?? 0;
  const amountCents = Number.isFinite(amount) ? Math.round(amount * 100) : 0;
  const feeCents = coverFee ? feeFor(amountCents, p.fee.percent, p.fee.fixedCents) : 0;
  const totalCents = amountCents + feeCents;
  const per = FREQS.find((f) => f.value === frequency)?.per ?? "";
  const errors = { ...(state?.fieldErrors ?? {}), ...localErrors };

  // Jump back to the first step with a server-side error
  useEffect(() => {
    if (!state?.fieldErrors) return;
    const keys = Object.keys(state.fieldErrors);
    const target = [0, 1, 2].find((s) => STEP_FIELDS[s]!.some((f) => keys.includes(f)));
    if (target !== undefined) setStep(target);
  }, [state]);

  const fundName = useMemo(() => p.funds.find((f) => f.id === fundId)?.name ?? "Where it's needed most", [fundId, p.funds]);

  function validate(s: number) {
    const fd = new FormData(formRef.current!);
    const e: Record<string, string> = {};
    const get = (k: string) => String(fd.get(k) ?? "").trim();
    if (s === 0) {
      if (!amount || amount < 5) e.amount = "Please choose or enter an amount of at least $5.";
    }
    if (s === 1) {
      if (!get("firstName")) e.firstName = "First name is required";
      if (!get("lastName")) e.lastName = "Last name is required";
      if (!/^\S+@\S+\.\S+$/.test(get("email"))) e.email = "Enter a valid email address";
      if (donorType === "BUSINESS" && !get("orgName")) e.orgName = "Business name is required";
      if (asCouple && (!get("spouseFirstName") || !get("spouseLastName"))) e.spouseFirstName = "Spouse / partner name is required";
    }
    if (s === 2 && dedication) {
      if (!get("dedicationName")) e.dedicationName = "Who is this gift dedicated to?";
      if (notify && !get("notifyName")) e.notifyName = "Recipient name is required";
      if (notify && !/^\S+@\S+\.\S+$/.test(get("notifyEmail"))) e.notifyEmail = "Enter a valid email";
    }
    setLocalErrors(e);
    return Object.keys(e).length === 0;
  }
  const next = () => validate(step) && setStep((s) => Math.min(3, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const reviewData = () => {
    if (!formRef.current) return {} as Record<string, string>;
    return Object.fromEntries(new FormData(formRef.current).entries()) as Record<string, string>;
  };
  const r = step === 3 ? reviewData() : {};

  return (
    <form ref={formRef} onSubmit={submitNoReset(action)} className="overflow-hidden rounded-3xl border border-sand bg-white shadow-xl shadow-brand-900/5" noValidate>
      {/* Stepper */}
      <ol className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-8">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition",
                i < step ? "bg-brand-600 text-white" : i === step ? "bg-brand-700 text-white ring-4 ring-brand-100" : "bg-white text-slate-400 ring-1 ring-slate-200",
              )}
              aria-label={`Step ${i + 1}: ${label}`}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </button>
            <span className={cn("hidden text-xs font-semibold uppercase tracking-wide sm:block", i === step ? "text-brand-800" : "text-slate-400")}>{label}</span>
            {i < STEPS.length - 1 ? <span className={cn("h-px flex-1", i < step ? "bg-brand-300" : "bg-slate-200")} /> : null}
          </li>
        ))}
      </ol>

      <div className="px-5 py-7 sm:px-8">
        {state?.error && !state.fieldErrors ? <Notice tone="red" className="mb-5">{state.error}</Notice> : null}
        <input type="hidden" name="campaign" value={p.campaign?.slug ?? ""} />
        <input type="hidden" name="frequency" value={frequency} />
        <input type="hidden" name="amount" value={amount || ""} />
        <input type="hidden" name="coverFee" value={coverFee ? "true" : "false"} />
        <input type="hidden" name="donorType" value={donorType} />
        <input type="hidden" name="asCouple" value={asCouple ? "true" : "false"} />
        <input type="hidden" name="dedicationType" value={dedication} />
        <input type="hidden" name="notify" value={notify ? "true" : "false"} />

        {/* ── Step 1: amount ── */}
        <section className={step === 0 ? "block" : "hidden"}>
          <h2 className="text-xl font-semibold text-slate-900">Choose your gift</h2>
          {p.campaign ? (
            <p className="mt-1 text-sm text-slate-500">
              Supporting <span className="font-medium text-brand-700">{p.campaign.name}</span>
            </p>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1 sm:grid-cols-4">
            {FREQS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFrequency(f.value)}
                className={cn(
                  "rounded-xl py-2.5 text-sm font-medium transition",
                  frequency === f.value ? "bg-white text-brand-800 shadow-sm" : "text-slate-600 hover:text-slate-900",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5">
            {p.presetAmounts.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => {
                  setPreset(a);
                  setCustom("");
                }}
                className={cn(
                  "rounded-2xl border-2 py-4 text-lg font-semibold transition",
                  preset === a && !custom ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-700 hover:border-brand-300",
                )}
              >
                ${a.toLocaleString()}
              </button>
            ))}
          </div>
          <div className="relative mt-3">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-slate-400">$</span>
            <Input
              inputMode="decimal"
              placeholder="Other amount"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value.replace(/[^0-9.]/g, ""));
                setPreset(null);
              }}
              className={cn("h-14 rounded-2xl pl-9 text-lg font-semibold", errors.amount && "border-red-400")}
              aria-label="Custom amount"
            />
          </div>
          {errors.amount ? <p className="mt-1.5 text-sm text-red-600">{errors.amount}</p> : null}

          {frequency === "ONE_TIME" && amount >= 10 ? (
            <button
              type="button"
              onClick={() => {
                setFrequency("MONTHLY");
                const monthly = Math.max(10, Math.round(amount / 3 / 5) * 5);
                setCustom(String(monthly));
                setPreset(null);
              }}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-left text-sm transition hover:bg-accent/20"
            >
              <Repeat className="size-5 shrink-0 text-accent-600" />
              <span>
                <span className="font-semibold text-slate-900">Make it monthly?</span>{" "}
                <span className="text-slate-600">
                  A gift of ${Math.max(10, Math.round(amount / 3 / 5) * 5)}/month gives steady, year-round support.
                </span>
              </span>
            </button>
          ) : null}

          <Field label="Designate my gift to" className="mt-6">
            <Select name="fundId" value={fundId} onChange={(e) => setFundId(e.target.value)}>
              {p.funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.description ? ` — ${f.description}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-brand-300">
            <input type="checkbox" checked={coverFee} onChange={(e) => setCoverFee(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
            <span className="text-sm">
              <span className="font-medium text-slate-900">
                Add {usd(feeFor(amountCents, p.fee.percent, p.fee.fixedCents))} to cover processing fees
              </span>
              <span className="block text-slate-500">So 100% of your {amount ? usd(amountCents) : ""} gift goes to the mission.</span>
            </span>
          </label>
        </section>

        {/* ── Step 2: details ── */}
        <section className={step === 1 ? "block" : "hidden"}>
          <h2 className="text-xl font-semibold text-slate-900">Your information</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              { v: "INDIVIDUAL" as const, label: "Individual / couple", icon: <User className="size-4" /> },
              { v: "BUSINESS" as const, label: "Business / organization", icon: <Building2 className="size-4" /> },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setDonorType(o.v)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-medium transition",
                  donorType === o.v ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600 hover:border-brand-300",
                )}
              >
                {o.icon} {o.label}
              </button>
            ))}
          </div>

          {donorType === "BUSINESS" ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Business name" required error={errors.orgName} className="sm:col-span-2">
                <Input name="orgName" autoComplete="organization" />
              </Field>
              <Field label="Tax ID (optional)">
                <Input name="taxId" />
              </Field>
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label={donorType === "BUSINESS" ? "Contact first name" : "First name"} required error={errors.firstName}>
              <Input name="firstName" autoComplete="given-name" />
            </Field>
            <Field label={donorType === "BUSINESS" ? "Contact last name" : "Last name"} required error={errors.lastName}>
              <Input name="lastName" autoComplete="family-name" />
            </Field>
            <Field label="Email" required error={errors.email} hint="We'll send your tax receipt here.">
              <Input name="email" type="email" autoComplete="email" />
            </Field>
            <Field label="Phone">
              <Input name="phone" type="tel" autoComplete="tel" placeholder="(559) 555-0123" />
            </Field>
          </div>

          {donorType === "INDIVIDUAL" ? (
            <div className="mt-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={asCouple} onChange={(e) => setAsCouple(e.target.checked)} className="size-4 accent-brand-600" />
                <Users className="size-4 text-slate-400" /> We&apos;re giving as a couple
              </label>
              {asCouple ? (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Spouse / partner first name" required error={errors.spouseFirstName}>
                    <Input name="spouseFirstName" />
                  </Field>
                  <Field label="Spouse / partner last name" required>
                    <Input name="spouseLastName" />
                  </Field>
                </div>
              ) : null}
            </div>
          ) : null}

          <details className="group mt-5 rounded-2xl border border-slate-200 p-4" open={false}>
            <summary className="cursor-pointer list-none text-sm font-medium text-slate-700">
              <span className="group-open:hidden">+ Add mailing address</span>
              <span className="hidden group-open:inline">Mailing address</span> <span className="font-normal text-slate-400">(optional, for printed receipts)</span>
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-6">
              <Field label="Street address" className="sm:col-span-6">
                <Input name="address1" autoComplete="street-address" />
              </Field>
              <Field label="City" className="sm:col-span-3">
                <Input name="city" autoComplete="address-level2" />
              </Field>
              <Field label="State" className="sm:col-span-1">
                <Input name="state" defaultValue="CA" autoComplete="address-level1" />
              </Field>
              <Field label="ZIP" className="sm:col-span-2">
                <Input name="zip" autoComplete="postal-code" />
              </Field>
            </div>
          </details>

          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="anonymous" className="size-4 accent-brand-600" /> Keep my gift anonymous in public recognition
          </label>
        </section>

        {/* ── Step 3: dedication ── */}
        <section className={step === 2 ? "block" : "hidden"}>
          <h2 className="text-xl font-semibold text-slate-900">Make it meaningful</h2>
          <p className="mt-1 text-sm text-slate-500">All optional — skip ahead if you like.</p>

          <p className="mt-5 text-sm font-medium text-slate-700">Dedicate this gift</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              { v: "" as const, label: "No dedication" },
              { v: "HONOR" as const, label: "In honor of" },
              { v: "MEMORY" as const, label: "In memory of" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setDedication(o.v)}
                className={cn(
                  "rounded-xl border-2 py-2.5 text-sm font-medium transition",
                  dedication === o.v ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600 hover:border-brand-300",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          {dedication ? (
            <div className="mt-4 space-y-4 rounded-2xl bg-slate-50 p-4">
              <Field label={dedication === "MEMORY" ? "In memory of" : "In honor of"} required error={errors.dedicationName}>
                <Input name="dedicationName" placeholder="Full name" />
              </Field>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 accent-brand-600" />
                Send an email to let someone know (amount stays private)
              </label>
              {notify ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Recipient name" required error={errors.notifyName}>
                    <Input name="notifyName" />
                  </Field>
                  <Field label="Recipient email" required error={errors.notifyEmail}>
                    <Input name="notifyEmail" type="email" />
                  </Field>
                  <Field label="Personal message" className="sm:col-span-2">
                    <Textarea name="notifyMessage" rows={3} />
                  </Field>
                </div>
              ) : null}
            </div>
          ) : null}

          <label className="mt-6 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={matching} onChange={(e) => setMatching(e.target.checked)} className="size-4 accent-brand-600" />
            My employer matches charitable gifts
          </label>
          {matching ? (
            <Field label="Employer name" className="mt-3">
              <Input name="matchingEmployer" />
            </Field>
          ) : null}

          <Field label="Comments" className="mt-5">
            <Textarea name="comments" rows={3} placeholder="Anything you'd like us to know?" />
          </Field>
        </section>

        {/* ── Step 4: review ── */}
        <section className={step === 3 ? "block" : "hidden"}>
          <h2 className="text-xl font-semibold text-slate-900">Review your gift</h2>
          <div className="mt-5 rounded-2xl bg-brand-50/60 p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-600">{FREQS.find((f) => f.value === frequency)?.label} gift</span>
              <span className="text-3xl font-semibold text-brand-800">
                {usd(totalCents)}
                <span className="text-base font-medium text-slate-500">{per}</span>
              </span>
            </div>
            <dl className="mt-4 space-y-1.5 border-t border-brand-100 pt-4 text-sm">
              <Row label="Gift" value={usd(amountCents)} />
              {feeCents ? <Row label="Processing fee (covered by you)" value={usd(feeCents)} /> : null}
              <Row label="Designation" value={fundName} />
              {p.campaign ? <Row label="Campaign" value={p.campaign.name} /> : null}
              <Row label="From" value={donorType === "BUSINESS" ? r.orgName : `${r.firstName ?? ""} ${r.lastName ?? ""}${asCouple ? ` & ${r.spouseFirstName ?? ""} ${r.spouseLastName ?? ""}` : ""}`} />
              <Row label="Receipt to" value={r.email} />
              {dedication ? <Row label={dedication === "MEMORY" ? "In memory of" : "In honor of"} value={r.dedicationName} /> : null}
              {r.matchingEmployer ? <Row label="Employer match" value={r.matchingEmployer} /> : null}
            </dl>
          </div>

          {p.mode === "demo" ? (
            <Notice tone="amber" className="mt-5">
              <strong>Demo mode:</strong> no payment provider is connected yet, so no card will be charged. The gift will be recorded as a test transaction.
            </Notice>
          ) : (
            <p className="mt-5 flex items-center gap-2 text-sm text-slate-500">
              <Lock className="size-4" /> You&apos;ll enter your card, Apple Pay, Google Pay or bank details on Stripe&apos;s secure page.
            </p>
          )}
        </section>

        {/* Nav */}
        <div className="mt-8 flex items-center justify-between gap-3">
          {step > 0 ? (
            <button type="button" onClick={back} className={buttonClass("ghost", "lg")}>
              <ChevronLeft className="size-4" /> Back
            </button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <button key="next" type="button" onClick={next} className={buttonClass("primary", "lg", "min-w-40 rounded-full")}>
              {step === 0 && amount ? `Continue with ${usd(totalCents)}${per}` : step === 2 ? "Review gift" : "Continue"}
            </button>
          ) : (
            <SubmitButton key="submit" pending={pending} size="lg" className="min-w-48 rounded-full" pendingText={p.mode === "demo" ? "Recording gift…" : "Opening secure checkout…"}>
              <Heart className="size-4 fill-current" /> {p.mode === "demo" ? "Complete gift" : "Continue to payment"}
            </SubmitButton>
          )}
        </div>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value || "—"}</dd>
    </div>
  );
}
