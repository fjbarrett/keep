import { useEffect } from "react";

// Marks the element with data-scrolling while the user scrolls (cleared 800ms
// after the last scroll event); globals.css keeps the scrollbar thumb
// transparent unless that flag is present.
export function useAutohideScrollbar(
  ref: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: number | undefined;
    const onScroll = () => {
      el.dataset.scrolling = "true";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        delete el.dataset.scrolling;
      }, 800);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
    };
  }, [ref]);
}
