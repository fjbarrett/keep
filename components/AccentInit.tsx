"use client";

import { useEffect } from "react";
import { applyAccent, readStoredAccent } from "@/lib/accent";

// Applies the stored accent's favicon (and re-asserts the CSS vars) on load.
// The inline bootstrap script already set the vars before paint; this covers
// the tab favicon, which can't be set from the blocking head script.
export function AccentInit() {
  useEffect(() => {
    applyAccent(readStoredAccent());
  }, []);
  return null;
}
