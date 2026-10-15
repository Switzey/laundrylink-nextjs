"use client";

import { useState } from "react";
import { LocateFixed, LoaderCircle } from "lucide-react";

export function NearMeButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  function locate() {
    if (!navigator.geolocation) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const url = new URL(window.location.href);
        url.pathname = "/cleaners";
        url.searchParams.set("lat", coords.latitude.toFixed(6));
        url.searchParams.set("lng", coords.longitude.toFixed(6));
        url.searchParams.set("sort", "nearest");
        window.location.assign(url.toString());
      },
      () => setStatus("error"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  return (
    <div>
      <button className="btn-secondary w-full" type="button" onClick={locate} disabled={status === "loading"}>
        {status === "loading" ? <LoaderCircle aria-hidden="true" className="animate-spin" size={17} /> : <LocateFixed aria-hidden="true" size={17} />}
        {status === "loading" ? "Finding you..." : "Use my location"}
      </button>
      {status === "error" && <p className="mt-2 text-xs text-rose-700" role="alert">Location is unavailable. Search by area instead.</p>}
    </div>
  );
}
