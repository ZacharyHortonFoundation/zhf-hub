import { Suspense } from "react";
import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import { FlashToast } from "@/components/client-ui";
import { getVolunteer } from "@/lib/auth";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const vol = await getVolunteer();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader volunteerName={vol?.name ?? null} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <Suspense>
        <FlashToast />
      </Suspense>
    </div>
  );
}
