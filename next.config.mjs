// Low-risk hardening headers applied to every response. The Content-Security-
// Policy is set per-request in proxy.ts instead (it needs a fresh nonce
// for the inline bootstrap scripts, which a static header can't carry).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin workspace discovery to this app. A package-lock higher in a developer's
  // home directory should not make Turbopack infer a different repository root.
  turbopack: {
    root: process.cwd(),
  },
  images: {
    // Google user-content (avatar) host. Without this, next/image throws
    // "hostname not configured" when rendering session.user.image.
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
