"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { bool, optDate, optStr, slugify, str, toCents } from "@/lib/utils";

const ROLES = ["ADMIN", "STAFF"];

export async function saveCampaign(id: string | null, fd: FormData) {
  await requireStaff(ROLES);
  const name = str(fd.get("name"));
  if (!name) redirect(`/admin/campaigns?err=Campaign name is required`);
  let slug = slugify(str(fd.get("slug")) || name);
  const clash = await db.campaign.findFirst({ where: { slug, ...(id ? { NOT: { id } } : {}) } });
  if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const goal = toCents(str(fd.get("goal")));
  const isDefault = bool(fd.get("isDefault"));
  const data = {
    name,
    slug,
    description: optStr(fd.get("description")),
    goalCents: Number.isFinite(goal) && goal > 0 ? goal : null,
    startDate: optDate(fd.get("startDate")),
    endDate: optDate(fd.get("endDate")),
    active: bool(fd.get("active")),
    isDefault,
  };
  if (isDefault) await db.campaign.updateMany({ data: { isDefault: false } });
  const c = id ? await db.campaign.update({ where: { id }, data }) : await db.campaign.create({ data });
  revalidatePath("/admin/campaigns");
  redirect(`/admin/campaigns/${c.id}?ok=Campaign saved`);
}

export async function saveFund(id: string | null, fd: FormData) {
  await requireStaff(ROLES);
  const name = str(fd.get("name"));
  if (!name) redirect(`/admin/campaigns?tab=funds&err=Fund name is required`);
  const isDefault = bool(fd.get("isDefault"));
  const data = { name, description: optStr(fd.get("description")), active: id ? bool(fd.get("active")) : true, isDefault };
  if (isDefault) await db.fund.updateMany({ data: { isDefault: false } });
  try {
    if (id) await db.fund.update({ where: { id }, data });
    else await db.fund.create({ data });
  } catch {
    redirect(`/admin/campaigns?tab=funds&err=A fund with that name already exists`);
  }
  revalidatePath("/admin/campaigns");
  redirect(`/admin/campaigns?tab=funds&ok=Fund saved`);
}
