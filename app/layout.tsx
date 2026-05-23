import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keep",
  description: "Keep notes.",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
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
    >
      <body className="h-full flex flex-col bg-[var(--color-background)] text-[var(--color-text)]">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
