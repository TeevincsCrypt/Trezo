export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6_371_000; // Earth radius (m)
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing in degrees from a to b. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

export function isValidLatLng(p: Partial<LatLng> | null | undefined): p is LatLng {
  return (
    !!p &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

/** Integer grid cell key for a coordinate at a given cell size (degrees). */
export function cellKey(p: LatLng, sizeDeg: number): string {
  return `${Math.floor(p.lat / sizeDeg)}:${Math.floor(p.lng / sizeDeg)}`;
}

/** Offset a point by metres north/east. */
export function offsetM(p: LatLng, northM: number, eastM: number): LatLng {
  return {
    lat: p.lat + (northM / R) * (180 / Math.PI),
    lng: p.lng + ((eastM / R) * (180 / Math.PI)) / Math.cos(toRad(p.lat)),
  };
}
