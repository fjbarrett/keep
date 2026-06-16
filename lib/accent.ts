// macOS-style accent colors. Picking one overrides --color-accent (and friends)
// app-wide, which re-tints every accent button, the logo, and the favicon.
// "multicolor" is the default: it clears the override so the app uses its own
// built-in blue, and shows a rainbow swatch.

export type AccentKey =
  | "multicolor"
  | "blue"
  | "purple"
  | "pink"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "graphite";

export type Accent = {
  key: AccentKey;
  label: string;
  color: string;
  hover: string;
  fg: string; // text/icon color that sits on top of `color`
};

export const ACCENTS: Accent[] = [
  { key: "multicolor", label: "Multicolor", color: "#2b60f2", hover: "#527ef3", fg: "#ffffff" },
  { key: "blue", label: "Blue", color: "#2b60f2", hover: "#527ef3", fg: "#ffffff" },
  { key: "purple", label: "Purple", color: "#9a5cf0", hover: "#ad77f4", fg: "#ffffff" },
  { key: "pink", label: "Pink", color: "#f4408c", hover: "#f76aa6", fg: "#ffffff" },
  { key: "red", label: "Red", color: "#f0564a", hover: "#f37a70", fg: "#ffffff" },
  { key: "orange", label: "Orange", color: "#f5872b", hover: "#f7a052", fg: "#ffffff" },
  { key: "yellow", label: "Yellow", color: "#e0a30f", hover: "#eab534", fg: "#16161a" },
  { key: "green", label: "Green", color: "#3fb463", hover: "#5cc47d", fg: "#ffffff" },
  { key: "graphite", label: "Graphite", color: "#8b8b94", hover: "#a0a0a8", fg: "#ffffff" },
];

export const ACCENT_STORAGE_KEY = "keep.accent";
const ACCENT_VARS = [
  "--color-accent",
  "--color-accent-hover",
  "--color-accent-border",
  "--color-accent-fg",
] as const;

export function accentFor(key: string | null | undefined): Accent {
  return ACCENTS.find((a) => a.key === key) ?? ACCENTS[0];
}

export function readStoredAccent(): AccentKey {
  if (typeof window === "undefined") return "multicolor";
  const k = window.localStorage.getItem(ACCENT_STORAGE_KEY);
  return ACCENTS.some((a) => a.key === k) ? (k as AccentKey) : "multicolor";
}

export function storeAccent(key: AccentKey) {
  if (typeof window !== "undefined") window.localStorage.setItem(ACCENT_STORAGE_KEY, key);
}

/** The note's app icon as an SVG string, tinted with `color`. */
function iconSvg(color: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="14" fill="${color}"/>` +
    `<rect x="20" y="19" width="24" height="26" rx="2" stroke="#fff" stroke-width="3" fill="none"/>` +
    `<rect x="30" y="19" width="14" height="9" rx="1" fill="#fff"/>` +
    `<rect x="22" y="31" width="20" height="12" rx="1" stroke="#fff" stroke-width="2.5" fill="none"/>` +
    `</svg>`
  );
}

function setFavicon(href: string) {
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
  if (links.length === 0) {
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = href;
    document.head.appendChild(link);
    return;
  }
  links.forEach((l) => {
    l.type = "image/svg+xml";
    l.href = href;
  });
}

/** Apply an accent client-side: CSS vars (buttons + logo) and the tab favicon. */
export function applyAccent(key: AccentKey) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (key === "multicolor") {
    for (const v of ACCENT_VARS) root.style.removeProperty(v);
    setFavicon("/icon.svg");
    return;
  }
  const a = accentFor(key);
  root.style.setProperty("--color-accent", a.color);
  root.style.setProperty("--color-accent-hover", a.hover);
  root.style.setProperty("--color-accent-border", a.color);
  root.style.setProperty("--color-accent-fg", a.fg);
  setFavicon("data:image/svg+xml," + encodeURIComponent(iconSvg(a.color)));
}

/**
 * Inline <head> script that applies the stored accent's CSS vars before first
 * paint, so buttons and the logo don't flash the default blue. Single source of
 * truth: the value map is derived from ACCENTS. (Favicon is set after mount.)
 */
export function accentBootstrapScript(): string {
  const map: Record<string, [string, string, string]> = {};
  for (const a of ACCENTS) {
    if (a.key === "multicolor") continue;
    map[a.key] = [a.color, a.hover, a.fg];
  }
  return (
    `(function(){try{var k=localStorage.getItem(${JSON.stringify(ACCENT_STORAGE_KEY)});` +
    `if(!k||k==="multicolor")return;var m=${JSON.stringify(map)},v=m[k];if(!v)return;` +
    `var s=document.documentElement.style;` +
    `s.setProperty("--color-accent",v[0]);s.setProperty("--color-accent-hover",v[1]);` +
    `s.setProperty("--color-accent-border",v[0]);s.setProperty("--color-accent-fg",v[2]);` +
    `}catch(e){}})()`
  );
}
