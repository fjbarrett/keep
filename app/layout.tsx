import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorker";
import { AccentInit } from "@/components/AccentInit";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { accentBootstrapScript } from "@/lib/accent";
import { AuthSessionSync } from "@/components/AuthSessionSync";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keep",
  description: "Keep notes.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // CSP nonce minted per-request in proxy.ts; both inline bootstrap scripts
  // carry it so they survive the script-src nonce policy.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);else if(window.matchMedia("(prefers-color-scheme:light)").matches)document.documentElement.setAttribute("data-theme","light")})()`,
          }}
        />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: accentBootstrapScript() }} />
      </head>
      <body className="h-full flex flex-col bg-[var(--color-background)] text-[var(--color-text)]">
        {children}
        <AccentInit />
        <AnalyticsBeacon />
        <ServiceWorkerRegistrar />
        <AuthSessionSync />
      </body>
    </html>
  );
}
