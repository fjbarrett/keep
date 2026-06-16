/**
 * Returns `from` only when it's a same-origin relative path, else "/".
 * Rejects absolute URLs and protocol-relative "//evil.com" so a ?from=
 * parameter can't redirect an authenticated user off-site.
 */
export function safeRedirect(from: string | undefined | null): string {
  return from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
}
