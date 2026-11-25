import { redirect } from "next/navigation";
import { Field, Input, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";
import { readPasswordToken } from "@/lib/portal-password";
import { setPortalPassword } from "../../actions";

export const metadata = { title: "Choose a password", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SetPassword({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ err?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const p = await readPasswordToken(token);
  if (!p) redirect("/volunteer/reset?expired=1");
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="rounded-3xl border border-sand bg-white p-8 shadow-xl shadow-brand-900/5">
        <h1 className="text-2xl font-semibold text-slate-900">Hi {p.contact.firstName || "there"} — choose a password</h1>
        <p className="mt-1 text-sm text-slate-500">You&apos;ll sign in with {p.contact.email} and this password.</p>
        {sp.err ? (
          <Notice tone="red" className="mt-5">
            {sp.err}
          </Notice>
        ) : null}
        <form action={setPortalPassword.bind(null, token)} className="mt-6 space-y-4">
          <Field label="New password" hint="At least 8 characters">
            <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Confirm password">
            <Input name="password2" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <SubmitButton className="w-full" size="lg" pendingText="Saving…">
            Save & open my portal
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
