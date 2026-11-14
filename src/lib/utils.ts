const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "LKR";

export function formatMoney(amount: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(date));
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatDateTime(date: Date | string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(date),
  );
}

/** Great-circle distance between two coordinates, in meters. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function mapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Round to the nearest cent to avoid floating-point comparison drift (e.g. 0.1 + 0.2). */
export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Compact axis-friendly number: 1500 -> "1.5K", 2000000 -> "2M". */
export function formatCompact(n: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
