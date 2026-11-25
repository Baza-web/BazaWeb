"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clockIn, clockOut } from "@/app/(app)/attendance/actions";
import { SignIn, SignOut } from "./icons";

function describeGeoError(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location access is blocked for this site — allow it for this site in your browser or phone Settings, then try again.";
    case err.TIMEOUT:
      return "Getting your location took too long — try again, ideally near a window or outdoors.";
    case err.POSITION_UNAVAILABLE:
    default:
      return "Your device couldn't determine your location — check that location services are turned on.";
  }
}

function getPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
}

/**
 * A fresh high-accuracy GPS fix can take well over 8s indoors (a jewelry shop's
 * walls/floor above are exactly this case) — a short timeout there reads as a
 * generic "no location" failure for everyone, not a real permission problem.
 * So: try a quick high-accuracy fix first, and if it only times out, fall back
 * to a slower, lower-accuracy one (good enough for a geofence check) instead of
 * giving up. Only a real denial/unavailable error is reported as such.
 */
async function getCoords(): Promise<{ coords: { lat: number; lng: number } | null; reason: string | null }> {
  if (!("geolocation" in navigator)) {
    return { coords: null, reason: "This browser doesn't support location, which this branch requires to clock in/out." };
  }
  try {
    const pos = await getPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
    return { coords: { lat: pos.coords.latitude, lng: pos.coords.longitude }, reason: null };
  } catch (err) {
    const geoErr = err as GeolocationPositionError;
    if (geoErr.code !== geoErr.TIMEOUT) {
      return { coords: null, reason: describeGeoError(geoErr) };
    }
    try {
      const pos = await getPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 });
      return { coords: { lat: pos.coords.latitude, lng: pos.coords.longitude }, reason: null };
    } catch (err2) {
      return { coords: null, reason: describeGeoError(err2 as GeolocationPositionError) };
    }
  }
}

export function ClockButton({ isClockedIn }: { isClockedIn: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      setLocating(true);
      const { coords, reason } = await getCoords();
      setLocating(false);
      const result = isClockedIn ? await clockOut(coords) : await clockIn(coords);
      if (result.error) {
        setError(coords === null && reason ? reason : result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        title={isClockedIn ? "Clock out" : "Clock in"}
        className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
          isClockedIn
            ? "text-green-700 hover:bg-green-50"
            : "text-stone-500 hover:bg-stone-100 hover:text-ink-900"
        }`}
      >
        {isClockedIn ? <SignOut size={19} aria-hidden="true" /> : <SignIn size={19} aria-hidden="true" />}
        <span className="hidden sm:inline">
          {pending ? (locating ? "Locating…" : "Working…") : isClockedIn ? "Clock out" : "Clock in"}
        </span>
      </button>
      {error && (
        <p className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700 shadow-card">
          {error}
        </p>
      )}
    </div>
  );
}
