"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("render.error", { digest: error.digest ?? "unknown" });
  }, [error]);

  return (
    <main className="page flex flex-1 items-center justify-center">
      <section className="surface w-full max-w-lg p-8 text-center">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="mt-2 text-3xl font-bold text-brand-navy">We could not complete that request.</h1>
        <p className="mt-3 text-zinc-600">Please try again. If the problem continues, return to the dashboard.</p>
        <button className="btn-primary mt-6" type="button" onClick={reset}>Try again</button>
      </section>
    </main>
  );
}
