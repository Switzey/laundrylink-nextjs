"use client";

import { useState } from "react";
import { Apple, LoaderCircle } from "lucide-react";

export function OAuthButtons({ returnTo }: { returnTo?: string | null }) {
  const [pending, setPending] = useState<"google" | "apple" | null>(null);
  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
  return (
    <div className="mt-6 grid gap-3">
      <a className="oauth-button" href={`/api/auth/oauth/google/start${query}`} onClick={() => setPending("google")} aria-disabled={pending !== null}>
        {pending === "google" ? <LoaderCircle aria-hidden="true" className="animate-spin" size={18} /> : <span aria-hidden="true" className="oauth-google">G</span>}
        Continue with Google
      </a>
      <a className="oauth-button" href={`/api/auth/oauth/apple/start${query}`} onClick={() => setPending("apple")} aria-disabled={pending !== null}>
        {pending === "apple" ? <LoaderCircle aria-hidden="true" className="animate-spin" size={18} /> : <Apple aria-hidden="true" size={19} />}
        Continue with Apple
      </a>
    </div>
  );
}
