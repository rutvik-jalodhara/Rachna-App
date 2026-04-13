/** Earth radius in meters (WGS84 mean) */
const R_EARTH_M = 6371000;

/**
 * Haversine distance between two WGS84 points in meters.
 */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R_EARTH_M * c;
}

/**
 * @param {number|null|undefined} meters
 * @returns {string|null}
 */
export function formatDistance(meters) {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function distanceBetweenPoints(a, b) {
  if (!a || !b) return null;
  const la = a.lat ?? a.latitude;
  const ln = a.lng ?? a.longitude;
  const lb = b.lat ?? b.latitude;
  const lo = b.lng ?? b.longitude;
  if (![la, ln, lb, lo].every((x) => typeof x === "number" && Number.isFinite(x))) return null;
  return haversineMeters(la, ln, lb, lo);
}

export function googleMapsDirectionsUrl(lat, lng, { driving = false } = {}) {
  const dest = `${lat},${lng}`;
  let url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
  if (driving) url += "&travelmode=driving";
  return url;
}
