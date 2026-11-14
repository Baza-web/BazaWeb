let loadPromise: Promise<void> | null = null;

/** Loads the Google Maps JS API script once, no matter how many map pickers are on the page. */
export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load Google Maps."));
    document.head.appendChild(script);
  });
  return loadPromise;
}

// Minimal ambient shape — just enough to avoid `any` at call sites, without
// pulling in the full @types/google.maps package for one small map picker.
declare global {
  interface Window {
    google?: {
      maps: {
        Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMap;
        Marker: new (opts: Record<string, unknown>) => GoogleMarker;
        Circle: new (opts: Record<string, unknown>) => GoogleCircle;
        event: { addListener: (target: unknown, event: string, handler: (e: { latLng: GoogleLatLng }) => void) => void };
      };
    };
  }
  interface GoogleLatLng {
    lat(): number;
    lng(): number;
  }
  interface GoogleMap {
    setCenter(pos: { lat: number; lng: number }): void;
  }
  interface GoogleMarker {
    setPosition(pos: { lat: number; lng: number }): void;
    getPosition(): GoogleLatLng | null;
  }
  interface GoogleCircle {
    setCenter(pos: { lat: number; lng: number }): void;
    setRadius(radius: number): void;
  }
}
