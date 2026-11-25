import Link from "next/link";
import { redirect } from "next/navigation";
import { HandHeart } from "lucide-react";
import { getVolunteer } from "@/lib/auth";
import { Field, Input, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";
import { volunteerLogin } from "../actions";

export const metadata = { title: "Volunteer sign in" };

export default async function VolunteerLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/volunteer") ? sp.next : "/volunteer/portal";
  if (await getVolunteer()) redirect(next);

  return (
    <div className="mx-auto flex max-w-6xl justify-center px-4 py-16 sm:px-6">
      <div className="w-full max-w-md rounded-3xl border border-sand bg-white p-8 shadow-sm sm:p-10">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
          <HandHeart className="size-6" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold text-slate-900">Volunteer sign in</h1>
        <p className="mt-1 text-sm text-slate-500">Sign up for shifts, log your hours and see your badges.</p>
        {sp.error ? (
          <Notice tone="red" className="mt-6">
            {sp.error === "locked"
              ? "Too many failed attempts. Please wait 15 minutes, or use the set-password link below."
              : "That email and password don’t match a volunteer account."}
          </Notice>
        ) : null}
        <form action={volunteerLogin} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required autoFocus className="h-11" />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" required className="h-11" />
          </Field>
          <SubmitButton className="w-full rounded-full" size="lg" pendingText="Signing in…">
            Sign in
          </SubmitButton>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          New here?{" "}
          <Link href="/volunteer/apply" className="font-medium text-brand-700 hover:underline">
            Apply to volunteer
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-slate-500">
          First time signing in, or forgot your password?{" "}
          <Link href="/volunteer/reset" className="font-medium text-brand-700 hover:underline">
            Get a set-password link
          </Link>
        </p>
      </div>
    </div>
  );
}
