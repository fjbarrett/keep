// Extract plain text from a PDF entirely in the browser, so an imported PDF —
// like every other guest import — never leaves the device. pdfjs (and its
// worker) load on demand; the worker is served same-origin, which the CSP's
// `worker-src 'self'` permits.
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Served from public/ (see scripts/copy-pdf-worker.mjs) — same-origin so the
  // CSP allows it, and unbundled so Terser never touches its import.meta.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/[ \t]+/g, " ")
      .trim();
    if (text) pages.push(text);
  }
  return pages.join("\n\n").trim();
}
