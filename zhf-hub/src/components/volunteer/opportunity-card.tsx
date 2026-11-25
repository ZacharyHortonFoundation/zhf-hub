import Link from "next/link";
import { format } from "date-fns";
import { Accessibility, CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { Badge, Progress } from "@/components/ui";
import { OPP_STATUS_META, PROGRAM_COLORS, SETTING_LABEL, opportunityWhen, summarizeOpportunity } from "@/lib/volunteers";
import { cn, pct } from "@/lib/utils";

export type OppCardData = {
  id: string;
  title: string;
  summary: string | null;
  setting: string;
  city: string | null;
  location: string | null;
  address: string | null;
  wheelchairAccessible: boolean;
  status: string;
  registrationCloseAt: Date | null;
  program: { name: string; color: string } | null;
  shifts: { id: string; startAt: Date; endAt: Date; capacity: number; registrations: { status: string }[] }[];
};

export function OpportunityCard({ opp, layout = "grid" }: { opp: OppCardData; layout?: "grid" | "list" }) {
  const sum = summarizeOpportunity(opp);
  const meta = OPP_STATUS_META[sum.status];
  const when = opportunityWhen(opp.shifts);
  const muted = sum.status === "PAST" || sum.status === "CLOSED" || sum.status === "CANCELED";
  const date = sum.nextShift?.startAt ?? sum.firstStart;

  if (layout === "list") {
    return (
      <Link
        href={`/volunteer/opportunities/${opp.id}`}
        className={cn("group flex items-center gap-4 rounded-2xl border border-sand bg-white p-4 transition hover:shadow-md", muted && "opacity-75")}
      >
        <div className="grid w-16 shrink-0 place-items-center rounded-xl bg-brand-50 py-2 text-center">
          <p className="text-[10px] font-semibold uppercase text-brand-500">{date ? format(date, "MMM") : "TBA"}</p>
          <p className="text-xl font-semibold leading-none text-slate-900">{date ? format(date, "d") : "–"}</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {opp.program ? <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{opp.program.name}</span> : null}
          </div>
          <p className="mt-1 truncate font-semibold text-slate-900 group-hover:text-brand-700">{opp.title}</p>
          <p className="mt-0.5 truncate text-sm text-slate-500">
            {when.date} · {when.time} · {opp.city ?? opp.location}
          </p>
        </div>
        <div className="hidden w-36 shrink-0 text-right sm:block">
          <p className="text-sm font-medium text-slate-700">
            {sum.filled}/{sum.capacity} signed up
          </p>
          <Progress value={pct(sum.filled, sum.capacity)} className="mt-1.5" tone={sum.status === "FULL" ? "accent" : "brand"} />
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/volunteer/opportunities/${opp.id}`}
      className={cn("group flex flex-col rounded-2xl border border-sand bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-lg", muted && "opacity-80")}
    >
      <div className="flex items-center justify-between gap-2">
        {opp.program ? (
          <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide", PROGRAM_COLORS[opp.program.color] ?? PROGRAM_COLORS.blue)}>
            {opp.program.name}
          </span>
        ) : (
          <span />
        )}
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>
      <p className="mt-3 text-lg font-semibold leading-snug text-slate-900 group-hover:text-brand-700">{opp.title}</p>
      {opp.summary ? <p className="mt-1 line-clamp-2 text-sm text-slate-600">{opp.summary}</p> : null}
      <div className="mt-4 space-y-1.5 text-sm text-slate-600">
        <p className="flex items-center gap-2">
          <CalendarDays className="size-4 text-brand-400" /> {when.date}
        </p>
        {when.time ? (
          <p className="flex items-center gap-2">
            <Clock className="size-4 text-brand-400" /> {when.time}
          </p>
        ) : null}
        <p className="flex items-center gap-2">
          <MapPin className="size-4 text-brand-400" /> {[opp.location, opp.city].filter(Boolean).join(", ") || "TBA"}
        </p>
      </div>
      <div className="mt-auto pt-5">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <Users className="size-3.5" /> {sum.filled}/{sum.capacity} signed up
          </span>
          <span className="flex items-center gap-2">
            <span>{SETTING_LABEL[opp.setting] ?? opp.setting}</span>
            {opp.wheelchairAccessible ? <Accessibility className="size-3.5" aria-label="Wheelchair accessible" /> : null}
          </span>
        </div>
        <Progress value={pct(sum.filled, sum.capacity)} className="mt-2" tone={sum.status === "FULL" ? "accent" : "brand"} />
      </div>
    </Link>
  );
}
