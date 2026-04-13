# Map system behavior

This document describes how the Rachna map UI resolves places, searches, gestures, and location—so new contributors can work safely without spelunking every file.

## 1. Overview

**Stack (map slice):**

- **React + Vite** renders the UI.
- **Leaflet + react-leaflet** show the basemap and markers.
- **Nominatim** (OpenStreetMap) provides forward/reverse geocoding for search and tap labels.
- **Overpass API** enriches taps with nearby named POIs when possible.
- **Browser Geolocation** (`watchPosition`) drives the blue dot and distance/ETA.

**Typical flows:**

1. **Tap map** → selection pin + bottom sheet (directions, navigation, add shop) + async label/POI resolution.
2. **Long-press map** → Add Shop modal with Overpass/Nominatim-assisted name and coordinates.
3. **Search** → local shops + live Nominatim suggestions; **Enter / search button** runs a committed search with query fallbacks.
4. **Locate** → fly to live coords if fresh; otherwise trigger `map.locate()` to refresh.

All timing and radii live in **`frontend/src/config/mapConfig.js`** (`MAP_CONFIG`).

---

## 2. Tap behavior

### Parallel resolution

On tap, `resolveMapTapLabel` runs:

1. **`nearbyNamedPoi`** — Overpass query built from `MAP_CONFIG.OVERPASS_TAGS` within `MAP_CONFIG.POI_RADIUS_METERS` (clamped by min/max).
2. **`nominatimReverse`** — reverse geocode at the tap point.

These run **in parallel** (`Promise.all`) for lower perceived latency.

### POI preference

- Overpass returns elements with a **`name`** tag.
- The closest candidate by **haversine** (meters) from the tap wins **only if**  
  `distance ≤ POI_RADIUS_METERS + POI_PREFER_DISTANCE_METERS`.
- If a POI wins, the UI uses **POI name** and **POI coordinates** (snapped to the feature).

### Coordinate snapping

- If **no** nearby named POI qualifies, the label comes from **Nominatim reverse** (`formatReverseResult`).
- When Nominatim returns its own `lat`/`lon`, the selection may **snap** to that point (same as before reverse-only behavior).

**Raster tile note:** The basemap is **raster** (e.g. Google-style tiles). Icons drawn on the tile are not separate DOM targets; the app always works from **tap lat/lng**, then OSM data.

---

## 3. Search behavior

### Suggestions (typing)

- **Shops:** substring match on name (≥ 2 characters).
- **Places:** debounced **Nominatim search** once the query reaches **3+** characters (see `MapSearchBar.jsx`).

### Committed search (Enter / search button)

`commitSearch` uses **`nominatimSearchWithFallback`**:

1. **Parse `lat, lng`** if the string matches coordinate syntax.
2. Else **local shop** matches: if any, pick **nearest** to the user when possible.
3. Else **Nominatim** with **`searchQueryVariants`**:
   - Original trimmed string
   - Simplified whitespace/punctuation
   - Progressive **shorter queries** (drop last word while ≥ 2 words)
   - Segment **before first comma** (common “place, country” pattern)

Each variant calls `nominatimSearch`; **`pickBestNominatimHit`** chooses the first row with finite `lat`/`lon`.

If every variant fails or returns unusable rows, the user sees a **toast** and inline error—there is no silent failure.

---

## 4. Long press

Configured in **`MAP_CONFIG`** and read in **`MapInteractionLayer.jsx`**:

| Setting | Role |
|--------|------|
| `LONG_PRESS_DURATION_MS` | Time pointer must be held before `onLongPressMap` |
| `LONG_PRESS_MOVE_PX` | Cancel long-press if movement exceeds this (reduces accidental cancel on jitter) |
| `LONG_PRESS_SUPPRESS_CLICK_MS` | After long-press, ignore the following map click so the tap sheet does not open |

Map **chrome** (zoom, locate, search, scan FAB, popups) and **markers** do not start long-press or consume tap incorrectly (see layer source).

---

## 5. Location handling

### `useUserLocation`

- Uses **`navigator.geolocation.watchPosition`** with options derived from `MAP_CONFIG` (`USER_LOCATION_*`).
- **Throttles** React updates: min movement **`USER_LOCATION_MIN_MOVE_M`** or min interval **`USER_LOCATION_MIN_INTERVAL_MS`** between emissions (reduces re-renders while moving).
- Exposes **`lastFixAt`** (ms) whenever coordinates are written.

### Locate button and `lastFixAt`

In **`Map.jsx`** / **`LocationControls`**:

- If coords exist **and** `Date.now() - lastFixAt < LOCATION_STALE_MS` → **`flyTo` user coords only** (no `map.locate()`).
- If coords missing **or** stale → **`map.locate()`** to refresh, then `locationfound` flies to the new fix.

Tune **`LOCATION_STALE_MS`** in `mapConfig.js` if you want more or fewer automatic refreshes.

---

## 6. Action sheet

When a **point** or **shop** is selected:

- **Title:** shop name or resolved place label.
- **Distance / ETA** (when location permission allows): straight-line **haversine** distance and a **rough drive ETA** (not traffic-aware routing).
- **Actions:**
  - Add shop here  
  - Get directions (opens Google Maps directions URL)  
  - Start navigation (same with driving mode flag)

Closing the sheet clears selection state.

---

## 7. Distance & ETA

- **Distance:** **Haversine** between user position and selected shop/point (`geoDistance.js`).
- **ETA:** **`formatApproxDriveEta`** — fixed average urban speed heuristic (see `geoDistance.js`). It is **not** a routed time; it exists for quick UI context only.

---

## 8. Known limitations

1. **Raster basemap** — No true “click the temple icon” hit-testing; taps are geographic + OSM lookup.
2. **Overpass** — Public endpoint (e.g. `overpass-api.de`); rate limits, outages, or slow responses affect POI labels. Failures fall back to Nominatim reverse or coordinates.
3. **Nominatim** — [Usage policy](https://operations.osmfoundation.org/policies/nominatim/) applies; production apps should use their own instance or a paid geocoder for heavy load.
4. **ETA** — Approximate only unless you integrate a **routing API** (Directions, OSRM, etc.).
5. **Search** — Quality depends on Nominatim coverage; fallback variants improve hit rate but cannot invent results.

---

## Related files

| Area | Files |
|------|--------|
| Config | `frontend/src/config/mapConfig.js` |
| Geocoding / search helpers | `frontend/src/utils/geocoding.js` |
| Distance / ETA | `frontend/src/utils/geoDistance.js` |
| Map shell | `frontend/src/components/Map.jsx` |
| Gestures | `frontend/src/components/MapInteractionLayer.jsx` |
| Search UI | `frontend/src/components/MapSearchBar.jsx` |
| Sheet | `frontend/src/components/MapActionSheet.jsx` |
| GPS hook | `frontend/src/hooks/useUserLocation.js` |
