import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import {
  CalendarDays,
  CheckCircle2,
  Copy,
  DollarSign,
  Download,
  ExternalLink,
  Plus,
  ScanLine,
  Search,
  Ticket,
  Trash2,
  Undo2,
  UserCheck,
  Users,
} from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventStats } from "@/lib/events";
import { appUrl } from "@/lib/payments";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  Input,
  LinkButton,
  PageHeader,
  Progress,
  Select,
  Stat,
  StatusBadge,
  Table,
  TD,
  TH,
  THead,
  TR,
  Textarea,
} from "@/components/ui";
import { ConfirmSubmit, CopyButton, SubmitButton } from "@/components/client-ui";
import { EventForm } from "@/components/events/event-form";
import { cn, fmtDateTime, fmtRange, fullName, money, pct } from "@/lib/utils";
import {
  adminMarkOrderPaid,
  cancelOrder,
  deleteDiscount,
  deleteEvent,
  deleteQuestion,
  deleteTicketType,
  duplicateEvent,
  saveDiscount,
  saveQuestion,
  saveTicketType,
  setEventStatus,
  toggleCheckIn,
  updateEvent,
} from "../actions";

export const dynamic = "force-dynamic";

const TABS = [
  { v: "overview", label: "Overview" },
  { v: "details", label: "Details" },
  { v: "tickets", label: "Tickets" },
  { v: "questions", label: "Questions" },
  { v: "discounts", label: "Discounts" },
  { v: "attendees", label: "Attendees" },
  { v: "orders", label: "Orders" },
] as const;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await db.event.findUnique({ where: { id }, select: { title: true } });
  return { title: e?.title ?? "Event" };
}

export default async function AdminEventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; q?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.v === sp.tab) ? sp.tab! : "overview";

  const event = await db.event.findUnique({
    where: { id },
    include: {
      ticketTypes: { orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }] },
      questions: { orderBy: { sortOrder: "asc" } },
      discountCodes: { orderBy: { code: "asc" } },
      campaign: { select: { id: true, name: true } },
    },
  });
  if (!event) notFound();
  const stats = await eventStats(id);
  const now = new Date();
  const past = (event.endAt ?? event.startAt) < now;
  const publicUrl = `${appUrl()}/events/${event.slug}`;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Events", href: "/admin/events" }, { label: event.title }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {event.title}
            {past && event.status === "PUBLISHED" ? <Badge tone="gray">Ended</Badge> : <StatusBadge status={event.status} label={event.status === "PUBLISHED" ? "Live" : undefined} />}
          </span>
        }
        description={`${fmtRange(event.startAt, event.endAt)} · ${event.venueName ?? event.city ?? "Location TBA"}`}
        actions={
          <>
            {event.status !== "DRAFT" ? (
              <LinkButton href={`/events/${event.slug}`} target="_blank" variant="outline">
                <ExternalLink className="size-4" /> Public page
              </LinkButton>
            ) : null}
            <LinkButton href={`/admin/check-in?event=${event.id}`}>
              <ScanLine className="size-4" /> Check-in
            </LinkButton>
          </>
        }
      />

      <nav className="scroll-thin -mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
        {TABS.map((t) => (
          <Link
            key={t.v}
            href={`/admin/events/${event.id}?tab=${t.v}`}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition",
              tab === t.v ? "border-brand-600 text-brand-800" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
            {t.v === "attendees" ? <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{stats.sold}</span> : null}
            {t.v === "orders" ? <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{stats.orders}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab event={event} stats={stats} publicUrl={publicUrl} />}
      {tab === "details" && <DetailsTab event={event} />}
      {tab === "tickets" && <TicketsTab event={event} />}
      {tab === "questions" && <QuestionsTab event={event} />}
      {tab === "discounts" && <DiscountsTab event={event} />}
      {tab === "attendees" && <AttendeesTab eventId={event.id} questions={event.questions} q={sp.q ?? ""} />}
      {tab === "orders" && <OrdersTab eventId={event.id} />}
    </>
  );
}

type EventFull = NonNullable<Awaited<ReturnType<typeof loadType>>>;
// helper purely for typing
async function loadType(id: string) {
  return db.event.findUnique({
    where: { id },
    include: { ticketTypes: true, questions: true, discountCodes: true, campaign: { select: { id: true, name: true } } },
  });
}

/* ─────────────────────────── Overview ─────────────────────────── */

async function OverviewTab({ event, stats, publicUrl }: { event: EventFull; stats: Awaited<ReturnType<typeof eventStats>>; publicUrl: string }) {
  const [byType, recentOrders, totals] = await Promise.all([
    db.attendee.groupBy({ by: ["ticketTypeId"], where: { eventId: event.id, order: { status: "PAID" } }, _count: true }),
    db.eventOrder.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "desc" }, take: 6, include: { contact: true, _count: { select: { attendees: true } } } }),
    db.eventOrder.aggregate({ where: { eventId: event.id, status: "PAID" }, _sum: { donationCents: true, feeCents: true, discountCents: true, subtotalCents: true } }),
  ]);
  const countBy = new Map(byType.map((r) => [r.ticketTypeId, r._count]));
  const ticketRevenue = (totals._sum.subtotalCents ?? 0) - (totals._sum.discountCents ?? 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Registered" value={stats.sold} icon={<Users className="size-5" />} hint={`${stats.orders} paid order${stats.orders === 1 ? "" : "s"}`} />
        <Stat
          label="Capacity used"
          value={event.capacity ? `${stats.capacityUsed} / ${event.capacity}` : stats.capacityUsed}
          icon={<Ticket className="size-5" />}
          hint={event.capacity ? `${pct(stats.capacityUsed, event.capacity)}% full` : "no capacity limit"}
        />
        <Stat label="Checked in" value={stats.checkedIn} icon={<UserCheck className="size-5" />} hint={stats.sold ? `${pct(stats.checkedIn, stats.sold)}% of registered` : "—"} />
        <Stat label="Revenue" value={money(stats.revenueCents)} icon={<DollarSign className="size-5" />} hint={event.campaign ? `→ ${event.campaign.name}` : "no campaign linked"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Ticket sales" action={<LinkButton href={`/admin/events/${event.id}?tab=tickets`} variant="ghost" size="sm">Edit tickets</LinkButton>} />
          {event.ticketTypes.length === 0 ? (
            <EmptyState title="No ticket types yet" action={<LinkButton href={`/admin/events/${event.id}?tab=tickets`} size="sm">Add tickets</LinkButton>} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Ticket</TH>
                  <TH className="text-right">Price</TH>
                  <TH className="text-right">Sold</TH>
                  <TH className="text-right">Attendees</TH>
                  <TH className="text-right">Gross</TH>
                </tr>
              </THead>
              <tbody>
                {event.ticketTypes.map((t) => {
                  const att = countBy.get(t.id) ?? 0;
                  const sold = Math.ceil(att / Math.max(1, t.attendeesPerTicket));
                  return (
                    <TR key={t.id}>
                      <TD>
                        <span className="font-medium text-slate-900">{t.name}</span>
                        {!t.active ? <Badge className="ml-2">Hidden</Badge> : null}
                      </TD>
                      <TD className="text-right tabular-nums">{t.priceCents ? money(t.priceCents) : "Free"}</TD>
                      <TD className="text-right tabular-nums">
                        {sold}
                        {t.quantity != null ? <span className="text-slate-400"> / {t.quantity}</span> : null}
                      </TD>
                      <TD className="text-right tabular-nums">{att}</TD>
                      <TD className="text-right tabular-nums">{money(sold * t.priceCents)}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
          <div className="grid grid-cols-3 gap-4 border-t border-slate-100 px-5 py-4 text-sm">
            <div>
              <p className="text-xs text-slate-500">Tickets (net of discounts)</p>
              <p className="font-semibold text-slate-900">{money(ticketRevenue)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Add-on donations</p>
              <p className="font-semibold text-slate-900">{money(totals._sum.donationCents ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Fees covered by buyers</p>
              <p className="font-semibold text-slate-900">{money(totals._sum.feeCents ?? 0, { decimals: true })}</p>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Publishing" />
            <CardBody className="space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Public link</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">{publicUrl}</code>
                  <CopyButton text={publicUrl} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <form action={setEventStatus}>
                  <input type="hidden" name="id" value={event.id} />
                  <input type="hidden" name="status" value={event.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED"} />
                  {event.status === "PUBLISHED" ? (
                    <SubmitButton variant="outline" size="sm">
                      Unpublish
                    </SubmitButton>
                  ) : (
                    <SubmitButton size="sm">
                      <CheckCircle2 className="size-4" /> {event.status === "CANCELED" ? "Re-publish" : "Publish"}
                    </SubmitButton>
                  )}
                </form>
                {event.status !== "CANCELED" ? (
                  <form action={setEventStatus}>
                    <input type="hidden" name="id" value={event.id} />
                    <input type="hidden" name="status" value="CANCELED" />
                    <ConfirmSubmit confirmText="Cancel event?">Cancel event</ConfirmSubmit>
                  </form>
                ) : null}
              </div>
              <p className="text-xs text-slate-500">
                {event.status === "DRAFT"
                  ? "Drafts are hidden from the website."
                  : event.status === "CANCELED"
                    ? "Canceled events show a “Canceled” label on the website and can't take registrations."
                    : "This event is live on the website."}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Tools" />
            <CardBody className="flex flex-wrap gap-2">
              <LinkButton href={`/admin/events/${event.id}/export`} variant="outline" size="sm">
                <Download className="size-4" /> Attendees CSV
              </LinkButton>
              <form action={duplicateEvent}>
                <input type="hidden" name="id" value={event.id} />
                <SubmitButton variant="outline" size="sm" pendingText="Copying…">
                  <Copy className="size-4" /> Copy for next year
                </SubmitButton>
              </form>
              {stats.orders === 0 ? (
                <form action={deleteEvent}>
                  <input type="hidden" name="id" value={event.id} />
                  <ConfirmSubmit confirmText="Delete permanently?">
                    <Trash2 className="size-4" /> Delete
                  </ConfirmSubmit>
                </form>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Recent orders" action={<LinkButton href={`/admin/events/${event.id}?tab=orders`} variant="ghost" size="sm">All orders</LinkButton>} />
        {recentOrders.length === 0 ? (
          <EmptyState icon={<Ticket className="size-6" />} title="No orders yet" description="Share the public link to start taking registrations." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {recentOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/admin/constituents/${o.contactId}`} className="font-medium text-slate-900 hover:text-brand-700">
                    {fullName(o.contact)}
                  </Link>
                  <p className="text-xs text-slate-500">
                    #{o.number} · {o._count.attendees} attendee{o._count.attendees === 1 ? "" : "s"} · {fmtDateTime(o.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums text-slate-900">{o.totalCents ? money(o.totalCents, { decimals: true }) : "Free"}</span>
                  <StatusBadge status={o.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ─────────────────────────── Details ─────────────────────────── */

async function DetailsTab({ event }: { event: EventFull }) {
  const campaigns = await db.campaign.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, active: true } });
  return (
    <div className="max-w-3xl">
      <EventForm event={event} campaigns={campaigns} action={updateEvent} submitLabel="Save changes" />
    </div>
  );
}

/* ─────────────────────────── Tickets ─────────────────────────── */

async function TicketsTab({ event }: { event: EventFull }) {
  const counts = await db.attendee.groupBy({ by: ["ticketTypeId"], where: { eventId: event.id, order: { status: "PAID" } }, _count: true });
  const countBy = new Map(counts.map((r) => [r.ticketTypeId, r._count]));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {event.ticketTypes.length === 0 ? (
          <Card>
            <EmptyState icon={<Ticket className="size-6" />} title="No ticket types yet" description="Add at least one ticket — even free RSVPs need a “Free RSVP” ticket." />
          </Card>
        ) : null}
        {event.ticketTypes.map((t) => {
          const att = countBy.get(t.id) ?? 0;
          const sold = Math.ceil(att / Math.max(1, t.attendeesPerTicket));
          return (
            <Card key={t.id}>
              <form action={saveTicketType}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="eventId" value={event.id} />
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">{t.name}</p>
                    {!t.active ? <Badge>Hidden</Badge> : null}
                  </div>
                  <span className="text-sm text-slate-500">
                    {sold} sold{t.quantity != null ? ` of ${t.quantity}` : ""}
                  </span>
                </div>
                <TicketFields t={t} />
                <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                  <ConfirmSubmit formAction={deleteTicketType} confirmText={att ? "Hide ticket?" : "Delete ticket?"}>
                    <Trash2 className="size-4" /> {att ? "Remove" : "Delete"}
                  </ConfirmSubmit>
                  <SubmitButton size="sm" pendingText="Saving…">
                    Save ticket
                  </SubmitButton>
                </div>
              </form>
            </Card>
          );
        })}
      </div>

      <Card className="self-start">
        <CardHeader title="Add a ticket type" description="e.g. Individual, Foursome, Dinner only, Sponsor" />
        <form action={saveTicketType}>
          <input type="hidden" name="eventId" value={event.id} />
          <TicketFields />
          <div className="flex justify-end border-t border-slate-100 px-5 py-3">
            <SubmitButton size="sm" pendingText="Adding…">
              <Plus className="size-4" /> Add ticket
            </SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}

function TicketFields({ t }: { t?: EventFull["ticketTypes"][number] }) {
  return (
    <div className="grid gap-4 p-5 sm:grid-cols-2">
      <Field label="Name" required className="sm:col-span-2">
        <Input name="name" defaultValue={t?.name} required />
      </Field>
      <Field label="Description" className="sm:col-span-2">
        <Input name="description" defaultValue={t?.description ?? ""} placeholder="What's included" />
      </Field>
      <Field label="Price ($)" hint="0 for free">
        <Input name="price" inputMode="decimal" defaultValue={t ? (t.priceCents / 100).toFixed(2) : "0.00"} />
      </Field>
      <Field label="Quantity available" hint="Blank = unlimited">
        <Input name="quantity" type="number" min={0} defaultValue={t?.quantity ?? ""} />
      </Field>
      <Field label="People per ticket" hint="e.g. 4 for a foursome">
        <Input name="attendeesPerTicket" type="number" min={1} defaultValue={t?.attendeesPerTicket ?? 1} />
      </Field>
      <Field label="Sort order">
        <Input name="sortOrder" type="number" defaultValue={t?.sortOrder ?? 0} />
      </Field>
      <div className="space-y-2.5 sm:col-span-2">
        <Checkbox name="countsTowardCapacity" defaultChecked={t?.countsTowardCapacity ?? true} label="Counts toward event capacity" description="Turn off for sponsorships or add-ons that don't take a seat." />
        <Checkbox name="active" defaultChecked={t?.active ?? true} label="Available for sale" />
      </div>
    </div>
  );
}

/* ─────────────────────────── Questions ─────────────────────────── */

function QuestionsTab({ event }: { event: EventFull }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {event.questions.length === 0 ? (
          <Card>
            <EmptyState title="No custom questions" description="Ask for shirt sizes, dietary needs, a loved one's name to remember — anything you need from each attendee." />
          </Card>
        ) : null}
        {event.questions.map((q) => (
          <Card key={q.id}>
            <form action={saveQuestion}>
              <input type="hidden" name="id" value={q.id} />
              <input type="hidden" name="eventId" value={event.id} />
              <QuestionFields q={q} />
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                <ConfirmSubmit formAction={deleteQuestion} confirmText="Delete question?">
                  <Trash2 className="size-4" /> Delete
                </ConfirmSubmit>
                <SubmitButton size="sm" pendingText="Saving…">
                  Save question
                </SubmitButton>
              </div>
            </form>
          </Card>
        ))}
      </div>
      <Card className="self-start">
        <CardHeader title="Add a question" description={event.collectAttendeeInfo ? "Asked for every attendee." : "Asked once per order."} />
        <form action={saveQuestion}>
          <input type="hidden" name="eventId" value={event.id} />
          <QuestionFields />
          <div className="flex justify-end border-t border-slate-100 px-5 py-3">
            <SubmitButton size="sm" pendingText="Adding…">
              <Plus className="size-4" /> Add question
            </SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}

function QuestionFields({ q }: { q?: EventFull["questions"][number] }) {
  return (
    <div className="grid gap-4 p-5 sm:grid-cols-2">
      <Field label="Question" required className="sm:col-span-2">
        <Input name="label" defaultValue={q?.label} required placeholder="e.g. Shirt size" />
      </Field>
      <Field label="Answer type">
        <Select name="type" defaultValue={q?.type ?? "TEXT"}>
          <option value="TEXT">Short text</option>
          <option value="SELECT">Dropdown</option>
          <option value="CHECKBOX">Yes / no checkbox</option>
        </Select>
      </Field>
      <Field label="Sort order">
        <Input name="sortOrder" type="number" defaultValue={q?.sortOrder ?? 0} />
      </Field>
      <Field label="Dropdown options" hint="One per line (dropdown only)" className="sm:col-span-2">
        <Textarea name="options" defaultValue={q?.options ?? ""} rows={3} className="min-h-0" />
      </Field>
      <Checkbox name="required" defaultChecked={q?.required ?? false} label="Required" className="sm:col-span-2" />
    </div>
  );
}

/* ─────────────────────────── Discounts ─────────────────────────── */

function DiscountsTab({ event }: { event: EventFull }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card className="self-start">
        <CardHeader title="Discount codes" description="Codes apply to ticket prices (not add-on donations)." />
        {event.discountCodes.length === 0 ? (
          <EmptyState title="No discount codes" description="Create codes for early birds, sponsors, board members or partners." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {event.discountCodes.map((d) => (
              <li key={d.id} className="px-5 py-4">
                <form action={saveDiscount} className="grid items-end gap-3 sm:grid-cols-[1fr_110px_110px_90px_auto]">
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="eventId" value={event.id} />
                  <Field label="Code">
                    <Input name="code" defaultValue={d.code} className="font-mono uppercase" />
                  </Field>
                  <Field label="Type">
                    <Select name="kind" defaultValue={d.amountOffCents ? "amount" : "percent"}>
                      <option value="percent">% off</option>
                      <option value="amount">$ off</option>
                    </Select>
                  </Field>
                  <Field label="Value">
                    <Input name="value" inputMode="decimal" defaultValue={d.amountOffCents ? (d.amountOffCents / 100).toFixed(2) : d.percentOff ?? ""} />
                  </Field>
                  <Field label="Max uses">
                    <Input name="maxUses" type="number" min={0} defaultValue={d.maxUses ?? ""} />
                  </Field>
                  <div className="flex items-center gap-2 pb-0.5">
                    <SubmitButton size="sm" variant="outline" pendingText="…">
                      Save
                    </SubmitButton>
                    <ConfirmSubmit formAction={deleteDiscount} confirmText="Sure?">
                      <Trash2 className="size-4" />
                    </ConfirmSubmit>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500 sm:col-span-5">
                    <Checkbox name="active" defaultChecked={d.active} label="Active" />
                    <span>
                      Used {d.timesUsed}
                      {d.maxUses != null ? ` of ${d.maxUses}` : ""} time{d.timesUsed === 1 ? "" : "s"}
                    </span>
                    {d.maxUses != null ? <Progress value={pct(d.timesUsed, d.maxUses)} className="h-1.5 max-w-40" /> : null}
                  </div>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="self-start">
        <CardHeader title="New discount code" />
        <form action={saveDiscount} className="grid gap-4 p-5 sm:grid-cols-2">
          <input type="hidden" name="eventId" value={event.id} />
          <Field label="Code" required className="sm:col-span-2">
            <Input name="code" required placeholder="EARLYBIRD" className="font-mono uppercase" />
          </Field>
          <Field label="Type">
            <Select name="kind" defaultValue="percent">
              <option value="percent">% off</option>
              <option value="amount">$ off</option>
            </Select>
          </Field>
          <Field label="Value" required>
            <Input name="value" inputMode="decimal" required placeholder="10" />
          </Field>
          <Field label="Max uses" hint="Blank = unlimited" className="sm:col-span-2">
            <Input name="maxUses" type="number" min={0} />
          </Field>
          <Checkbox name="active" defaultChecked label="Active" className="sm:col-span-2" />
          <div className="flex justify-end sm:col-span-2">
            <SubmitButton size="sm" pendingText="Creating…">
              <Plus className="size-4" /> Create code
            </SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}

/* ─────────────────────────── Attendees ─────────────────────────── */

async function AttendeesTab({ eventId, questions, q }: { eventId: string; questions: { id: string; label: string }[]; q: string }) {
  const term = q.trim();
  const attendees = await db.attendee.findMany({
    where: {
      eventId,
      order: { status: { in: ["PAID", "PENDING"] } },
      ...(term
        ? { OR: [{ firstName: { contains: term } }, { lastName: { contains: term } }, { email: { contains: term } }, { ticketCode: { contains: term.toUpperCase() } }] }
        : {}),
    },
    include: { ticketType: true, order: { select: { number: true, status: true, contactId: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 500,
  });
  const qLabel = new Map(questions.map((x) => [x.id, x.label]));
  const returnTo = `/admin/events/${eventId}?tab=attendees${term ? `&q=${encodeURIComponent(term)}` : ""}`;

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <form className="relative sm:w-80">
          <input type="hidden" name="tab" value="attendees" />
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            defaultValue={term}
            placeholder="Search name, email or ticket code…"
            className="h-9 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
        </form>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">
            {attendees.length} attendee{attendees.length === 1 ? "" : "s"}
          </span>
          <LinkButton href={`/admin/events/${eventId}/export`} variant="outline" size="sm">
            <Download className="size-4" /> Export CSV
          </LinkButton>
        </div>
      </div>
      {attendees.length === 0 ? (
        <EmptyState icon={<Users className="size-6" />} title={term ? "No attendees match" : "No attendees yet"} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Attendee</TH>
              <TH>Ticket</TH>
              <TH>Order</TH>
              {questions.length ? <TH>Answers</TH> : null}
              <TH className="text-right">Check-in</TH>
            </tr>
          </THead>
          <tbody>
            {attendees.map((a) => {
              const answers: Record<string, string> = a.answers ? safeJson(a.answers) : {};
              return (
                <TR key={a.id}>
                  <TD>
                    {a.contactId ? (
                      <Link href={`/admin/constituents/${a.contactId}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {a.firstName} {a.lastName}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-900">
                        {a.firstName} {a.lastName}
                      </span>
                    )}
                    <p className="text-xs text-slate-500">{a.email ?? "—"}</p>
                  </TD>
                  <TD>
                    <p>{a.ticketType.name}</p>
                    <p className="font-mono text-xs text-slate-400">{a.ticketCode}</p>
                  </TD>
                  <TD>
                    <span className="text-slate-700">#{a.order.number}</span>
                    {a.order.status !== "PAID" ? <StatusBadge status={a.order.status} /> : null}
                  </TD>
                  {questions.length ? (
                    <TD className="text-xs text-slate-600">
                      {Object.entries(answers).map(([k, v]) => (
                        <p key={k}>
                          <span className="text-slate-400">{qLabel.get(k) ?? "Question"}:</span> {v}
                        </p>
                      ))}
                    </TD>
                  ) : null}
                  <TD className="text-right">
                    <form action={toggleCheckIn} className="inline-flex items-center gap-2">
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      {a.checkedInAt ? (
                        <>
                          <span className="text-xs text-emerald-700">{format(a.checkedInAt, "MMM d, h:mm a")}</span>
                          <SubmitButton variant="ghost" size="xs" aria-label="Undo check-in">
                            <Undo2 className="size-3.5" />
                          </SubmitButton>
                        </>
                      ) : (
                        <SubmitButton variant="secondary" size="xs" disabled={a.order.status !== "PAID"}>
                          Check in
                        </SubmitButton>
                      )}
                    </form>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function safeJson(s: string): Record<string, string> {
  try {
    return JSON.parse(s) as Record<string, string>;
  } catch {
    return {};
  }
}

/* ─────────────────────────── Orders ─────────────────────────── */

async function OrdersTab({ eventId }: { eventId: string }) {
  const orders = await db.eventOrder.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    include: { contact: true, discountCode: { select: { code: true } }, _count: { select: { attendees: true } } },
    take: 500,
  });
  return (
    <Card>
      <CardHeader
        title="Orders"
        description="Pending orders hold seats for 30 minutes while the buyer is on the payment page. Mark offline (cash/check) orders as paid here."
      />
      {orders.length === 0 ? (
        <EmptyState icon={<CalendarDays className="size-6" />} title="No orders yet" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Order</TH>
              <TH>Buyer</TH>
              <TH className="text-right">Attendees</TH>
              <TH className="text-right">Total</TH>
              <TH>Status</TH>
              <TH>Placed</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {orders.map((o) => (
              <TR key={o.id}>
                <TD>
                  <Link href={`/events/order/${o.id}`} target="_blank" className="font-medium text-slate-900 hover:text-brand-700">
                    #{o.number}
                  </Link>
                  {o.isTest ? <Badge tone="amber" className="ml-2">Test</Badge> : null}
                  {o.discountCode ? <p className="font-mono text-xs text-emerald-700">{o.discountCode.code}</p> : null}
                </TD>
                <TD>
                  <Link href={`/admin/constituents/${o.contactId}`} className="text-slate-900 hover:text-brand-700">
                    {fullName(o.contact)}
                  </Link>
                  <p className="text-xs text-slate-500">{o.contact.email}</p>
                </TD>
                <TD className="text-right tabular-nums">{o._count.attendees}</TD>
                <TD className="text-right tabular-nums">
                  {o.totalCents ? money(o.totalCents, { decimals: true }) : "Free"}
                  {o.donationCents ? <p className="text-xs text-slate-500">incl. {money(o.donationCents)} gift</p> : null}
                </TD>
                <TD>
                  <StatusBadge status={o.status} />
                </TD>
                <TD className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(o.createdAt)}</TD>
                <TD className="whitespace-nowrap text-right">
                  <form className="inline-flex gap-1.5">
                    <input type="hidden" name="id" value={o.id} />
                    {o.status !== "PAID" ? (
                      <SubmitButton formAction={adminMarkOrderPaid} size="xs" variant="secondary">
                        Mark paid
                      </SubmitButton>
                    ) : null}
                    {o.status !== "CANCELED" ? (
                      <ConfirmSubmit formAction={cancelOrder} size="xs" confirmText="Cancel order?">
                        Cancel
                      </ConfirmSubmit>
                    ) : null}
                  </form>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
