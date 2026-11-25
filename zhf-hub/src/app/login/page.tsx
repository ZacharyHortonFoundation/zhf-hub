import { redirect } from "next/navigation";
import Link from "next/link";
import { checkPassword, getStaff, startStaffSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Logo } from "@/components/logo";
import { Field, Input, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";
import { str } from "@/lib/utils";
import { clearFailures, isLocked, recordFailure } from "@/lib/login-throttle";

export const metadata = { title: "Staff sign in" };

async function login(formData: FormData) {
  "use server";
  const email = str(formData.get("email")).toLowerCase();
  const password = str(formData.get("password"));
  const next = str(formData.get("next")) || "/admin";
  if (email && (await isLocked("staff", email))) redirect(`/login?error=locked&next=${encodeURIComponent(next)}`);
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await checkPassword(password, user.passwordHash))) {
    if (email) await recordFailure("staff", email);
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  await clearFailures("staff", email);
  await startStaffSession(user);
  redirect(next.startsWith("/admin") ? next : "/admin");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  if (await getStaff()) redirect("/admin");
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand-800 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(114,147,178,.55),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(245,184,63,.25),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Logo light className="h-16 self-start" />
          <div>
            <p className="text-3xl font-semibold leading-tight">
              Every donor, volunteer and event —<br />in one place.
            </p>
            <p className="mt-4 max-w-md text-brand-100">
              ZHF Hub brings fundraising, events and volunteer management together so the team can spend less time on admin and more time on the mission.
            </p>
          </div>
          <p className="text-sm text-brand-200">Breaking the Stigma of Addiction</p>
        </div>
      </div>
      <div className="flex items-center justify-center bg-cream px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo className="h-14" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Staff sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Use your ZHF Hub account.</p>
          {sp.error ? (
            <Notice tone="red" className="mt-6">
              {sp.error === "locked"
                ? "Too many failed attempts. For security this account is locked for 15 minutes."
                : "That email and password don’t match an active account."}
            </Notice>
          ) : null}
          <form action={login} className="mt-6 space-y-4">
            <input type="hidden" name="next" value={sp.next ?? "/admin"} />
            <Field label="Email">
              <Input name="email" type="email" autoComplete="email" required autoFocus />
            </Field>
            <Field label="Password">
              <Input name="password" type="password" autoComplete="current-password" required />
            </Field>
            <SubmitButton className="w-full" size="lg" pendingText="Signing in…">
              Sign in
            </SubmitButton>
          </form>
          <p className="mt-8 text-center text-sm text-slate-500">
            Looking to donate or volunteer?{" "}
            <Link href="/" className="font-medium text-brand-700 hover:underline">
              Go to the public site
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
