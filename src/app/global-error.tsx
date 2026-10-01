"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("render.global_error", { digest: error.digest ?? "unknown" });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="page flex min-h-screen items-center justify-center">
          <section className="surface w-full max-w-lg p-8 text-center">
            <p className="eyebrow">Something went wrong</p>
            <h1 className="mt-2 text-3xl font-bold text-brand-navy">LaundryLink could not load.</h1>
            <p className="mt-3 text-zinc-600">Please try again in a moment.</p>
            <button className="btn-primary mt-6" type="button" onClick={reset}>Try again</button>
          </section>
        </main>
      </body>
    </html>
  );
}
