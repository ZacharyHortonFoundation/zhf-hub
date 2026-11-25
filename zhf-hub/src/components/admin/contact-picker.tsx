"use client";

import { useEffect, useRef, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Hit = { id: string; name: string; email: string | null; no: number };

/**
 * Typeahead constituent picker. Submits `name` (default "contactId") as a hidden field.
 * If `allowNew` is set and nothing is picked, the parent form can read the new-person fields.
 */
export function ContactPicker({ name = "contactId", initial, allowNew = false }: { name?: string; initial?: Hit | null; allowNew?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [picked, setPicked] = useState<Hit | null>(initial ?? null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const res = await fetch(`/admin/api/contacts?q=${encodeURIComponent(q)}`);
      if (res.ok) setHits(await res.json());
      setOpen(true);
    }, 200);
  }, [q]);

  if (picked) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5">
        <input type="hidden" name={name} value={picked.id} />
        <div className="text-sm">
          <p className="font-medium text-slate-900">{picked.name}</p>
          <p className="text-xs text-slate-500">
            #{picked.no}
            {picked.email ? ` · ${picked.email}` : ""}
          </p>
        </div>
        <button type="button" onClick={() => setPicked(null)} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Change">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  if (creating) {
    return (
      <div className="space-y-3 rounded-xl border border-slate-200 p-4">
        <input type="hidden" name="newContact" value="1" />
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-900">New constituent</p>
          <button type="button" onClick={() => setCreating(false)} className="text-xs text-brand-700 hover:underline">
            Search instead
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="newFirstName" placeholder="First name" className="h-10 rounded-xl border border-slate-300 px-3 text-sm" required />
          <input name="newLastName" placeholder="Last name" className="h-10 rounded-xl border border-slate-300 px-3 text-sm" required />
          <input name="newEmail" type="email" placeholder="Email (optional)" className="h-10 rounded-xl border border-slate-300 px-3 text-sm sm:col-span-2" />
          <input name="newOrgName" placeholder="Organization (optional)" className="h-10 rounded-xl border border-slate-300 px-3 text-sm sm:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search by name, email or #"
        className="block h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
      />
      {open && (hits.length > 0 || allowNew) ? (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setPicked(h);
                  setOpen(false);
                }}
                className="w-full px-3.5 py-2 text-left text-sm hover:bg-brand-50"
              >
                <span className="font-medium text-slate-900">{h.name}</span>
                <span className="block text-xs text-slate-500">
                  #{h.no}
                  {h.email ? ` · ${h.email}` : ""}
                </span>
              </button>
            </li>
          ))}
          {allowNew ? (
            <li className={cn(hits.length && "border-t border-slate-100")}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm font-medium text-brand-700 hover:bg-brand-50"
              >
                <UserPlus className="size-4" /> Add a new constituent
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      {allowNew && !open ? (
        <button type="button" onClick={() => setCreating(true)} className="mt-1.5 text-xs font-medium text-brand-700 hover:underline">
          + New constituent
        </button>
      ) : null}
    </div>
  );
}
