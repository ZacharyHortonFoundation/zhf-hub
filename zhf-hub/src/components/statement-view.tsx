import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { METHOD_LABEL } from "@/lib/constants";
import { fmtDate, fullName, money } from "@/lib/utils";
import { Logo } from "@/components/logo";

/** Printable annual giving statement (tax receipt summary). */
export async function StatementView({ contactId, year }: { contactId: string; year: number }) {
  const [c, settings] = await Promise.all([db.contact.findUnique({ where: { id: contactId } }), getSettings()]);
  if (!c) return null;
  const gifts = await db.donation.findMany({
    where: { contactId, status: "SUCCEEDED", receivedAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
    orderBy: { receivedAt: "asc" },
    include: { fund: true, eventOrder: { select: { id: true } } },
  });
  const total = gifts.reduce((a, g) => a + g.amountCents, 0);

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-10 shadow-sm print:border-0 print:p-0 print:shadow-none">
      <div className="flex items-start justify-between border-b border-slate-200 pb-6">
        <div>
          <Logo className="h-14" />
          <div className="mt-3">
            <p className="text-xs text-slate-500">{settings.address}</p>
            <p className="text-xs text-slate-500">
              {settings.phone} · {settings.email}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Giving statement</p>
          <p className="text-3xl font-semibold text-slate-900">{year}</p>
          {!settings.ein.includes("X") ? <p className="text-xs text-slate-500">EIN {settings.ein}</p> : null}
        </div>
      </div>

      <div className="mt-6 flex justify-between gap-6 text-sm">
        <div>
          <p className="font-semibold text-slate-900">{fullName(c)}</p>
          {c.type !== "BUSINESS" && c.spouseFirstName ? <p className="text-slate-600">& {c.spouseFirstName} {c.spouseLastName}</p> : null}
          {c.address1 ? (
            <p className="text-slate-600">
              {c.address1}
              <br />
              {c.city}, {c.state} {c.zip}
            </p>
          ) : null}
        </div>
        <div className="text-right text-slate-600">
          <p>Constituent #{c.constituentNo}</p>
          <p>Issued {fmtDate(new Date())}</p>
        </div>
      </div>

      <p className="mt-8 text-sm leading-relaxed text-slate-700">
        Dear {c.firstName || c.orgName || "friend"}, thank you for your generous support of the {settings.orgName} in {year}. Below is a summary of your
        tax-deductible contributions for your records.
      </p>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2">Date</th>
            <th className="py-2">Receipt #</th>
            <th className="py-2">Designation</th>
            <th className="py-2">Method</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {gifts.map((g) => (
            <tr key={g.id} className="border-b border-slate-100">
              <td className="py-2">{fmtDate(g.receivedAt)}</td>
              <td className="py-2">{g.number}</td>
              <td className="py-2">
                {g.fund?.name ?? "General Fund"}
                {g.method === "IN_KIND" ? <span className="block text-xs text-slate-500">In-kind: {g.inKindDescription}</span> : null}
              </td>
              <td className="py-2">{METHOD_LABEL[g.method] ?? g.method}</td>
              <td className="py-2 text-right font-medium">{money(g.amountCents, { decimals: true })}</td>
            </tr>
          ))}
          {!gifts.length ? (
            <tr>
              <td colSpan={5} className="py-6 text-center text-slate-500">
                No contributions recorded for {year}.
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="pt-4 text-right font-semibold text-slate-900">
              Total {year} contributions
            </td>
            <td className="pt-4 text-right text-lg font-semibold text-slate-900">{money(total, { decimals: true })}</td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-10 border-t border-slate-200 pt-6 text-xs leading-relaxed text-slate-500">{settings.receiptFooter}</p>
    </div>
  );
}
