import type { NextConfig } from "next";
import path from "path";

/**
 * Security headers for every response.
 *
 * The Content-Security-Policy is applied in production only: Next's dev server
 * needs eval and websockets. In production it allows only this site's own
 * scripts, styles, images and connections (plus the inline script/style Next
 * itself emits, which a nonce-based policy would tighten later), and forbids
 * being framed, so the app can not be clickjacked.
 */
const isProd = process.env.NODE_ENV === "production";

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // The installable app: its service worker and manifest come from this site only
  "worker-src 'self'",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  ...(isProd ? [{ key: "Content-Security-Policy", value: csp }] : []),
];

const nextConfig: NextConfig = {
  transpilePackages: ["@fintrack/domain"],
  // monorepo: allow importing from packages
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // native Argon2id binding for password hashing
  serverExternalPackages: ["argon2"],
  // Do not advertise the framework
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The service worker must always be re-checked, or an update would never arrive
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
