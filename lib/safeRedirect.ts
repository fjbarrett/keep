/**
 * Returns `from` only when it's a same-origin relative path, else "/".
 * Rejects absolute URLs and protocol-relative "//evil.com" so a ?from=
 * parameter can't redirect an authenticated user off-site.
 */
export function safeRedirect(from: unknown): string {
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) {
    return "/";
  }
  if (from.includes("\\") || /%5c/i.test(from) || /[\u0000-\u001f\u007f]/.test(from)) {
    return "/";
  }
  try {
    const base = new URL("https://keep.invalid");
    const resolved = new URL(from, base);
    if (resolved.origin !== base.origin) return "/";
    const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
    // A dot-segment input like "/..//evil.com" resolves to pathname "//evil.com"
    // — same origin here, but a protocol-relative URL once the browser follows
    // the redirect. Reject any result that isn't a single-slash-rooted path.
    if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
      return "/";
    }
    return path;
  } catch {
    return "/";
  }
}
