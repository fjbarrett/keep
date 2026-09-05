/** RFC 5987 Unicode filename with a header-safe ASCII fallback. */
export function downloadDisposition(kind: "attachment" | "inline", filename: string) {
  const safe = new TextDecoder().decode(new TextEncoder().encode(filename))
    .replace(/[\x00-\x1f\x7f/\\]/g, "_");
  const fallback = safe.replace(/[^\x20-\x7e]|["%]/g, "_") || "note.txt";
  const encoded = encodeURIComponent(safe || "note.txt")
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
