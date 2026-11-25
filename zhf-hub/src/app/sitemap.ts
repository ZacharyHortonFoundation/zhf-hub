import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/payments";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const pages: MetadataRoute.Sitemap = ["", "/donate", "/events", "/volunteer", "/volunteer/opportunities", "/volunteer/apply"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "weekly",
  }));
  try {
    const now = new Date();
    const [events, opps] = await Promise.all([
      db.event.findMany({ where: { status: "PUBLISHED", startAt: { gte: now } }, select: { slug: true, updatedAt: true } }),
      db.opportunity.findMany({ where: { status: "PUBLISHED", shifts: { some: { startAt: { gte: now } } } }, select: { id: true } }),
    ]);
    pages.push(...events.map((e) => ({ url: `${base}/events/${e.slug}`, lastModified: e.updatedAt })));
    pages.push(...opps.map((o) => ({ url: `${base}/volunteer/opportunities/${o.id}` })));
  } catch {
    /* database unavailable at build time — static pages only */
  }
  return pages;
}
