import path from "node:path";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // camera is used by the check-in QR scanner; nothing else needs device access
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Docker / Azure builds set NEXT_STANDALONE=1 for a self-contained server bundle
  output: process.env.NEXT_STANDALONE ? "standalone" : undefined,
  // this folder is the app root (don't let a lockfile higher up the disk confuse tracing)
  outputFileTracingRoot: path.resolve(__dirname),
  serverExternalPackages: ["@prisma/client", "bcryptjs", "qrcode"],
  images: { unoptimized: true },
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/statement/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
