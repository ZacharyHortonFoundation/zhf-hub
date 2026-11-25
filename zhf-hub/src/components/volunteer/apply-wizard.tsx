"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { applyAction, type ApplyState } from "@/app/(public)/volunteer/actions";
import { cn } from "@/lib/utils";
import { submitNoReset } from "@/components/client-ui";

const STEPS = ["Your info", "Skills & interests", "Review"];
const AVAILABILITY = ["Weekday mornings", "Weekday afternoons", "Weekday evenings", "Weekends", "Flexible"];

type Skill = { id: string; name: string };

const inputCls =
  "block h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100";

function FieldBox({ label, name, error, required, children }: { label: string; name: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function Chip({ name, value, label, checked, onChange }: { name: string; value: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition",
        checked ? "border-brand-600 bg-brand-700 text-white shadow-sm" : "border-slate-300 bg-white text-slate-700 hover:border-brand-400 hover:bg-brand-50",
      )}
    >
      <input type="checkbox" name={name} value={value} checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" aria-label={label} />
      {checked ? <Check className="size-3.5" /> : null}
      {label}
    </label>
  );
}

export function ApplyWizard({ skills }: { skills: Skill[] }) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyAction, {});
  const [step, setStep] = useState(1);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [vals, setVals] = useState<Record<string, string>>({});
  const [interest, setInterest] = useState<Set<string>>(new Set());
  const [experience, setExperience] = useState<Set<string>>(new Set());
  const [availability, setAvailability] = useState<Set<string>>(new Set());
  const formRef = useRef<HTMLFormElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Jump to the step with the first server-side error
  useEffect(() => {
    if (state.step) setStep(state.step);
  }, [state]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  const errors = { ...state.errors, ...clientErrors };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setVals((v) => ({ ...v, [k]: e.target.value }));
  const toggle = (setFn: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => (on: boolean) =>
    setFn((prev) => {
      const n = new Set(prev);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  function validate(s: number) {
    const e: Record<string, string> = {};
    const v = (k: string) => (vals[k] ?? "").trim();
    if (s === 1) {
      if (!v("firstName")) e.firstName = "First name is required";
      if (!v("lastName")) e.lastName = "Last name is required";
      if (!/^\S+@\S+\.\S+$/.test(v("email"))) e.email = "Enter a valid email address";
      if (!v("emergencyName")) e.emergencyName = "Emergency contact name is required";
      if (v("emergencyPhone").replace(/\D/g, "").length < 7) e.emergencyPhone = "Emergency contact phone is required";
    }
    if (s === 2) {
      if ((vals.password ?? "").length < 8) e.password = "Use at least 8 characters";
      else if (vals.password !== vals.password2) e.password2 = "Passwords don't match";
    }
    setClientErrors(e);
    return Object.keys(e).length === 0;
  }

  const next = () => {
    if (validate(step)) setStep((s) => Math.min(3, s + 1));
  };
  const back = () => {
    setClientErrors({});
    setStep((s) => Math.max(1, s - 1));
  };

  const skillName = (id: string) => skills.find((s) => s.id === id)?.name ?? "";

  return (
    <div ref={topRef} className="scroll-mt-24">
      {/* Stepper */}
      <ol className="mb-8 flex items-center gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = step > n;
          const active = step === n;
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold transition",
                  done ? "bg-emerald-500 text-white" : active ? "bg-brand-700 text-white ring-4 ring-brand-100" : "bg-slate-200 text-slate-500",
                )}
              >
                {done ? <Check className="size-4" /> : n}
              </span>
              <span className={cn("hidden text-sm font-medium sm:block", active ? "text-slate-900" : "text-slate-500")}>{label}</span>
              {n < STEPS.length ? <span className={cn("h-0.5 flex-1 rounded-full", done ? "bg-emerald-400" : "bg-slate-200")} /> : null}
            </li>
          );
        })}
      </ol>

      {state.message ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {state.message}{" "}
          {state.errors?.email?.includes("already") ? (
            <Link href="/volunteer/login" className="font-semibold underline">
              Sign in
            </Link>
          ) : null}
        </div>
      ) : null}

      <form ref={formRef} onSubmit={submitNoReset(action)} noValidate>
        {/* Step 1 */}
        <section className={cn(step !== 1 && "hidden")}>
          <h2 className="text-lg font-semibold text-slate-900">General information</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldBox label="First name" name="firstName" error={errors.firstName} required>
              <input id="firstName" name="firstName" autoComplete="given-name" className={inputCls} value={vals.firstName ?? ""} onChange={set("firstName")} />
            </FieldBox>
            <FieldBox label="Last name" name="lastName" error={errors.lastName} required>
              <input id="lastName" name="lastName" autoComplete="family-name" className={inputCls} value={vals.lastName ?? ""} onChange={set("lastName")} />
            </FieldBox>
            <FieldBox label="Email" name="email" error={errors.email} required>
              <input id="email" name="email" type="email" autoComplete="email" className={inputCls} value={vals.email ?? ""} onChange={set("email")} />
            </FieldBox>
            <FieldBox label="Phone" name="phone" error={errors.phone}>
              <input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="(559) 555-0123" className={inputCls} value={vals.phone ?? ""} onChange={set("phone")} />
            </FieldBox>
          </div>
          <h2 className="mt-8 text-lg font-semibold text-slate-900">Emergency contact</h2>
          <p className="text-sm text-slate-500">Someone we can reach if anything happens while you&apos;re volunteering.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldBox label="Contact name" name="emergencyName" error={errors.emergencyName} required>
              <input id="emergencyName" name="emergencyName" className={inputCls} value={vals.emergencyName ?? ""} onChange={set("emergencyName")} />
            </FieldBox>
            <FieldBox label="Contact phone" name="emergencyPhone" error={errors.emergencyPhone} required>
              <input id="emergencyPhone" name="emergencyPhone" type="tel" className={inputCls} value={vals.emergencyPhone ?? ""} onChange={set("emergencyPhone")} />
            </FieldBox>
            <FieldBox label="Contact email" name="emergencyEmail" error={errors.emergencyEmail}>
              <input id="emergencyEmail" name="emergencyEmail" type="email" className={inputCls} value={vals.emergencyEmail ?? ""} onChange={set("emergencyEmail")} />
            </FieldBox>
          </div>
        </section>

        {/* Step 2 */}
        <section className={cn(step !== 2 && "hidden")}>
          <h2 className="text-lg font-semibold text-slate-900">What would you like to help with?</h2>
          <p className="text-sm text-slate-500">Pick as many as you like — this helps us match you with the right opportunities.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {skills.map((s) => (
              <Chip key={s.id} name="interest" value={s.id} label={s.name} checked={interest.has(s.id)} onChange={toggle(setInterest, s.id)} />
            ))}
          </div>
          <h3 className="mt-8 font-semibold text-slate-900">Where do you already have experience?</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {skills.map((s) => (
              <Chip key={s.id} name="experience" value={s.id} label={s.name} checked={experience.has(s.id)} onChange={toggle(setExperience, s.id)} />
            ))}
          </div>
          <h3 className="mt-8 font-semibold text-slate-900">When are you usually available?</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {AVAILABILITY.map((a) => (
              <Chip key={a} name="availability" value={a} label={a} checked={availability.has(a)} onChange={toggle(setAvailability, a)} />
            ))}
          </div>
          <div className="mt-8">
            <FieldBox label="Why do you want to volunteer with ZHF? (optional)" name="motivation" error={errors.motivation}>
              <textarea
                id="motivation"
                name="motivation"
                rows={4}
                className={cn(inputCls, "h-auto py-2.5")}
                value={vals.motivation ?? ""}
                onChange={set("motivation")}
                placeholder="Share as much or as little as you like."
              />
            </FieldBox>
          </div>
          <h3 className="mt-8 font-semibold text-slate-900">Create your volunteer portal password</h3>
          <p className="text-sm text-slate-500">You&apos;ll use your email and this password to sign up for shifts and log your hours.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldBox label="Password" name="password" error={errors.password} required>
              <input id="password" name="password" type="password" autoComplete="new-password" className={inputCls} value={vals.password ?? ""} onChange={set("password")} />
            </FieldBox>
            <FieldBox label="Confirm password" name="password2" error={errors.password2} required>
              <input id="password2" type="password" autoComplete="new-password" className={inputCls} value={vals.password2 ?? ""} onChange={set("password2")} />
            </FieldBox>
          </div>
        </section>

        {/* Step 3 */}
        <section className={cn(step !== 3 && "hidden")}>
          <h2 className="text-lg font-semibold text-slate-900">Review your application</h2>
          <dl className="mt-4 grid gap-4 rounded-2xl bg-slate-50 p-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Name</dt>
              <dd className="mt-0.5 text-slate-900">{`${vals.firstName ?? ""} ${vals.lastName ?? ""}`.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Email / phone</dt>
              <dd className="mt-0.5 text-slate-900">
                {vals.email || "—"}
                {vals.phone ? ` · ${vals.phone}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Emergency contact</dt>
              <dd className="mt-0.5 text-slate-900">
                {vals.emergencyName || "—"}
                {vals.emergencyPhone ? ` · ${vals.emergencyPhone}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Availability</dt>
              <dd className="mt-0.5 text-slate-900">{[...availability].join(", ") || "Not specified"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Interested in</dt>
              <dd className="mt-0.5 text-slate-900">{[...interest].map(skillName).join(", ") || "Not specified"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Experience</dt>
              <dd className="mt-0.5 text-slate-900">{[...experience].map(skillName).join(", ") || "Not specified"}</dd>
            </div>
            {vals.motivation ? (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Why ZHF</dt>
                <dd className="mt-0.5 whitespace-pre-line text-slate-900">{vals.motivation}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-6 space-y-3">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="over18" className="mt-0.5 size-4 accent-brand-600" />
              <span>
                <span className="font-medium text-slate-800">I am 18 years of age or older.</span>
                <span className="block text-slate-500">Under 18? Please contact us — youth volunteers are welcome with a guardian consent form.</span>
                {errors.over18 ? <span className="block text-xs text-red-600">{errors.over18}</span> : null}
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="waiver" className="mt-0.5 size-4 accent-brand-600" />
              <span>
                <span className="font-medium text-slate-800">I agree to the volunteer waiver and code of conduct.</span>
                <span className="block text-slate-500">
                  I understand volunteering is unpaid, I will follow staff instructions, respect the privacy of the people we serve, and I release the Zachary Horton Foundation
                  from liability for injuries that are not caused by its negligence.
                </span>
                {errors.waiver ? <span className="block text-xs text-red-600">{errors.waiver}</span> : null}
              </span>
            </label>
          </div>
        </section>

        <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-6">
          {step > 1 ? (
            <button type="button" onClick={back} className="inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-medium text-slate-700 hover:bg-slate-100">
              <ChevronLeft className="size-4" /> Back
            </button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <button key="next" type="button" onClick={next} className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-brand-700 px-6 text-sm font-medium text-white shadow-sm hover:bg-brand-800">
              Continue <ChevronRight className="size-4" />
            </button>
          ) : (
            <button
              key="submit"
              type="submit"
              disabled={pending}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-ink shadow-sm hover:bg-accent-600 disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {pending ? "Submitting…" : "Submit application"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
