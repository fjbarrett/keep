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
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  const origin = req.headers.get("origin");
  return !origin || origin === appOrigin(req);
}
