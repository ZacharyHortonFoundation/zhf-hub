"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword, requireStaff } from "@/lib/auth";
import { saveSettings } from "@/lib/settings";
import { recomputeAllGiving } from "@/lib/rollups";
import { bool, str, toCents } from "@/lib/utils";

export async function saveOrgSettings(fd: FormData) {
  await requireStaff(["ADMIN"]);
  const presets = str(fd.get("presetAmounts"))
    .split(/[,\s]+/)
    .map((x) => Number(x.replace(/[$]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 6);
  await saveSettings({
    orgName: str(fd.get("orgName")) || undefined,
    ein: str(fd.get("ein")),
    address: str(fd.get("address")),
    phone: str(fd.get("phone")),
    email: str(fd.get("email")),
    website: str(fd.get("website")),
    feePercent: Number(str(fd.get("feePercent"))) || 2.9,
    feeFixedCents: Number.isFinite(toCents(str(fd.get("feeFixed")))) ? toCents(str(fd.get("feeFixed"))) : 30,
    presetAmounts: presets.length ? presets : undefined,
    donateHeadline: str(fd.get("donateHeadline")) || undefined,
    donateIntro: str(fd.get("donateIntro")) || undefined,
    receiptFooter: str(fd.get("receiptFooter")) || undefined,
    requireApprovalForSignup: bool(fd.get("requireApprovalForSignup")),
  });
  revalidatePath("/", "layout");
  redirect("/admin/settings?ok=Settings saved");
}

export async function saveDonorLevels(fd: FormData) {
  await requireStaff(["ADMIN"]);
  const levels = await db.donorLevel.findMany();
  for (const l of levels) {
    const min = toCents(str(fd.get(`min_${l.id}`)));
    const gifts = parseInt(str(fd.get(`gifts_${l.id}`)), 10);
    await db.donorLevel.update({
      where: { id: l.id },
      data: { minLifetimeCents: Number.isFinite(min) ? min : l.minLifetimeCents, minGifts: Number.isFinite(gifts) ? gifts : l.minGifts },
    });
  }
  await recomputeAllGiving();
  redirect("/admin/settings?tab=levels&ok=Donor levels updated and recalculated");
}

export async function createUser(fd: FormData) {
  await requireStaff(["ADMIN"]);
  const email = str(fd.get("email")).toLowerCase();
  const name = str(fd.get("name"));
  const password = str(fd.get("password"));
  if (!email || !name || password.length < 10) redirect("/admin/settings?tab=users&err=Name, email and a password of at least 10 characters are required");
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) redirect("/admin/settings?tab=users&err=That email already has an account");
  await db.user.create({ data: { email, name, role: str(fd.get("role")) || "STAFF", passwordHash: await hashPassword(password) } });
  redirect("/admin/settings?tab=users&ok=Staff account created");
}

export async function updateUser(id: string, fd: FormData) {
  const me = await requireStaff(["ADMIN"]);
  const role = str(fd.get("role"));
  const active = bool(fd.get("active"));
  if (id === me.userId && (!active || role !== "ADMIN")) redirect("/admin/settings?tab=users&err=You can't remove your own admin access");
  const password = str(fd.get("password"));
  if (password && password.length < 10) redirect("/admin/settings?tab=users&err=Passwords must be at least 10 characters");
  await db.user.update({
    where: { id },
    data: { role: role || undefined, active, ...(password ? { passwordHash: await hashPassword(password) } : {}) },
  });
  redirect("/admin/settings?tab=users&ok=Account updated");
}

export async function deleteTag(id: string) {
  await requireStaff(["ADMIN"]);
  await db.tag.delete({ where: { id } });
  revalidatePath("/admin/settings");
}
