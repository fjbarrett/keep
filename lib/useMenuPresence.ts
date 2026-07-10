import { useEffect, useState } from "react";

/**
 * Keeps a popup mounted briefly after `open` flips false so its exit
 * animation can play. `closing` is true during that grace period — put it on
 * a data attribute and drive the animation from CSS.
 */
export function useMenuPresence(open: boolean, closeMs = 90) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    const timer = window.setTimeout(() => setMounted(false), closeMs);
    return () => window.clearTimeout(timer);
  }, [open, mounted, closeMs]);
  return { mounted, closing: mounted && !open };
}
