"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Fires an anonymous page-view beacon on each route change. No cookies, no
// identifiers — the server derives everything it stores (see lib/analytics).
// Honors Do Not Track and Global Privacy Control: if either is set, we send
// nothing.
export function AnalyticsBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return;

    const payload = JSON.stringify({
      type: "pageview",
      path: pathname,
      referrer: document.referrer,
    });
    try {
      if (nav.sendBeacon) {
        nav.sendBeacon("/api/analytics", new Blob([payload], { type: "application/json" }));
      } else {
        void fetch("/api/analytics", {
          method: "POST",
          body: payload,
          headers: { "Content-Type": "application/json" },
          keepalive: true,
        });
      }
    } catch {
      /* analytics must never break the page */
    }
  }, [pathname]);

  return null;
}
