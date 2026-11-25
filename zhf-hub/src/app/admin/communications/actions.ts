"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { deliver, render } from "@/lib/email";
import { bool, str } from "@/lib/utils";
import { getSettings } from "@/lib/settings";
import { SAMPLE_VARS } from "@/lib/email-samples";

export async function saveTemplate(id: string, fd: FormData) {
  await requireStaff(["ADMIN", "STAFF"]);
  const subject = str(fd.get("subject"));
  const body = str(fd.get("body"));
  if (!subject || !body) redirect(`/admin/communications/${id}?err=Subject and body are required`);
  await db.emailTemplate.update({ where: { id }, data: { subject, body, enabled: bool(fd.get("enabled")) } });
  revalidatePath("/admin/communications");
  if (str(fd.get("intent")) === "test") {
    const staff = await requireStaff();
    const user = await db.user.findUnique({ where: { id: staff.userId } });
    const settings = await getSettings();
    const vars = { ...SAMPLE_VARS, org_name: settings.orgName, org_phone: settings.phone, org_email: settings.email, org_address: settings.address, org_ein: settings.ein };
    await deliver({ to: user!.email, toName: user!.name, subject: `[TEST] ${render(subject, vars)}`, body: render(body, vars), templateKey: null });
    redirect(`/admin/communications/${id}?ok=Test email sent to ${user!.email}`);
  }
  redirect(`/admin/communications/${id}?ok=Template saved`);
}
