import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";

/**
 * Resolves old Power Pages detail links (…/event-details/?id=<Dataverse GUID>) to the
 * migrated record via its legacyId; falls back to the list page if not found.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const id = (req.nextUrl.searchParams.get("id") ?? "").toLowerCase().replace(/[{}]/g, "");
  const to = (path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin), 301);

  if (kind === "event") {
    const ev = id ? await db.event.findUnique({ where: { legacyId: id }, select: { slug: true } }) : null;
    return to(ev ? `/events/${ev.slug}` : "/events");
  }
  if (kind === "opportunity") {
    const opp = id ? await db.opportunity.findUnique({ where: { legacyId: id }, select: { id: true } }) : null;
    return to(opp ? `/volunteer/opportunities/${opp.id}` : "/volunteer/opportunities");
  }
  return to("/");
}
