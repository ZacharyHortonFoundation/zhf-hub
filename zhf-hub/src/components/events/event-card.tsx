import Link from "next/link";
import { format } from "date-fns";
import { CalendarDays, Clock, MapPin, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

export type EventCardData = {
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  imageUrl: string | null;
  startAt: Date;
  endAt: Date | null;
  venueName: string | null;
  city: string | null;
  price: string;
  badge?: { text: string; tone: "red" | "gray" | "amber" | "green" } | null;
};

const badgeTone = {
  red: "bg-red-600 text-white",
  gray: "bg-slate-700/80 text-white",
  amber: "bg-accent text-ink",
  green: "bg-emerald-600 text-white",
};

function timeRange(start: Date, end: Date | null) {
  if (!end) return format(start, "h:mm a");
  if (format(start, "yyyy-MM-dd") !== format(end, "yyyy-MM-dd")) return `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
  return `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`;
}

export function EventGridCard({ e, past }: { e: EventCardData; past?: boolean }) {
  return (
    <Link href={`/events/${e.slug}`} className={cn("group flex flex-col overflow-hidden rounded-2xl border border-sand bg-white transition hover:-translate-y-0.5 hover:shadow-lg", past && "opacity-90")}>
      <div className="relative h-40 bg-gradient-to-br from-brand-500 to-brand-800">
        {e.imageUrl ? <img src={e.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
        <div className="absolute left-4 top-4 rounded-xl bg-white px-3 py-1.5 text-center shadow">
          <p className="text-[10px] font-semibold uppercase text-brand-500">{format(e.startAt, "MMM")}</p>
          <p className="text-xl font-semibold leading-none text-slate-900">{format(e.startAt, "d")}</p>
        </div>
        {e.badge ? <span className={cn("absolute right-3 top-3 rounded-full px-2.5 py-0.5 text-xs font-semibold", badgeTone[e.badge.tone])}>{e.badge.text}</span> : null}
        <span className="absolute bottom-3 left-4 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur">{e.category}</span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="font-semibold text-slate-900 group-hover:text-brand-700">{e.title}</p>
        {e.summary ? <p className="mt-1 line-clamp-2 text-sm text-slate-500">{e.summary}</p> : null}
        <div className="mt-auto space-y-1 pt-4 text-sm text-slate-500">
          <p className="flex items-center gap-1.5">
            <Clock className="size-3.5" /> {format(e.startAt, "EEE")} · {timeRange(e.startAt, e.endAt)}
          </p>
          <p className="flex items-center gap-1.5">
            <MapPin className="size-3.5" /> {e.venueName ?? e.city ?? "TBA"}
          </p>
          <p className="flex items-center gap-1.5 font-medium text-brand-700">
            <Ticket className="size-3.5" /> {e.price}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function EventListRow({ e, past }: { e: EventCardData; past?: boolean }) {
  return (
    <Link href={`/events/${e.slug}`} className="group flex gap-4 rounded-2xl border border-sand bg-white p-4 transition hover:shadow-md sm:gap-5 sm:p-5">
      <div className={cn("grid w-16 shrink-0 place-items-center self-start rounded-xl py-2 text-center", past ? "bg-slate-100" : "bg-brand-50")}>
        <p className="text-[11px] font-semibold uppercase text-brand-500">{format(e.startAt, "MMM")}</p>
        <p className="text-2xl font-semibold leading-none text-slate-900">{format(e.startAt, "d")}</p>
        <p className="mt-0.5 text-[10px] text-slate-500">{format(e.startAt, "yyyy")}</p>
      </div>
      {e.imageUrl ? <img src={e.imageUrl} alt="" className="hidden h-24 w-36 shrink-0 rounded-xl object-cover sm:block" /> : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-slate-900 group-hover:text-brand-700">{e.title}</p>
          {e.badge ? <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", badgeTone[e.badge.tone])}>{e.badge.text}</span> : null}
        </div>
        {e.summary ? <p className="mt-1 line-clamp-2 text-sm text-slate-500">{e.summary}</p> : null}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" /> {format(e.startAt, "EEEE")} · {timeRange(e.startAt, e.endAt)}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5" /> {e.venueName ?? e.city ?? "TBA"}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{e.category}</span>
        </div>
      </div>
      <div className="hidden shrink-0 self-center text-right sm:block">
        <p className="text-sm font-semibold text-brand-700">{e.price}</p>
        <p className="mt-1 text-xs font-medium text-slate-400 group-hover:text-brand-600">{past ? "View recap →" : "Details →"}</p>
      </div>
    </Link>
  );
}
