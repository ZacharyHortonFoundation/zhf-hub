import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/sidebar";
import { FlashToast } from "@/components/client-ui";
import { endStaffSession, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { paymentsMode } from "@/lib/payments";

export const metadata = { title: { default: "ZHF Hub", template: "%s · ZHF Hub" } };

async function logout() {
  "use server";
  await endStaffSession();
  redirect("/login");
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const [applications, hours] = await Promise.all([
    db.volunteerApplication.count({ where: { status: "PENDING" } }),
    db.volunteerHour.count({ where: { status: "PENDING" } }),
  ]);
  const mode = paymentsMode();

  return (
    <div className="min-h-screen bg-[#f6f7f9]">
      <AdminSidebar user={{ name: staff.name, role: staff.role }} counts={{ applications, hours }} logoutAction={logout} />
      <div className="lg:pl-64">
        {mode !== "live" && (
          <div className="no-print border-b border-amber-200 bg-amber-50 px-6 py-1.5 text-center text-xs text-amber-900">
            {mode === "demo"
              ? "Demo mode — no Stripe keys configured, so payments are simulated and flagged as test records."
              : "Stripe TEST mode — use card 4242 4242 4242 4242. Switch to live keys before launch."}
          </div>
        )}
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </div>
      <Suspense>
        <FlashToast />
      </Suspense>
    </div>
  );
}
