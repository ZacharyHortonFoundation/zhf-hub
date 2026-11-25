import { db } from "@/lib/db";
import { eventLocation } from "@/lib/events";
import { appUrl } from "@/lib/payments";

export const dynamic = "force-dynamic";

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold lines longer than 75 octets per RFC 5545. */
function fold(line: string) {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length) {
    parts.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return parts.join("\r\n");
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = await db.event.findUnique({ where: { slug } });
  if (!e || e.status === "DRAFT") return new Response("Not found", { status: 404 });

  const end = e.endAt ?? new Date(e.startAt.getTime() + 2 * 36e5);
  const url = `${appUrl()}/events/${e.slug}`;
  const description = [e.summary, url].filter(Boolean).join("\n\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Zachary Horton Foundation//ZHF Hub//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@zhf-hub`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(e.startAt)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(e.title)}`,
    `DESCRIPTION:${esc(description)}`,
    `LOCATION:${esc(eventLocation(e))}`,
    `URL:${url}`,
    e.status === "CANCELED" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${e.slug}.ics"`,
    },
  });
}
