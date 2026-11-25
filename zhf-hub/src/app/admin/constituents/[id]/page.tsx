import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { CalendarClock, CheckCircle2, Circle, FileText, Mail, MapPin, Pencil, Phone, Plus, Repeat, StickyNote, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import {
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  Field,
  Input,
  LinkButton,
  PageHeader,
  Select,
  StatusBadge,
  Table,
  TD,
  TH,
  THead,
  TR,
  Textarea,
} from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/client-ui";
import { FREQ_LABEL, METHOD_LABEL } from "@/lib/constants";
import { cn, fmtDate, fmtDateTime, fullName, money } from "@/lib/utils";
import { addActivity, deleteActivity, deleteContact, mergeContact, sendVolunteerPortalLink, setTags, toggleActivity, toggleStewardship } from "../actions";
import { EventHistoryPanel } from "@/components/admin/event-history-panel";
import { VolunteerPanel } from "@/components/admin/volunteer-panel";

export const dynamic = "force-dynamic";

const TABS = [
  { k: "overview", label: "Overview" },
  { k: "giving", label: "Giving" },
  { k: "events", label: "Events" },
  { k: "volunteering", label: "Volunteering" },
  { k: "activity", label: "Notes & tasks" },
  { k: "emails", label: "Emails" },
];

const STEWARDSHIP = [
  { k: "sentThankYou", label: "Thank-you sent" },
  { k: "invitedToEvents", label: "Invited to events" },
  { k: "offeredMeeting", label: "Offered a meeting / tour" },
  { k: "sharedImpactStory", label: "Shared an impact story" },
  { k: "informedMonthly", label: "Told about monthly giving" },
] as const;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await db.contact.findUnique({ where: { id } });
  return { title: c ? fullName(c) : "Constituent" };
}

export default async function Profile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  const c = await db.contact.findUnique({
    where: { id },
    include: {
      tags: true,
      recurringPlans: { orderBy: { createdAt: "desc" }, include: { fund: true } },
      _count: { select: { donations: true, eventOrders: true, registrations: true, emails: true } },
    },
  });
  if (!c) notFound();

  const [allTags, activities, donations, emails, hoursAgg, years] = await Promise.all([
    db.tag.findMany({ orderBy: { name: "asc" } }),
    db.activity.findMany({ where: { contactId: id }, orderBy: { createdAt: "desc" }, include: { createdBy: true } }),
    db.donation.findMany({ where: { contactId: id }, orderBy: { receivedAt: "desc" }, include: { campaign: true, fund: true }, take: tab === "giving" ? 500 : 5 }),
    tab === "emails" ? db.emailLog.findMany({ where: { contactId: id }, orderBy: { createdAt: "desc" }, take: 100 }) : Promise.resolve([]),
    db.volunteerHour.aggregate({ where: { contactId: id, status: "APPROVED" }, _sum: { hours: true } }),
    db.donation.findMany({ where: { contactId: id, status: "SUCCEEDED" }, select: { receivedAt: true, amountCents: true } }),
  ]);
  const name = fullName(c);
  const tasks = activities.filter((a) => a.type === "TASK" && !a.done);
  const givingByYear = Object.entries(
    years.reduce<Record<string, number>>((acc, d) => {
      const y = String(d.receivedAt.getFullYear());
      acc[y] = (acc[y] ?? 0) + d.amountCents;
      return acc;
    }, {}),
  ).sort((a, b) => Number(b[0]) - Number(a[0]));
  const thisYear = new Date().getFullYear();

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Constituents", href: "/admin/constituents" }, { label: name }]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={name} size="lg" />
            <span>
              <span className="flex flex-wrap items-center gap-2">
                {name}
                {c.isVip ? <Badge tone="amber">★ VIP</Badge> : null}
                {c.donorLevel ? <Badge tone="blue">{c.donorLevel}</Badge> : null}
                {c.isDeceased ? <Badge tone="gray">Deceased</Badge> : null}
              </span>
              <span className="mt-0.5 block text-sm font-normal text-slate-500">
                #{c.constituentNo} · {c.type === "BUSINESS" ? `Contact: ${c.firstName} ${c.lastName}` : c.spouseFirstName ? `with ${c.spouseFirstName} ${c.spouseLastName ?? ""}` : "Individual"} · since {fmtDate(c.createdAt, "MMM yyyy")}
              </span>
            </span>
          </span>
        }
        actions={
          <>
            <LinkButton href={`/admin/donations/new?contact=${c.id}`} variant="outline">
              <Plus className="size-4" /> Record gift
            </LinkButton>
            <LinkButton href={`/admin/constituents/${c.id}/statement?year=${thisYear}`} variant="outline">
              <FileText className="size-4" /> Statement
            </LinkButton>
            <LinkButton href={`/admin/constituents/${c.id}/edit`}>
              <Pencil className="size-4" /> Edit
            </LinkButton>
          </>
        }
      />

      {/* Summary strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          { l: "Lifetime giving", v: money(c.lifetimeCents) },
          { l: "Gifts", v: c.giftCount },
          { l: "Largest gift", v: c.largestCents ? money(c.largestCents) : "—" },
          { l: "Last gift", v: fmtDate(c.lastGiftAt) },
          { l: `${thisYear} giving`, v: money(givingByYear.find(([y]) => y === String(thisYear))?.[1] ?? 0) },
          { l: "Volunteer hours", v: (hoursAgg._sum.hours ?? 0).toLocaleString() },
        ].map((s) => (
          <Card key={s.l} className="px-4 py-3">
            <p className="text-xs text-slate-500">{s.l}</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{s.v}</p>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="scroll-thin mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t.k}
            href={`?tab=${t.k}`}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition",
              tab === t.k ? "border-brand-600 text-brand-800" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
            {t.k === "activity" && tasks.length ? <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[10px] font-semibold">{tasks.length}</span> : null}
          </Link>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader title="Contact information" action={<LinkButton href={`/admin/constituents/${c.id}/edit`} variant="ghost" size="sm">Edit</LinkButton>} />
              <CardBody>
                <DescriptionList
                  items={[
                    { label: "Email", value: c.email ? <a href={`mailto:${c.email}`} className="text-brand-700 hover:underline">{c.email}</a> : "—" },
                    { label: "Phone", value: c.phone ? <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1"><Phone className="size-3.5 text-slate-400" />{c.phone}</a> : "—" },
                    { label: "Address", value: c.address1 ? <span className="inline-flex items-start gap-1"><MapPin className="mt-0.5 size-3.5 text-slate-400" />{c.address1}, {c.city}, {c.state} {c.zip}</span> : "—" },
                    { label: "Birthday", value: c.birthday ? format(c.birthday, "MMMM d") : "—" },
                    { label: "Source", value: c.source?.replace(/_/g, " ").toLowerCase() ?? "—" },
                    { label: "Communication", value: c.doNotEmail ? <Badge tone="red">Do not email</Badge> : "Email OK" },
                    ...(c.taxId ? [{ label: "Tax ID", value: c.taxId }] : []),
                    ...(c.legacyId ? [{ label: "Dynamics ID", value: <span className="font-mono text-xs">{c.legacyId}</span> }] : []),
                  ]}
                />
                {c.notes ? <p className="mt-5 whitespace-pre-line rounded-xl bg-slate-50 p-4 text-sm text-slate-700">{c.notes}</p> : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Recent gifts" action={<LinkButton href="?tab=giving" variant="ghost" size="sm">All giving →</LinkButton>} />
              <DonationTable rows={donations} />
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader title="Stewardship" description="Click to toggle" />
              <ul className="p-2">
                {STEWARDSHIP.map((s) => {
                  const on = Boolean(c[s.k]);
                  return (
                    <li key={s.k}>
                      <form action={toggleStewardship.bind(null, c.id, s.k)}>
                        <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50">
                          {on ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4 text-slate-300" />}
                          <span className={on ? "text-slate-800" : "text-slate-500"}>{s.label}</span>
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card>
              <CardHeader title="Tags" description="Describe the relationship with ZHF — never health or recovery status." />
              <CardBody>
                <form action={setTags.bind(null, c.id)} className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {allTags.map((t) => (
                      <label key={t.id} className="cursor-pointer">
                        <input type="checkbox" name="tagId" value={t.id} defaultChecked={c.tags.some((x) => x.id === t.id)} className="peer sr-only" />
                        <span className="inline-block rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-800">
                          {t.name}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input name="newTag" placeholder="New tag…" className="h-8 text-xs" />
                    <SubmitButton size="sm" variant="secondary">
                      Save
                    </SubmitButton>
                  </div>
                </form>
              </CardBody>
            </Card>

            {c.recurringPlans.length ? (
              <Card>
                <CardHeader title="Recurring gifts" />
                <ul className="divide-y divide-slate-100">
                  {c.recurringPlans.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                      <Repeat className="size-4 text-brand-500" />
                      <span className="flex-1">
                        {money(p.amountCents)} {FREQ_LABEL[p.frequency]?.toLowerCase()}
                        <span className="block text-xs text-slate-500">{p.fund?.name ?? "General"} · next {fmtDate(p.nextChargeAt)}</span>
                      </span>
                      <StatusBadge status={p.status} />
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {tasks.length ? (
              <Card>
                <CardHeader title="Open tasks" />
                <ul className="p-2">
                  {tasks.map((t) => (
                    <li key={t.id}>
                      <form action={toggleActivity.bind(null, t.id)}>
                        <button className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50">
                          <Circle className="mt-0.5 size-4 text-slate-300" />
                          <span>
                            {t.subject}
                            <span className="block text-xs text-slate-500">Due {fmtDate(t.dueAt)}</span>
                          </span>
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <Card>
              <CardHeader title="Data quality" />
              <CardBody className="space-y-4">
                <form action={mergeContact.bind(null, c.id)} className="space-y-2">
                  <p className="text-sm text-slate-600">Found a duplicate? Merge it into this record — gifts, orders, hours and history move here.</p>
                  <div className="flex gap-2">
                    <Input name="sourceNo" placeholder="Duplicate's constituent #" className="h-9" inputMode="numeric" />
                    <ConfirmSubmit variant="outline" size="sm" confirmText="Merge now">
                      Merge
                    </ConfirmSubmit>
                  </div>
                </form>
                {staff.role === "ADMIN" ? (
                  <form action={deleteContact.bind(null, c.id)}>
                    <ConfirmSubmit confirmText="Delete permanently">
                      <Trash2 className="size-3.5" /> Delete record
                    </ConfirmSubmit>
                  </form>
                ) : null}
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {tab === "giving" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="All gifts" description={`${c._count.donations} records`} action={<LinkButton href={`/admin/donations/new?contact=${c.id}`} size="sm">Record gift</LinkButton>} />
              <DonationTable rows={donations} />
            </Card>
            <Card>
              <CardHeader title="Giving by year" />
              <ul className="divide-y divide-slate-100">
                {givingByYear.map(([y, cents]) => (
                  <li key={y} className="flex items-center justify-between px-5 py-3 text-sm">
                    <Link href={`/admin/constituents/${c.id}/statement?year=${y}`} className="font-medium text-brand-700 hover:underline">
                      {y}
                    </Link>
                    <span className="font-semibold text-slate-900">{money(cents)}</span>
                  </li>
                ))}
                {!givingByYear.length ? <EmptyState title="No gifts yet" /> : null}
              </ul>
            </Card>
          </div>
        </div>
      )}

      {tab === "events" && <EventHistoryPanel contactId={c.id} />}
      {tab === "volunteering" && (
        <div className="space-y-6">
          <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="font-medium text-slate-900">Volunteer portal access</p>
              <p className="text-slate-500">
                {c.portalPasswordHash ? "This person has a portal password." : "No portal password yet (e.g. migrated from AHA)."} Send a secure link to set or reset it.
              </p>
            </div>
            <form action={sendVolunteerPortalLink.bind(null, c.id)}>
              <SubmitButton variant="outline" disabled={!c.email} pendingText="Sending…">
                <Mail className="size-4" /> Email set-password link
              </SubmitButton>
            </form>
          </Card>
          <VolunteerPanel contactId={c.id} />
        </div>
      )}

      {tab === "activity" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Timeline" />
            {activities.length ? (
              <ul className="relative space-y-0 px-5 py-4">
                {activities.map((a) => (
                  <li key={a.id} className="relative flex gap-4 pb-6 last:pb-0">
                    <span className="absolute left-[15px] top-8 h-full w-px bg-slate-200 last:hidden" />
                    <span
                      className={cn(
                        "relative z-10 grid size-8 shrink-0 place-items-center rounded-full",
                        a.type === "TASK" ? (a.done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700") : a.type === "SYSTEM" ? "bg-slate-100 text-slate-500" : "bg-brand-100 text-brand-700",
                      )}
                    >
                      {a.type === "TASK" ? <CalendarClock className="size-4" /> : a.type === "EMAIL" ? <Mail className="size-4" /> : a.type === "CALL" ? <Phone className="size-4" /> : <StickyNote className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("text-sm font-medium text-slate-900", a.done && "line-through text-slate-400")}>{a.subject}</p>
                        <div className="flex shrink-0 items-center gap-1">
                          {a.type === "TASK" ? (
                            <form action={toggleActivity.bind(null, a.id)}>
                              <button className="rounded-md px-2 py-0.5 text-xs text-brand-700 hover:bg-brand-50">{a.done ? "Reopen" : "Mark done"}</button>
                            </form>
                          ) : null}
                          {a.type !== "SYSTEM" ? (
                            <form action={deleteActivity.bind(null, a.id)}>
                              <button className="rounded-md p-1 text-slate-300 hover:bg-red-50 hover:text-red-600" aria-label="Delete">
                                <Trash2 className="size-3.5" />
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </div>
                      {a.body ? <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{a.body}</p> : null}
                      <p className="mt-1 text-xs text-slate-400">
                        {a.type.toLowerCase()} · {fmtDateTime(a.createdAt)}
                        {a.createdBy ? ` · ${a.createdBy.name}` : ""}
                        {a.dueAt ? ` · due ${fmtDate(a.dueAt)}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<StickyNote className="size-5" />} title="No notes yet" description="Log calls, meetings and follow-up tasks here." />
            )}
          </Card>
          <Card className="h-fit">
            <CardHeader title="Add note or task" />
            <CardBody>
              <form action={addActivity.bind(null, c.id)} className="space-y-3">
                <Field label="Type">
                  <Select name="type" defaultValue="NOTE">
                    <option value="NOTE">Note</option>
                    <option value="CALL">Call</option>
                    <option value="MEETING">Meeting</option>
                    <option value="EMAIL">Email</option>
                    <option value="TASK">Task (follow-up)</option>
                  </Select>
                </Field>
                <Field label="Subject" required>
                  <Input name="subject" required />
                </Field>
                <Field label="Details" hint="No health, addiction, treatment or recovery details.">
                  <Textarea name="body" rows={4} />
                </Field>
                <Field label="Due date" hint="For tasks">
                  <Input name="dueAt" type="date" />
                </Field>
                <SubmitButton className="w-full">Add</SubmitButton>
              </form>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "emails" && (
        <Card>
          <CardHeader title="Email history" description="Every automated and manual email sent to this person" />
          {emails.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>Subject</TH>
                  <TH>Template</TH>
                  <TH>Status</TH>
                  <TH>Sent</TH>
                </tr>
              </THead>
              <tbody>
                {emails.map((e) => (
                  <TR key={e.id}>
                    <TD>
                      <Link href={`/admin/communications/outbox/${e.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {e.subject}
                      </Link>
                    </TD>
                    <TD className="text-xs text-slate-500">{e.templateKey ?? "manual"}</TD>
                    <TD>
                      <StatusBadge status={e.status} />
                    </TD>
                    <TD className="text-slate-500">{fmtDateTime(e.createdAt)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<Mail className="size-5" />} title="No emails yet" />
          )}
        </Card>
      )}
    </>
  );
}

function DonationTable({
  rows,
}: {
  rows: { id: string; number: number; amountCents: number; receivedAt: Date; status: string; method: string; frequency: string; campaign: { name: string } | null; fund: { name: string } | null; isTest: boolean }[];
}) {
  if (!rows.length) return <EmptyState title="No gifts yet" />;
  return (
    <Table>
      <THead>
        <tr>
          <TH>Date</TH>
          <TH className="text-right">Amount</TH>
          <TH className="hidden md:table-cell">Campaign / fund</TH>
          <TH className="hidden sm:table-cell">Method</TH>
          <TH>Status</TH>
        </tr>
      </THead>
      <tbody>
        {rows.map((d) => (
          <TR key={d.id}>
            <TD>
              <Link href={`/admin/donations/${d.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                {fmtDate(d.receivedAt)}
              </Link>
              <span className="block text-xs text-slate-400">#{d.number}</span>
            </TD>
            <TD className="text-right font-semibold text-slate-900">
              {money(d.amountCents)}
              {d.frequency !== "ONE_TIME" ? <Repeat className="ml-1 inline size-3.5 text-brand-400" /> : null}
            </TD>
            <TD className="hidden md:table-cell">
              <span className="block truncate text-slate-700">{d.campaign?.name ?? "—"}</span>
              <span className="block text-xs text-slate-400">{d.fund?.name ?? ""}</span>
            </TD>
            <TD className="hidden sm:table-cell text-slate-500">{METHOD_LABEL[d.method] ?? d.method}</TD>
            <TD>
              <StatusBadge status={d.status} />
              {d.isTest ? <Badge className="ml-1">Test</Badge> : null}
            </TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}
