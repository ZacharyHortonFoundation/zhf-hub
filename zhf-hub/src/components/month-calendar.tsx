import Link from "next/link";
import { addDays, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type CalendarItem = { id: string; date: Date; title: string; href: string; tone?: "brand" | "accent" | "gray" | "green" };

/**
 * Server-rendered month grid. `month` is any date inside the month to show.
 * `makeHref(yyyyMM)` builds the prev/next links (e.g. `?view=calendar&month=2026-12`).
 */
export function MonthCalendar({
  month,
  items,
  makeHref,
}: {
  month: Date;
  items: CalendarItem[];
  makeHref: (ym: string) => string;
}) {
  const start = startOfWeek(startOfMonth(month));
  const end = endOfWeek(endOfMonth(month));
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const prev = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const today = new Date();
  const toneClass = {
    brand: "bg-brand-600 text-white",
    accent: "bg-accent text-ink",
    gray: "bg-slate-200 text-slate-600",
    green: "bg-emerald-600 text-white",
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <Link href={makeHref(format(prev, "yyyy-MM"))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Previous month">
          <ChevronLeft className="size-5" />
        </Link>
        <p className="font-semibold text-slate-900">{format(month, "MMMM yyyy")}</p>
        <Link href={makeHref(format(next, "yyyy-MM"))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Next month">
          <ChevronRight className="size-5" />
        </Link>
      </div>
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const dayItems = items.filter((i) => isSameDay(i.date, d));
          return (
            <div
              key={d.toISOString()}
              className={cn("min-h-24 border-b border-r border-slate-100 p-1.5 sm:min-h-28", !isSameMonth(d, month) && "bg-slate-50/70")}
            >
              <span
                className={cn(
                  "inline-grid size-6 place-items-center rounded-full text-xs",
                  isSameDay(d, today) ? "bg-brand-700 font-semibold text-white" : isSameMonth(d, month) ? "text-slate-700" : "text-slate-400",
                )}
              >
                {format(d, "d")}
              </span>
              <div className="mt-1 space-y-1">
                {dayItems.slice(0, 3).map((it) => (
                  <Link
                    key={it.id}
                    href={it.href}
                    title={it.title}
                    className={cn("block truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium hover:opacity-90", toneClass[it.tone ?? "brand"])}
                  >
                    {it.title}
                  </Link>
                ))}
                {dayItems.length > 3 ? <p className="px-1 text-[11px] text-slate-500">+{dayItems.length - 3} more</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
