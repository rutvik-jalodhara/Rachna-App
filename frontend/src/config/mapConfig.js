/**
 * Central tuning for map interactions, POI lookup, long-press, and GPS throttling.
 * @see docs/map-behavior.md (repository root)
 */
export const MAP_CONFIG = {
  /** Overpass `around:` radius (m) for named POI lookup on map tap. */
  POI_RADIUS_METERS: 50,
  /** Wider Overpass search on tap (meters) — helps catch map POI icons even if tapped slightly off-center. */
  POI_TAP_SEARCH_RADIUS_METERS: 130,
  /** Max haversine distance from tap to still snap selection to a POI candidate (meters). */
  POI_SNAP_MAX_METERS_FROM_TAP: 180,
  /** Extra meters beyond POI_RADIUS_METERS — max haversine from tap to accept a matched POI. */
  POI_PREFER_DISTANCE_METERS: 30,
  /** If GPS fix is older than this, the locate button calls map.locate() instead of flying to cached coords. */
  LOCATION_STALE_MS: 120_000,
  /** Cancel long-press only if pointer moves farther than this (screen pixels). */
  LONG_PRESS_MOVE_PX: 28,
  /** Milliseconds before long-press “Add shop” gesture fires. */
  LONG_PRESS_DURATION_MS: 620,
  /** After long-press, suppress the following map click (avoids opening the tap sheet). */
  LONG_PRESS_SUPPRESS_CLICK_MS: 450,
  /** OSM keys queried via Overpass for tap POI resolution (presence of key). */
  OVERPASS_TAGS: ["shop", "amenity", "tourism", "historic", "building"],
  /** Narrower tag set for long-press place enrichment (Add Shop prefill). */
  RESOLVE_PLACE_OVERPASS_TAGS: ["shop", "amenity", "building"],
  /** Overpass radius (m) for long-press resolvePlaceAtLocation. */
  RESOLVE_PLACE_RADIUS_METERS: 50,
  /** Clamp Overpass `around:` radius to a safe range. */
  OVERPASS_RADIUS_MIN_M: 20,
  OVERPASS_RADIUS_MAX_M: 100,
  OVERPASS_TIMEOUT_SEC: 12,
  RESOLVE_PLACE_OVERPASS_TIMEOUT_SEC: 10,
  /** Min movement (m) before emitting a new position from watchPosition. */
  USER_LOCATION_MIN_MOVE_M: 10,
  /** Additional anti-jitter floor (m) when browser-reported GPS accuracy is poor. */
  USER_LOCATION_ACCURACY_JITTER_FACTOR: 0.55,
  /** Cap for accuracy-derived jitter threshold (m). */
  USER_LOCATION_ACCURACY_JITTER_CAP_M: 28,
  /** Min time (ms) between emissions when movement is small. */
  USER_LOCATION_MIN_INTERVAL_MS: 3_500,
  USER_LOCATION_MAXIMUM_AGE_MS: 8_000,
  USER_LOCATION_TIMEOUT_MS: 20_000,
  USER_LOCATION_ENABLE_HIGH_ACCURACY: false,
};

/**
 * Clamp Overpass `around:` radius to configured min/max.
 * @param {number} meters
 * @returns {number}
 */
export function clampOverpassRadiusM(meters) {
  return Math.max(
    MAP_CONFIG.OVERPASS_RADIUS_MIN_M,
    Math.min(MAP_CONFIG.OVERPASS_RADIUS_MAX_M, Math.round(meters))
  );
}

/**
 * Build an Overpass QL query: named elements with given tag keys near a point.
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusM
 * @param {string[]} tagKeys e.g. ["shop","amenity"]
 * @param {number} [timeoutSec]
 */
export function buildOverpassAroundQuery(lat, lng, radiusM, tagKeys, timeoutSec = MAP_CONFIG.OVERPASS_TIMEOUT_SEC) {
  const r = clampOverpassRadiusM(radiusM);
  const inner = tagKeys.map((key) => `nwr["${key}"](around:${r},${lat},${lng})`).join(";");
  return `[out:json][timeout:${timeoutSec}];(${inner};);out center;`;
}
