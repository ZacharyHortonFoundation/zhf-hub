import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/payments";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/donate", "/events", "/volunteer"],
      disallow: ["/admin", "/api", "/login", "/statement", "/volunteer/portal", "/volunteer/reset", "/events/order", "/donate/thank-you"],
    },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
