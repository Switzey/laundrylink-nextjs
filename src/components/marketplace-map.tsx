"use client";

import { useEffect, useRef } from "react";
import type { MarketplaceVendor } from "@/lib/marketplace-model";

export function MarketplaceMap({ vendors }: { vendors: MarketplaceVendor[] }) {
  const container = useRef<HTMLDivElement>(null);
  const mapped = vendors.filter((vendor) => vendor.latitude !== null && vendor.longitude !== null);

  useEffect(() => {
    if (!container.current || !mapped.length) return;
    let disposed = false;
    let cleanup = () => {};

    void import("leaflet").then((module) => {
      if (disposed || !container.current) return;
      const L = module.default;
      const bounds = L.latLngBounds(mapped.map((vendor) => [Number(vendor.latitude), Number(vendor.longitude)]));
      const map = L.map(container.current, { scrollWheelZoom: false, zoomControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      for (const vendor of mapped) {
        const location: [number, number] = [Number(vendor.latitude), Number(vendor.longitude)];
        L.circle(location, {
          radius: Math.max(Number(vendor.delivery_radius_km), Number(vendor.pickup_radius_km)) * 1000,
          color: "#2563eb",
          fillColor: "#60a5fa",
          fillOpacity: 0.08,
          weight: 1,
        }).addTo(map);
        const marker = L.circleMarker(location, {
          radius: 9,
          color: "#ffffff",
          fillColor: vendor.is_bookable ? "#0f766e" : "#b45309",
          fillOpacity: 1,
          weight: 3,
        }).addTo(map);
        const popup = document.createElement("div");
        const name = document.createElement("strong");
        const details = document.createElement("p");
        const link = document.createElement("a");
        name.textContent = vendor.business_name;
        details.textContent = `${Number(vendor.rating).toFixed(1)} rating · ${vendor.area || vendor.city}`;
        link.href = `/cleaners/${vendor.id}`;
        link.textContent = "View cleaner";
        popup.append(name, details, link);
        marker.bindPopup(popup);
      }

      if (mapped.length === 1) map.setView(bounds.getCenter(), 13);
      else map.fitBounds(bounds.pad(0.25), { maxZoom: 14 });
      cleanup = () => map.remove();
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [mapped]);

  if (!mapped.length) {
    return <div className="surface empty">Location pins will appear when matching vendors provide verified map coordinates.</div>;
  }

  return <div ref={container} className="marketplace-map" role="region" aria-label={`Map showing ${mapped.length} laundry vendor locations`} />;
}
