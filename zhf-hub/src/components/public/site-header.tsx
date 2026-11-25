"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Heart, Menu, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/donate", label: "Donate" },
  { href: "/events", label: "Events" },
  { href: "/volunteer", label: "Volunteer" },
];

export function SiteHeader({ volunteerName }: { volunteerName?: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-sand bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Home">
          <Logo className="h-14" />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-brand-50 hover:text-brand-800",
                pathname.startsWith(n.href) && "bg-brand-50 text-brand-800",
              )}
            >
              {n.label}
            </Link>
          ))}
          <a href="https://zacharyhortonfoundation.org" className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:text-brand-800">
            Main website ↗
          </a>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href={volunteerName ? "/volunteer/portal" : "/volunteer/login"}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:text-brand-800"
          >
            {volunteerName ? `Hi, ${volunteerName.split(" ")[0]}` : "Volunteer sign in"}
          </Link>
          <Link href="/donate" className={buttonClass("primary", "md", "rounded-full px-5")}>
            <Heart className="size-4 fill-current" /> Donate
          </Link>
        </div>

        <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-sand bg-white px-4 pb-4 md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="block border-b border-slate-100 py-3 font-medium text-slate-700">
              {n.label}
            </Link>
          ))}
          <Link
            href={volunteerName ? "/volunteer/portal" : "/volunteer/login"}
            onClick={() => setOpen(false)}
            className="block border-b border-slate-100 py-3 font-medium text-slate-700"
          >
            {volunteerName ? "My volunteer portal" : "Volunteer sign in"}
          </Link>
          <a href="https://zacharyhortonfoundation.org" className="block py-3 font-medium text-slate-500">
            Main website ↗
          </a>
        </div>
      )}
    </header>
  );
}
