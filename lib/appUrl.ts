/** Canonical origin for links that carry credentials such as verification tokens. */
export function appOrigin(req: Request): string {
  const configured = process.env.AUTH_URL;
  if (configured) return new URL(configured).origin;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_URL must be configured in production");
  }
  return new URL(req.url).origin;
}

export function isSameOriginMutation(req: Request): boolean {
  // Sec-Fetch-Site is browser-asserted and authoritative when present. Behind
  // the reverse proxy the request URL is the internal listen origin, so the
  // Origin header is only compared (against the configured public origin) for
  // older browsers that don't send Sec-Fetch-Site.
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin" || fetchSite === "none";
  const origin = req.headers.get("origin");
  return !origin || origin === appOrigin(req);
}
