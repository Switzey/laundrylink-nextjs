"use client";

import Image from "next/image";
import { useState } from "react";

type VendorImageProps = {
  alt: string;
  businessName: string;
  className?: string;
  fileId: number | null | undefined;
  kind: "cover" | "logo";
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function VendorImage({ alt, businessName, className, fileId, kind }: VendorImageProps) {
  const [failed, setFailed] = useState(false);

  if (!fileId || failed) {
    return (
      <div
        aria-label={alt}
        className={`grid h-full w-full place-items-center bg-[linear-gradient(135deg,#eff6ff,#ecfdf5)] font-bold text-brand-blue ${kind === "logo" ? "text-sm" : "px-6 text-center text-lg"}`}
        role="img"
      >
        {kind === "logo" ? initials(businessName) : businessName}
      </div>
    );
  }

  return (
    <Image
      alt={alt}
      className={className}
      fill
      onError={() => setFailed(true)}
      src={`/api/vendor-files/${fileId}`}
      unoptimized
    />
  );
}
