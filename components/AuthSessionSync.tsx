"use client";

import { useEffect } from "react";
import { clearOwnerData } from "@/lib/offlineDb";

/** Clear cached notes and leave the app when another tab signs out. */
export function AuthSessionSync() {
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== "keep.signout" || !event.newValue) return;
      try {
        const message = JSON.parse(event.newValue) as { ownerId?: unknown };
        if (typeof message.ownerId !== "string") return;
        void clearOwnerData(message.ownerId).finally(() => window.location.assign("/signin"));
      } catch {
        // Ignore malformed local events from unrelated scripts/extensions.
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return null;
}
