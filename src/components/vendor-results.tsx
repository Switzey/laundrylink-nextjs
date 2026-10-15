"use client";

import { useState } from "react";
import Link from "next/link";
import { Scale, X } from "lucide-react";
import { CleanerCard } from "@/components/cleaner-card";
import type { MarketplaceVendor } from "@/lib/marketplace-model";

export function VendorResults({ vendors }: { vendors: MarketplaceVendor[] }) {
  const [selected, setSelected] = useState<number[]>([]);

  function toggle(id: number) {
    setSelected((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : current.length < 3 ? [...current, id] : current);
  }

  return (
    <>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {vendors.map((vendor) => (
          <CleanerCard
            key={vendor.id}
            cleaner={vendor}
            compareControl={
              <label className="flex items-center gap-2 text-xs font-bold text-zinc-600">
                <input
                  type="checkbox"
                  checked={selected.includes(vendor.id)}
                  disabled={!selected.includes(vendor.id) && selected.length >= 3}
                  onChange={() => toggle(vendor.id)}
                />
                Compare
              </label>
            }
          />
        ))}
      </div>
      {selected.length > 0 && (
        <div className="compare-bar" aria-live="polite">
          <div>
            <strong>{selected.length} selected</strong>
            <p>Choose 2 or 3 cleaners to compare.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="icon-button" type="button" aria-label="Clear comparison" onClick={() => setSelected([])}><X size={17} /></button>
            {selected.length >= 2
              ? <Link className="btn-primary" href={`/cleaners/compare?ids=${selected.join(",")}`}><Scale size={17} />Compare cleaners</Link>
              : <span className="btn-secondary cursor-not-allowed opacity-60"><Scale size={17} />Select one more</span>}
          </div>
        </div>
      )}
    </>
  );
}
