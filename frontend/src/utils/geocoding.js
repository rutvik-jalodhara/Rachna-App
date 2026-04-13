/**
 * Nominatim + local helpers for map search.
 * Per https://operations.osmfoundation.org/policies/nominatim/ — identify app in requests.
 */
const NOMINATIM = "https://nominatim.openstreetmap.org";
const APP_CONTACT = "rachna-map-app@example.com";

function nominatimParams(extra = {}) {
  const p = new URLSearchParams({ format: "json", ...extra, email: APP_CONTACT });
  return p.toString();
}

/** Parse "lat, lng" or "lat,lng" decimal degrees */
export function parseLatLngQuery(raw) {
  const q = String(raw).trim();
  const m = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(q);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export async function nominatimSearch(query, { signal, limit = 8 } = {}) {
  const qs = nominatimParams({
    q: query.trim(),
    limit: String(limit),
    addressdetails: "1",
  });
  const res = await fetch(`${NOMINATIM}/search?${qs}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export async function nominatimReverse(lat, lng, { signal } = {}) {
  const qs = nominatimParams({
    lat: String(lat),
    lon: String(lng),
    zoom: "18",
    addressdetails: "1",
  });
  const res = await fetch(`${NOMINATIM}/reverse?${qs}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Reverse geocode failed");
  return res.json();
}

/** Human label from Nominatim search hit */
export function formatSearchHit(hit) {
  if (!hit) return "";
  if (hit.display_name) {
    const parts = hit.display_name.split(",");
    return parts.slice(0, 3).join(",").trim();
  }
  return hit.name || "";
}

/** Human label from reverse-geocode JSON */
export function formatReverseResult(data) {
  if (!data) return "";
  if (data.name) return data.name;
  if (data.address) {
    const a = data.address;
    return (
      a.amenity ||
      a.shop ||
      a.building ||
      a.road ||
      a.suburb ||
      a.city ||
      a.town ||
      a.village ||
      ""
    );
  }
  if (data.display_name) {
    const parts = data.display_name.split(",");
    return parts.slice(0, 2).join(",").trim();
  }
  return "";
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Reverse-geocode only (fast path for map tap / selection label).
 */
export async function quickReverseLabel(lat, lng, { signal } = {}) {
  try {
    const data = await nominatimReverse(lat, lng, { signal });
    return formatReverseResult(data) || "";
  } catch {
    return "";
  }
}

/**
 * Best-effort place name + snapped coordinates (Overpass + Nominatim), for Add Shop prefill.
 */
export async function resolvePlaceAtLocation(lat, lng, { signal } = {}) {
  let name = "";
  let finalLoc = { lat, lng };

  try {
    const radius = 50;
    const query = `[out:json][timeout:10];(nwr["shop"](around:${radius},${lat},${lng});nwr["amenity"](around:${radius},${lat},${lng});nwr["building"](around:${radius},${lat},${lng}););out center;`;
    const overpassRes = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
      { signal }
    );
    const overpassData = await overpassRes.json();

    if (overpassData?.elements?.length > 0) {
      const namedElements = overpassData.elements.filter((el) => el.tags?.name);
      if (namedElements.length > 0) {
        let closestEl = null;
        let minDist = Infinity;
        namedElements.forEach((el) => {
          const elLat = el.lat || el.center?.lat;
          const elLng = el.lon || el.center?.lon;
          if (elLat && elLng) {
            const dist = Math.hypot(elLat - lat, elLng - lng);
            if (dist < minDist) {
              minDist = dist;
              closestEl = el;
            }
          }
        });
        if (closestEl) {
          name = closestEl.tags.name;
          finalLoc = {
            lat: closestEl.lat || closestEl.center.lat,
            lng: closestEl.lon || closestEl.center.lon,
          };
        }
      }
    }
  } catch {
    /* continue to Nominatim */
  }

  if (!name) {
    const nomData = await nominatimReverse(finalLoc.lat, finalLoc.lng, { signal });
    name = formatReverseResult(nomData);
    if (nomData?.lat != null && nomData?.lon != null) {
      finalLoc = { lat: parseFloat(nomData.lat), lng: parseFloat(nomData.lon) };
    }
  }

  return { location: finalLoc, name: name || "" };
}
