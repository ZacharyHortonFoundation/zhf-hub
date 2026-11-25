import { NextResponse, type NextRequest } from "next/server";
import { STAFF_COOKIE, VOLUNTEER_COOKIE, verifySession } from "@/lib/session";

/**
 * Old AHA / Power Pages URLs (matched case-insensitively) → new pages, so links in past
 * emails, social posts and zacharyhortonfoundation.org keep working after cutover.
 */
const LEGACY: Record<string, string> = {
  "/donate": "/donate",
  "/donations": "/donate",
  "/home": "/",
  "/volunteerhome": "/volunteer",
  "/volunteerhome/opportunities": "/volunteer/opportunities",
  "/volunteerhome/programs": "/volunteer/opportunities",
  "/volunteerhome/volunteerapplicationpage": "/volunteer/apply",
  "/volunteerhome/dashboard": "/volunteer/portal",
  "/signin": "/volunteer/login",
  "/account/login/login": "/volunteer/login",
  "/profile": "/volunteer/portal",
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Legacy portal redirects ──
  const lower = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  if (lower === "/volunteerhome/opportunity-details" || lower === "/events/event-details") {
    const url = req.nextUrl.clone();
    url.pathname = lower.startsWith("/events") ? "/api/legacy/event" : "/api/legacy/opportunity";
    return NextResponse.redirect(url, 301);
  }
  const target = LEGACY[lower];
  if (target && target !== pathname) {
    const url = req.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url, 301);
  }

  // ── Staff console ──
  if (pathname.startsWith("/admin")) {
    const s = await verifySession(req.cookies.get(STAFF_COOKIE)?.value);
    if (!s || s.kind !== "staff") {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
  }

  // ── Volunteer portal ──
  if (pathname.startsWith("/volunteer/portal")) {
    const s = await verifySession(req.cookies.get(VOLUNTEER_COOKIE)?.value);
    if (!s || s.kind !== "volunteer") {
      const url = req.nextUrl.clone();
      url.pathname = "/volunteer/login";
      url.search = `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  // everything except static assets
  matcher: ["/((?!_next/static|_next/image|brand/|icon.svg|favicon.ico|robots.txt|sitemap.xml).*)"],
};
