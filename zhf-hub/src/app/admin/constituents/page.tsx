import Link from "next/link";
import { Download, Plus, Search, Users } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { buildContactWhere } from "@/lib/queries";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { Avatar, Badge, Card, EmptyState, Input, LinkButton, PageHeader, Pagination, Table, TD, TH, THead, TR } from "@/components/ui";
import { AutoSubmitSelect } from "@/components/client-ui";
import { fmtDate, fullName, money } from "@/lib/utils";

export const metadata = { title: "Constituents" };
export const dynamic = "force-dynamic";

const PAGE = 25;
const FILTERS = [
  { v: "", label: "Everyone" },
  { v: "donors", label: "All donors" },
  { v: "donors-ytd", label: "Gave this year" },
  { v: "lybunt", label: "LYBUNT — gave last year, not this year" },
  { v: "sybunt", label: "SYBUNT — gave before, not this year" },
  { v: "recurring", label: "Recurring donors" },
  { v: "volunteers", label: "Volunteers (approved)" },
  { v: "never", label: "Never given" },
  { v: "vip", label: "VIP" },
  { v: "business", label: "Businesses & organizations" },
];

export default async function Constituents({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; level?: string; tag?: string; sort?: string; page?: string }>;
}) {
  await requireStaff();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const where = buildContactWhere(sp);
  const orderBy: Prisma.ContactOrderByWithRelationInput[] =
    sp.sort === "lifetime"
      ? [{ lifetimeCents: "desc" }]
      : sp.sort === "recent"
        ? [{ lastGiftAt: { sort: "desc", nulls: "last" } }]
        : sp.sort === "newest"
          ? [{ createdAt: "desc" }]
          : [{ lastName: "asc" }, { firstName: "asc" }];

  const [rows, total, tags, levels] = await Promise.all([
    db.contact.findMany({ where, orderBy, skip: (page - 1) * PAGE, take: PAGE, include: { tags: true } }),
    db.contact.count({ where }),
    db.tag.findMany({ orderBy: { name: "asc" } }),
    db.donorLevel.findMany({ orderBy: { rank: "asc" } }),
  ]);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Constituents"
        description={`${total.toLocaleString()} ${total === 1 ? "person or organization" : "people & organizations"} — donors, attendees and volunteers in one place`}
        actions={
          <>
            <LinkButton href={`/admin/constituents/export${qs({ page: undefined })}`} variant="outline" prefetch={false}>
              <Download className="size-4" /> Export CSV
            </LinkButton>
            <LinkButton href="/admin/constituents/new">
              <Plus className="size-4" /> New constituent
            </LinkButton>
          </>
        }
      />

      <Card>
        <form className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={sp.q} placeholder="Search name, email, phone or constituent #" className="pl-9" />
          </div>
          <AutoSubmitSelect name="filter" defaultValue={sp.filter ?? ""} className="lg:w-64">
            {FILTERS.map((f) => (
              <option key={f.v} value={f.v}>
                {f.label}
              </option>
            ))}
          </AutoSubmitSelect>
          <AutoSubmitSelect name="level" defaultValue={sp.level ?? ""} className="lg:w-36">
            <option value="">Any level</option>
            {levels.map((l) => (
              <option key={l.id} value={l.name}>
                {l.name}
              </option>
            ))}
          </AutoSubmitSelect>
          <AutoSubmitSelect name="tag" defaultValue={sp.tag ?? ""} className="lg:w-44">
            <option value="">Any tag</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </AutoSubmitSelect>
          <AutoSubmitSelect name="sort" defaultValue={sp.sort ?? ""} className="lg:w-40">
            <option value="">Sort: Name</option>
            <option value="lifetime">Sort: Lifetime giving</option>
            <option value="recent">Sort: Last gift</option>
            <option value="newest">Sort: Newest</option>
          </AutoSubmitSelect>
        </form>

        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH className="hidden md:table-cell">Contact</TH>
                <TH>Level</TH>
                <TH className="text-right">Lifetime</TH>
                <TH className="hidden lg:table-cell">Last gift</TH>
                <TH className="hidden xl:table-cell">Roles</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/admin/constituents/${c.id}`} className="flex items-center gap-3">
                      <Avatar name={fullName(c)} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900 hover:text-brand-700">
                          {fullName(c)}
                          {c.isVip ? <span className="ml-1.5 text-accent-600">★</span> : null}
                        </span>
                        <span className="block text-xs text-slate-400">
                          #{c.constituentNo}
                          {c.type === "BUSINESS" ? ` · ${c.firstName} ${c.lastName}` : c.spouseFirstName ? ` · & ${c.spouseFirstName}` : ""}
                        </span>
                      </span>
                    </Link>
                  </TD>
                  <TD className="hidden md:table-cell">
                    <span className="block truncate text-slate-700">{c.email ?? "—"}</span>
                    <span className="block text-xs text-slate-400">{c.phone ?? ""}</span>
                  </TD>
                  <TD>{c.donorLevel ? <Badge tone="blue">{c.donorLevel}</Badge> : <span className="text-slate-300">—</span>}</TD>
                  <TD className="text-right font-medium text-slate-900">{c.lifetimeCents ? money(c.lifetimeCents) : "—"}</TD>
                  <TD className="hidden lg:table-cell text-slate-500">{fmtDate(c.lastGiftAt)}</TD>
                  <TD className="hidden xl:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {c.giftCount ? <Badge tone="green">Donor</Badge> : null}
                      {c.volunteerStatus === "APPROVED" ? <Badge tone="teal">Volunteer</Badge> : c.volunteerStatus === "PENDING" ? <Badge tone="amber">Applicant</Badge> : null}
                      {c.tags.slice(0, 2).map((t) => (
                        <Badge key={t.id} tone="gray">
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Users className="size-5" />} title="No constituents match" description="Try a different search or filter." />
        )}
        <Pagination page={page} pageCount={Math.ceil(total / PAGE)} makeHref={(p) => qs({ page: String(p) })} />
      </Card>
    </>
  );
}
