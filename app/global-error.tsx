"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body className="grid min-h-screen place-items-center bg-[#0c0c0d] px-6 font-sans text-[#ececee]">
        <main className="max-w-sm text-center">
          <p className="text-lg font-semibold">Keep couldn&apos;t start</p>
          <p className="mt-2 text-sm text-[#8f8f98]">
            Reload the application. Notes saved in this browser will remain available.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-4 rounded-md bg-[#2b60f2] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#527ef3]"
          >
            Reload Keep
          </button>
        </main>
      </body>
    </html>
  );
}
