// Low-risk hardening headers applied to every response. A strict CSP is
// intentionally omitted: the app ships inline bootstrap scripts (theme +
// accent) that a nonce-less CSP would block, so a real CSP needs nonce
// plumbing through middleware — a separate change. HSTS is handled by Caddy.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Google user-content (avatar) host. Without this, next/image throws
    // "hostname not configured" when rendering session.user.image.
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
