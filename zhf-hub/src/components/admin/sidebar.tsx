"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Clock,
  ExternalLink,
  HandHeart,
  Heart,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Repeat,
  ScanLine,
  Settings,
  Target,
  UserPlus,
  Users,
  X,
  Inbox,
  Upload,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: ReactNode; badge?: number; roles?: string[]; exact?: boolean };
type Section = { title?: string; items: Item[] };

export function AdminSidebar({
  user,
  counts,
  logoutAction,
}: {
  user: { name: string; role: string };
  counts: { applications: number; hours: number };
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const fundraising = ["ADMIN", "STAFF"];

  const sections: Section[] = [
    {
      items: [{ href: "/admin", label: "Dashboard", icon: <LayoutDashboard className="size-[18px]" />, exact: true }],
    },
    {
      title: "Relationships",
      items: [{ href: "/admin/constituents", label: "Constituents", icon: <Users className="size-[18px]" /> }],
    },
    {
      title: "Fundraising",
      items: [
        { href: "/admin/donations", label: "Donations", icon: <Heart className="size-[18px]" />, roles: fundraising },
        { href: "/admin/recurring", label: "Recurring gifts", icon: <Repeat className="size-[18px]" />, roles: fundraising },
        { href: "/admin/campaigns", label: "Campaigns & funds", icon: <Target className="size-[18px]" />, roles: fundraising },
      ],
    },
    {
      title: "Events",
      items: [
        { href: "/admin/events", label: "Events", icon: <CalendarDays className="size-[18px]" />, exact: false },
        { href: "/admin/check-in", label: "Check-in", icon: <ScanLine className="size-[18px]" /> },
      ],
    },
    {
      title: "Volunteers",
      items: [
        { href: "/admin/volunteers", label: "Volunteers", icon: <HandHeart className="size-[18px]" />, exact: true },
        { href: "/admin/volunteers/applications", label: "Applications", icon: <UserPlus className="size-[18px]" />, badge: counts.applications },
        { href: "/admin/volunteers/opportunities", label: "Opportunities", icon: <ClipboardCheck className="size-[18px]" /> },
        { href: "/admin/volunteers/hours", label: "Hours", icon: <Clock className="size-[18px]" />, badge: counts.hours },
      ],
    },
    {
      title: "Engage & insights",
      items: [
        { href: "/admin/communications", label: "Email templates", icon: <Mail className="size-[18px]" />, exact: true },
        { href: "/admin/communications/outbox", label: "Email outbox", icon: <Inbox className="size-[18px]" /> },
        { href: "/admin/reports", label: "Reports", icon: <BarChart3 className="size-[18px]" />, roles: fundraising },
        { href: "/admin/import", label: "Import data", icon: <Upload className="size-[18px]" />, roles: ["ADMIN"] },
        { href: "/admin/settings", label: "Settings", icon: <Settings className="size-[18px]" />, roles: ["ADMIN"] },
      ],
    },
  ];

  const isActive = (it: Item) => (it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(it.href + "/"));

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
        <Link href="/admin" onClick={() => setOpen(false)}>
          <Logo light className="h-14" />
        </Link>
        <button className="text-brand-200 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="size-5" />
        </button>
      </div>
      <nav className="scroll-thin flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {sections.map((sec, i) => {
          const items = sec.items.filter((it) => !it.roles || it.roles.includes(user.role));
          if (!items.length) return null;
          return (
            <div key={i}>
              {sec.title ? <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-300/80">{sec.title}</p> : null}
              <ul className="space-y-0.5">
                {items.map((it) => {
                  const active = isActive(it);
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                          active ? "bg-white/12 text-white shadow-inner" : "text-brand-100/90 hover:bg-white/6 hover:text-white",
                        )}
                      >
                        <span className={cn(active ? "text-accent" : "text-brand-300")}>{it.icon}</span>
                        <span className="flex-1">{it.label}</span>
                        {it.badge ? (
                          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-ink">{it.badge}</span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <Link href="/" target="_blank" className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-brand-200 hover:bg-white/6 hover:text-white">
          <ExternalLink className="size-3.5" /> View public site
        </Link>
        <div className="flex items-center gap-3 rounded-xl bg-white/6 px-3 py-2.5">
          <Avatar name={user.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="text-[11px] capitalize text-brand-300">{user.role.toLowerCase()}</p>
          </div>
          <form action={logoutAction}>
            <button className="rounded-md p-1.5 text-brand-200 hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="size-6 text-slate-700" />
        </button>
        <Logo compact />
        <Avatar name={user.name} size="sm" />
      </div>

      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-64 bg-brand-900 lg:block">{nav}</aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-brand-900 shadow-xl">{nav}</aside>
        </div>
      )}
    </>
  );
}
