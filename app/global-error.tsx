"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ display: "grid", minHeight: "100vh", placeItems: "center", background: "#0c0c0d", color: "#ececee", padding: "0 24px", margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 384, textAlign: "center" }}>
          <p style={{ fontSize: 18, fontWeight: 600 }}>Keep couldn&apos;t start</p>
          <p style={{ fontSize: 14, color: "#aaaab3" }}>
            Reload the application. Notes saved in this browser will remain available.
          </p>
          {error.digest && <p>Reference: {error.digest}</p>}
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 16, borderRadius: 6, background: "#2b60f2", color: "white", border: 0, padding: "8px 12px", cursor: "pointer" }}
          >
            Reload Keep
          </button>
        </main>
      </body>
    </html>
  );
}
