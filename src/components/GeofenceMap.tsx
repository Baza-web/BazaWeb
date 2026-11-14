"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/loadGoogleMaps";

const DEFAULT_CENTER = { lat: 6.9271, lng: 79.8612 }; // Colombo, Sri Lanka — just a starting point when nothing is set yet

/** Click or drag the pin to set a branch's clock-in location; the circle shows the current radius. */
export function GeofenceMap({
  apiKey,
  latitude,
  longitude,
  radiusM,
  onPick,
}: {
  apiKey: string;
  latitude: number | null;
  longitude: number | null;
  radiusM: number | null;
  onPick: (lat: number, lng: number) => void;
}) {
  const mapElRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<GoogleMarker | null>(null);
  const circleRef = useRef<GoogleCircle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !mapElRef.current || !window.google) return;
        const center = latitude != null && longitude != null ? { lat: latitude, lng: longitude } : DEFAULT_CENTER;
        const map = new window.google.maps.Map(mapElRef.current, {
          center,
          zoom: latitude != null ? 17 : 12,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        const marker = new window.google.maps.Marker({ position: center, map, draggable: true });
        const circle = new window.google.maps.Circle({
          center,
          radius: radiusM ?? 150,
          map,
          strokeColor: "#c9801f",
          fillColor: "#c9801f",
          fillOpacity: 0.12,
        });
        markerRef.current = marker;
        circleRef.current = circle;

        window.google.maps.event.addListener(marker, "dragend", () => {
          const pos = marker.getPosition();
          if (!pos) return;
          circle.setCenter({ lat: pos.lat(), lng: pos.lng() });
          onPick(pos.lat(), pos.lng());
        });
        window.google.maps.event.addListener(map, "click", (e: { latLng: GoogleLatLng }) => {
          const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          marker.setPosition(pos);
          circle.setCenter(pos);
          onPick(pos.lat, pos.lng);
        });
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load Google Maps — check that the API key is valid and billing is enabled.");
      });
    return () => {
      cancelled = true;
    };
    // Map is created once per mount; radius updates are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Keep the circle in sync when the radius input changes without rebuilding the map.
  useEffect(() => {
    circleRef.current?.setRadius(radiusM ?? 150);
  }, [radiusM]);

  if (error) {
    return <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>;
  }

  return (
    <div>
      <div ref={mapElRef} className="h-56 w-full rounded-lg border border-stone-200" />
      <p className="mt-1 text-xs text-stone-400">Click the map or drag the pin to set this branch's clock-in location.</p>
    </div>
  );
}
