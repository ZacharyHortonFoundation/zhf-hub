import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, HeartHandshake, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { getVolunteer } from "@/lib/auth";
import { ApplyWizard } from "@/components/volunteer/apply-wizard";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Volunteer application" };

export default async function ApplyPage() {
  const vol = await getVolunteer();
  if (vol) {
    const c = await db.contact.findUnique({ where: { id: vol.contactId }, select: { volunteerStatus: true } });
    if (c && (c.volunteerStatus === "APPROVED" || c.volunteerStatus === "PENDING")) {
      redirect("/volunteer/portal?ok=" + encodeURIComponent("You've already applied — here's your portal."));
    }
  }
  const [skills, settings] = await Promise.all([
    db.skill.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSettings(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="rounded-3xl border border-sand bg-white p-6 shadow-sm sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-500">Join us as a volunteer</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-900">Volunteer application</h1>
          <p className="mt-2 text-slate-600">Fill out the form below to join our volunteer community. We&apos;ll get in touch with you soon!</p>
          <div className="mt-8">
            <ApplyWizard skills={skills} privacyUrl={settings.privacyPolicyUrl} />
          </div>
        </div>
        <aside className="space-y-4">
          {[
            { icon: <Clock className="size-5" />, title: "Takes about 3 minutes", text: "Three short steps — your info, your interests, and a quick review." },
            { icon: <HeartHandshake className="size-5" />, title: "We'll match you", text: "Our coordinator reviews every application and will reach out within a few days." },
            { icon: <ShieldCheck className="size-5" />, title: "Your privacy matters", text: "We only use your information to coordinate volunteering. We never sell or share it." },
          ].map((c) => (
            <div key={c.title} className="flex gap-4 rounded-2xl bg-white/70 p-5 ring-1 ring-sand">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">{c.icon}</span>
              <div>
                <p className="font-semibold text-slate-900">{c.title}</p>
                <p className="mt-0.5 text-sm text-slate-600">{c.text}</p>
              </div>
            </div>
          ))}
          <p className="px-2 text-sm text-slate-500">
            Already a volunteer?{" "}
            <Link href="/volunteer/login" className="font-medium text-brand-700 hover:underline">
              Sign in
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
