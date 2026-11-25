import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Field, Input, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";
import { requestPasswordLink } from "../actions";

export const metadata = { title: "Set your volunteer password" };

export default async function ResetRequest({ searchParams }: { searchParams: Promise<{ sent?: string; welcome?: string; expired?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="rounded-3xl border border-sand bg-white p-8 shadow-xl shadow-brand-900/5">
        {sp.sent ? (
          <div className="text-center">
            <MailCheck className="mx-auto size-12 text-brand-600" />
            <h1 className="mt-4 text-2xl font-semibold text-slate-900">{sp.welcome ? "Thanks — check your email" : "Check your email"}</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {sp.welcome
                ? "We already have you in our records, so we've emailed you a secure link to finish setting up your volunteer portal password."
                : "If that email belongs to a ZHF volunteer, a link to set your password is on its way. It works for 2 days."}
            </p>
            <Link href="/volunteer/login" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-slate-900">Set or reset your password</h1>
            <p className="mt-1 text-sm text-slate-500">Enter the email you volunteer with and we&apos;ll send you a secure link.</p>
            {sp.expired ? (
              <Notice tone="amber" className="mt-5">
                That link has expired or was already used. Request a new one below.
              </Notice>
            ) : null}
            <form action={requestPasswordLink} className="mt-6 space-y-4">
              <Field label="Email">
                <Input name="email" type="email" autoComplete="email" required />
              </Field>
              <SubmitButton className="w-full" size="lg" pendingText="Sending…">
                Email me a link
              </SubmitButton>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
