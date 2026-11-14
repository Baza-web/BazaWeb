"use client";

import { useRef, useState } from "react";
import { updateBranchGeofence } from "@/app/(app)/branches/actions";
import { GeofenceMap } from "./GeofenceMap";

export function GeofenceForm({
  branchId,
  latitude,
  longitude,
  geofenceRadiusM,
  googleMapsApiKey,
}: {
  branchId: string;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusM: number | null;
  googleMapsApiKey: string | null;
}) {
  const latRef = useRef<HTMLInputElement>(null);
  const lngRef = useRef<HTMLInputElement>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [mapLat, setMapLat] = useState(latitude);
  const [mapLng, setMapLng] = useState(longitude);
  const [radius, setRadius] = useState(geofenceRadiusM);

  function handleMapPick(lat: number, lng: number) {
    if (latRef.current) latRef.current.value = lat.toFixed(6);
    if (lngRef.current) lngRef.current.value = lng.toFixed(6);
    setMapLat(lat);
    setMapLng(lng);
  }

  function useCurrentLocation() {
    setLocateError(null);
    if (!("geolocation" in navigator)) {
      setLocateError("Location isn't available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (latRef.current) latRef.current.value = pos.coords.latitude.toFixed(6);
        if (lngRef.current) lngRef.current.value = pos.coords.longitude.toFixed(6);
        setLocating(false);
      },
      () => {
        setLocateError("Couldn't get your location — check browser permissions.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <form action={updateBranchGeofence.bind(null, branchId)} className="space-y-2">
      {googleMapsApiKey && (
        <GeofenceMap apiKey={googleMapsApiKey} latitude={mapLat} longitude={mapLng} radiusM={radius} onPick={handleMapPick} />
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label text-xs">Latitude</label>
          <input
            ref={latRef}
            className="input w-28 text-xs"
            name="latitude"
            type="number"
            step="0.000001"
            defaultValue={latitude ?? ""}
          />
        </div>
        <div>
          <label className="label text-xs">Longitude</label>
          <input
            ref={lngRef}
            className="input w-28 text-xs"
            name="longitude"
            type="number"
            step="0.000001"
            defaultValue={longitude ?? ""}
          />
        </div>
        <div>
          <label className="label text-xs">Radius (m)</label>
          <input
            className="input w-20 text-xs"
            name="geofenceRadiusM"
            type="number"
            min="1"
            defaultValue={geofenceRadiusM ?? ""}
            onChange={(e) => setRadius(e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <button type="button" onClick={useCurrentLocation} className="btn-secondary text-xs" disabled={locating}>
          {locating ? "Locating…" : "Use my location"}
        </button>
        <button type="submit" className="btn-primary text-xs">
          Save
        </button>
        {locateError && <p className="w-full text-xs text-red-600">{locateError}</p>}
      </div>
      {!googleMapsApiKey && (
        <p className="text-xs text-stone-400">
          Add <code className="rounded bg-stone-100 px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to also pick this
          location visually on a map — see DEPLOY.md.
        </p>
      )}
    </form>
  );
}
