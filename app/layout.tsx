import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorker";
import { AccentInit } from "@/components/AccentInit";
import { accentBootstrapScript } from "@/lib/accent";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keep",
  description: "Keep notes.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);else if(window.matchMedia("(prefers-color-scheme:light)").matches)document.documentElement.setAttribute("data-theme","light")})()`,
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: accentBootstrapScript() }} />
      </head>
      <body className="h-full flex flex-col bg-[var(--color-background)] text-[var(--color-text)]">
        {children}
        <AccentInit />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
