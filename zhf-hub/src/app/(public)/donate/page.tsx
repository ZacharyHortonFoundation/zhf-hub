import { HeartHandshake, Lock, Receipt, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { paymentsMode } from "@/lib/payments";
import { DonateWizard } from "@/components/donate/donate-wizard";
import { Notice, Progress } from "@/components/ui";
import { money, pct } from "@/lib/utils";

export const metadata = { title: "Donate" };
export const dynamic = "force-dynamic";

const FAQ = [
  { q: "Is my donation tax-deductible?", a: "Yes. The Zachary Horton Foundation is a 501(c)(3) nonprofit, and your gift is tax-deductible to the extent allowed by law. You'll receive an email receipt immediately." },
  { q: "How is my donation used?", a: "Gifts fund street outreach and Narcan distribution, care packages for sober-living homes, recovery support scholarships, family support, and community education such as our Recovery Summit and Mental Health Symposium." },
  { q: "Can I give in memory of someone?", a: "Absolutely. In step 3 choose \"In memory of\" or \"In honor of\", and we can send a note to their family (the amount is never shared)." },
  { q: "Can I change or cancel a monthly gift?", a: "Any time — just reply to any receipt email or call us, and we'll update it right away." },
  { q: "Is my payment information secure?", a: "Payments are processed by Stripe, a PCI Level 1 certified provider. Your card number never touches our servers." },
];

export default async function DonatePage({ searchParams }: { searchParams: Promise<{ campaign?: string; amount?: string; frequency?: string; canceled?: string }> }) {
  const sp = await searchParams;
  const [settings, funds, campaign] = await Promise.all([
    getSettings(),
    db.fund.findMany({ where: { active: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    sp.campaign ? db.campaign.findUnique({ where: { slug: sp.campaign } }) : null,
  ]);
  const raised =
    campaign?.goalCents
      ? (await db.donation.aggregate({ where: { campaignId: campaign.id, status: "SUCCEEDED" }, _sum: { amountCents: true } }))._sum.amountCents ?? 0
      : 0;
  const freq = ["ONE_TIME", "MONTHLY", "QUARTERLY", "ANNUAL"].includes(sp.frequency ?? "") ? sp.frequency! : "ONE_TIME";
  const amt = sp.amount ? Number(sp.amount) : null;

  return (
    <div>
      <section className="relative overflow-hidden bg-brand-800">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(114,147,178,.6),transparent_55%),radial-gradient(circle_at_100%_100%,rgba(245,184,63,.18),transparent_45%)]" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-12 sm:px-6 lg:grid-cols-[1fr_1.35fr] lg:pt-16">
        <div className="text-white lg:pt-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-200">Donate</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight">{settings.donateHeadline}</h1>
          <p className="mt-4 text-lg leading-relaxed text-brand-100">{settings.donateIntro}</p>

          {campaign?.goalCents ? (
            <div className="mt-8 rounded-2xl bg-white/10 p-5 ring-1 ring-white/20">
              <p className="text-sm font-medium">{campaign.name}</p>
              <p className="mt-2 text-2xl font-semibold">
                {money(raised, { decimals: false })} <span className="text-base font-normal text-brand-200">of {money(campaign.goalCents, { decimals: false })}</span>
              </p>
              <Progress value={pct(raised, campaign.goalCents)} tone="accent" className="mt-3 bg-white/15" />
            </div>
          ) : null}

          <ul className="mt-10 hidden space-y-5 lg:block">
            {[
              { icon: <ShieldCheck className="size-5" />, t: "Secure & encrypted", d: "Processed by Stripe — we never store card numbers." },
              { icon: <Receipt className="size-5" />, t: "Instant tax receipt", d: "Emailed the moment your gift is complete." },
              { icon: <HeartHandshake className="size-5" />, t: "Stays local", d: "Supporting young adults and families in the Central Valley." },
            ].map((x) => (
              <li key={x.t} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-accent ring-1 ring-white/15">{x.icon}</span>
                <div>
                  <p className="font-semibold text-white">{x.t}</p>
                  <p className="text-sm text-brand-200">{x.d}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          {sp.canceled ? (
            <Notice tone="amber" className="mb-4">
              Your payment was canceled — no charge was made. You can try again below.
            </Notice>
          ) : null}
          <DonateWizard
            presetAmounts={settings.presetAmounts}
            funds={funds.map((f) => ({ id: f.id, name: f.name, description: f.description }))}
            defaultFundId={funds.find((f) => f.isDefault)?.id ?? funds[0]?.id ?? null}
            campaign={campaign ? { slug: campaign.slug, name: campaign.name } : null}
            initialFrequency={freq}
            initialAmount={amt && amt >= 5 ? amt : null}
            fee={{ percent: settings.feePercent, fixedCents: settings.feeFixedCents }}
            mode={paymentsMode()}
            orgName={settings.orgName}
            privacyUrl={settings.privacyPolicyUrl}
          />
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-brand-200">
            <Lock className="size-3.5" /> 256-bit encrypted · {settings.orgName} is a 501(c)(3) nonprofit
          </p>
        </div>
      </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-6 pt-10 sm:px-6">
        <h2 className="text-center text-2xl font-semibold text-slate-900">Frequently asked questions</h2>
        <div className="mt-6 divide-y divide-slate-200 rounded-2xl border border-sand bg-white">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-slate-900">
                {f.q}
                <span className="text-xl text-slate-400 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
