import Link from "next/link";
import { Logo } from "@/components/logo";
import { getSettings } from "@/lib/settings";

export async function SiteFooter() {
  const s = await getSettings();
  return (
    <footer className="mt-20 bg-brand-900 text-brand-100">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo light className="h-16" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-brand-200">
            In memory of Zachary John Horton, we provide resources, support and hope for young adults and families affected by addiction.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Get involved</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/donate" className="hover:text-white">Make a donation</Link></li>
            <li><Link href="/donate?frequency=MONTHLY" className="hover:text-white">Give monthly</Link></li>
            <li><Link href="/events" className="hover:text-white">Upcoming events</Link></li>
            <li><Link href="/volunteer" className="hover:text-white">Volunteer with us</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Contact</p>
          <ul className="mt-3 space-y-2 text-sm text-brand-200">
            <li>{s.address}</li>
            <li>{s.phone}</li>
            <li>{s.email}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-brand-300 sm:flex-row sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} {s.orgName}. A 501(c)(3) nonprofit organization{s.ein && !s.ein.includes("X") ? ` · EIN ${s.ein}` : ""}.</span>
          <Link href="/login" className="hover:text-white">Staff login</Link>
        </div>
      </div>
    </footer>
  );
}
