"use client";

import { useEffect, useRef, useState } from "react";
import type { CircleMarker, Map } from "leaflet";
import { LocateFixed, MapPin, X } from "lucide-react";

type Coordinates = { latitude: number; longitude: number };

export function AddressMapPicker({ initialLatitude, initialLongitude }: { initialLatitude?: number | null; initialLongitude?: number | null }) {
  const initialPosition = useRef<Coordinates | null>(initialLatitude !== null && initialLatitude !== undefined && initialLongitude !== null && initialLongitude !== undefined
    ? { latitude: initialLatitude, longitude: initialLongitude }
    : null);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<CircleMarker | null>(null);
  const circleMarkerRef = useRef<typeof import("leaflet").circleMarker | null>(null);
  const [position, setPosition] = useState<Coordinates | null>(() =>
    initialLatitude !== null && initialLatitude !== undefined && initialLongitude !== null && initialLongitude !== undefined
      ? { latitude: initialLatitude, longitude: initialLongitude }
      : null,
  );
  const [locationError, setLocationError] = useState("");

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    let disposed = false;
    void import("leaflet").then((module) => {
      if (disposed || !container.current) return;
      const L = module.default;
      circleMarkerRef.current = L.circleMarker;
      const startingPosition = initialPosition.current;
      const map = L.map(container.current, { scrollWheelZoom: false }).setView(
        startingPosition ? [startingPosition.latitude, startingPosition.longitude] : [6.5244, 3.3792],
        startingPosition ? 16 : 11,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      if (startingPosition) {
        markerRef.current = L.circleMarker([startingPosition.latitude, startingPosition.longitude], {
          radius: 9,
          color: "#ffffff",
          fillColor: "#2563eb",
          fillOpacity: 1,
          weight: 3,
        }).addTo(map);
      }
      map.on("click", (event) => setPosition({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
      mapRef.current = map;
    });
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const circleMarker = circleMarkerRef.current;
    const map = mapRef.current;
    if (!circleMarker || !map) return;
    markerRef.current?.remove();
    markerRef.current = null;
    if (!position) return;
    markerRef.current = circleMarker([position.latitude, position.longitude], {
      radius: 9,
      color: "#ffffff",
      fillColor: "#2563eb",
      fillOpacity: 1,
      weight: 3,
    }).addTo(map);
  }, [position]);

  function useCurrentLocation() {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Location access is not supported by this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const next = { latitude: coords.latitude, longitude: coords.longitude };
        setPosition(next);
        mapRef.current?.setView([next.latitude, next.longitude], 16);
      },
      () => setLocationError("We could not access your location. You can select it directly on the map."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <div className="form-grid">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="field-label mb-0">Map location</span>
        <div className="flex gap-2">
          <button className="btn-secondary" type="button" onClick={useCurrentLocation}><LocateFixed size={16} />Use my location</button>
          {position && <button className="icon-button" type="button" onClick={() => setPosition(null)} aria-label="Clear map location"><X size={16} /></button>}
        </div>
      </div>
      <div ref={container} className="address-map" role="region" aria-label="Select an address location on the map" />
      <input type="hidden" name="latitude" value={position?.latitude ?? ""} />
      <input type="hidden" name="longitude" value={position?.longitude ?? ""} />
      <p className="flex items-center gap-2 text-xs text-zinc-500"><MapPin size={14} />{position ? `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}` : "Click the map to pin the pickup entrance."}</p>
      {locationError && <p className="text-sm text-rose-700" role="alert">{locationError}</p>}
    </div>
  );
}
