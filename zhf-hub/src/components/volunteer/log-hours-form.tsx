"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/client-ui";

type Option = { id: string; label: string; hours: number; date: string };

const inputCls =
  "block h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100";

/** Volunteer "log hours" form — picking a shift pre-fills its date and length. */
export function LogHoursForm({ options, action, today }: { options: Option[]; action: (fd: FormData) => Promise<void>; today: string }) {
  const [shiftId, setShiftId] = useState(options[0]?.id ?? "");
  const first = options[0];
  const [hours, setHours] = useState(first ? String(first.hours) : "");
  const [date, setDate] = useState(first ? first.date : today);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="mb-1.5 block text-sm font-medium text-slate-700">What did you volunteer for?</label>
        <select
          name="shiftId"
          value={shiftId}
          onChange={(e) => {
            setShiftId(e.target.value);
            const o = options.find((x) => x.id === e.target.value);
            if (o) {
              setHours(String(o.hours));
              setDate(o.date);
            }
          }}
          className={inputCls}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
          <option value="">Other / not listed</option>
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Date</label>
        <input type="date" name="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={inputCls} required />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Hours</label>
        <input type="number" name="hours" step="0.25" min="0.25" max="24" value={hours} onChange={(e) => setHours(e.target.value)} className={inputCls} required />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Notes {shiftId ? <span className="font-normal text-slate-400">(optional)</span> : <span className="text-red-500">*</span>}
        </label>
        <textarea
          name="description"
          rows={2}
          placeholder={shiftId ? "Anything we should know?" : "What did you do? e.g. Picked up donations from a partner church"}
          className={`${inputCls} h-auto py-2.5`}
        />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton pendingText="Submitting…" className="rounded-full px-6">
          Submit hours
        </SubmitButton>
      </div>
    </form>
  );
}
