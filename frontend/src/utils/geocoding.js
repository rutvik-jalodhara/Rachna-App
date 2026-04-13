/**
 * Nominatim + local helpers for map search.
 * Per https://operations.osmfoundation.org/policies/nominatim/ — identify app in requests.
 */
import { MAP_CONFIG, buildOverpassAroundQuery } from "../config/mapConfig";
import { haversineMeters } from "./geoDistance";

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
 * Named POI from Overpass within ~radiusM (see MAP_CONFIG.OVERPASS_TAGS).
 */
export async function nearbyNamedPoi(lat, lng, { signal, radiusM = MAP_CONFIG.POI_RADIUS_METERS } = {}) {
  const query = buildOverpassAroundQuery(lat, lng, radiusM, MAP_CONFIG.OVERPASS_TAGS, MAP_CONFIG.OVERPASS_TIMEOUT_SEC);
  const maxAcceptM = radiusM + MAP_CONFIG.POI_PREFER_DISTANCE_METERS;
  try {
    const overpassRes = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
      { signal }
    );
    if (!overpassRes.ok) return null;
    const overpassData = await overpassRes.json();
    const elements = overpassData?.elements ?? [];
    const named = elements.filter((el) => el.tags?.name);
    if (named.length === 0) return null;
    let best = null;
    let bestD = Infinity;
    for (const el of named) {
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      if (elLat == null || elLng == null) continue;
      const d = haversineMeters(lat, lng, elLat, elLng);
      if (d < bestD && d <= maxAcceptM) {
        bestD = d;
        best = { name: el.tags.name, lat: elLat, lng: elLng };
      }
    }
    return best;
  } catch {
    return null;
  }
}

/**
 * Reverse geocode + nearby Overpass POI in parallel; prefer POI name when one is close to the tap.
 */
export async function resolveMapTapLabel(lat, lng, { signal } = {}) {
  const [poi, rev] = await Promise.all([
    nearbyNamedPoi(lat, lng, { signal, radiusM: MAP_CONFIG.POI_RADIUS_METERS }).catch(() => null),
    nominatimReverse(lat, lng, { signal }).catch(() => null),
  ]);
  if (poi?.name) {
    return { label: poi.name, lat: poi.lat, lng: poi.lng };
  }
  const addr = rev ? formatReverseResult(rev) : "";
  let finalLat = lat;
  let finalLng = lng;
  if (rev?.lat != null && rev?.lon != null) {
    finalLat = parseFloat(rev.lat);
    finalLng = parseFloat(rev.lon);
  }
  return {
    label: addr || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    lat: finalLat,
    lng: finalLng,
  };
}

/** Prefer first Nominatim row with valid coordinates. */
export function pickBestNominatimHit(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  for (const h of list) {
    const lat = parseFloat(h.lat);
    const lng = parseFloat(h.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return h;
  }
  return list[0];
}

export function simplifySearchQuery(q) {
  return String(q || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,;\s.:]+|[,;\s.:]+$/g, "")
    .trim();
}

/** Progressive shorter queries for retry (e.g. drop last word, strip after comma). */
export function searchQueryVariants(primary) {
  const variants = [];
  const seen = new Set();
  const add = (s) => {
    const v = simplifySearchQuery(s);
    if (v.length >= 2 && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      variants.push(v);
    }
  };
  add(primary);
  const t = simplifySearchQuery(primary);
  const parts = t.split(/\s+/).filter(Boolean);
  for (let n = parts.length - 1; n >= 2; n--) {
    add(parts.slice(0, n).join(" "));
  }
  const comma = t.indexOf(",");
  if (comma > 0) add(t.slice(0, comma));
  return variants;
}

/**
 * Try Nominatim with original query, then simplified variants; returns best hit when possible.
 */
export async function nominatimSearchWithFallback(rawQuery, { signal, limit = 8 } = {}) {
  const variants = searchQueryVariants(rawQuery);
  let lastHits = [];
  for (const q of variants) {
    try {
      const data = await nominatimSearch(q, { signal, limit });
      lastHits = Array.isArray(data) ? data : [];
      const hit = pickBestNominatimHit(lastHits);
      if (hit) return { hit, queryUsed: q, allHits: lastHits };
    } catch {
      /* try next */
    }
  }
  const fallback = pickBestNominatimHit(lastHits);
  if (fallback) return { hit: fallback, queryUsed: variants[variants.length - 1] ?? rawQuery, allHits: lastHits };
  return { hit: null, queryUsed: null, allHits: lastHits };
}

/**
 * Best-effort place name + snapped coordinates (Overpass + Nominatim), for Add Shop prefill.
 */
export async function resolvePlaceAtLocation(lat, lng, { signal } = {}) {
  let name = "";
  let finalLoc = { lat, lng };

  try {
    const radius = MAP_CONFIG.RESOLVE_PLACE_RADIUS_METERS;
    const query = buildOverpassAroundQuery(
      lat,
      lng,
      radius,
      MAP_CONFIG.RESOLVE_PLACE_OVERPASS_TAGS,
      MAP_CONFIG.RESOLVE_PLACE_OVERPASS_TIMEOUT_SEC
    );
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
