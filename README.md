# Rachna App

**Rachna** is a full-stack web application that combines an interactive **Leaflet** map, **AI-assisted shop scanning** (image similarity via TensorFlow.js embeddings on the server), and **OpenStreetMap**-backed search and place resolution. It is designed to feel close to a simplified **Google Maps** experience while using open geodata where possible.

---

## Features

- **Smart search** — Local shops plus **Nominatim** suggestions; **Enter** / search button runs a **multi-step query fallback** so messy input still resolves when possible.
- **AI-based shop scanning** — Capture or upload a storefront image; the backend matches it against stored shop embeddings.
- **Distance and ETA** — Straight-line **haversine** distance from the user plus a **rough drive-time hint** (heuristic, not live routing).
- **POI-aware map taps** — **Overpass** + **Nominatim reverse** in parallel; named nearby POIs win over generic addresses when within configured radii.
- **Long-press add shop** — Hold on the map to open **Add Shop** with place enrichment (Overpass + Nominatim).
- **Google Maps–style UX** — Bottom action sheet (directions, start navigation, add shop), locate control, blue-dot live position, selection pin feedback.

---

## How it works

### Map interaction

1. **Tap** (empty map) → selection pin, sheet opens immediately with a loading title (`…`), then label/position refine via `resolveMapTapLabel` (Overpass POI preference + reverse geocode).
2. **Long-press** → clears sheet selection, runs `resolvePlaceAtLocation`, opens **Add Shop** with suggested name/coordinates.
3. **Shop markers** → select shop, same sheet pattern with shop-aware actions.
4. **Blue dot** → tap opens **Add Shop** at current GPS with reverse-geocoded name when available.

### Search

- Typing shows **shops** (substring) and **Nominatim** results (after a short debounce).
- **Commit** (Enter or search icon) runs coordinate parsing, then shop match, then **`nominatimSearchWithFallback`** (query variants).

### Scan

- The **Scan** FAB opens a full-screen flow: image → server **`/api/shops/scan`** (or equivalent) → best match and candidates with scores.

### Location

- **`useUserLocation`** watches GPS with throttled updates to keep the UI smooth.
- **Locate button** flies to cached position if the fix is **fresh** (`LOCATION_STALE_MS` in config); otherwise it calls **`map.locate()`** to refresh.

---

## Tech stack

| Layer | Technologies |
|--------|----------------|
| **Frontend** | React 18, Vite 6, React Router, Leaflet, react-leaflet, Axios |
| **Backend** | Node.js, Express 5, Mongoose (MongoDB), Multer, Sharp, Cloudinary |
| **ML** | TensorFlow.js + MobileNet-based embeddings (see `backend/services/`) |
| **Geodata** | OpenStreetMap via **Nominatim** (search/reverse) and **Overpass** (nearby POIs) |

---

## Installation

### Prerequisites

- **Node.js** 18+ recommended  
- **MongoDB** (local or Atlas) for the API  
- **Cloudinary** (and other) credentials as required by `backend` (see `.env` below)

### 1. Clone and install

```bash
git clone <your-repo-url>
cd Rachna-App
```

**Backend**

```bash
cd backend
npm install
```

Create a **`.env`** in `backend/` (see `backend/config` / server expectations — typically `MONGODB_URI`, `PORT`, Cloudinary keys, etc.).

**Frontend**

```bash
cd ../frontend
npm install
```

### 2. Run in development

**Terminal 1 — API (default port 5000)**

```bash
cd backend
npm run dev
```

**Terminal 2 — Vite**

```bash
cd frontend
npm run dev
```

The frontend uses **`http://localhost:5000`** as the API base when opened from `localhost` (see `frontend/src/hooks/useApi.js`).

### 3. Production build

```bash
cd frontend
npm run build
npm run preview   # optional local preview of dist/
```

Serve `frontend/dist` with any static host; point API calls to your deployed backend (adjust `useApi.js` or use env-based base URL for production).

---

## Configuration

### Map and geolocation

All primary tunables live in **`frontend/src/config/mapConfig.js`** (`MAP_CONFIG`):

| Key | Purpose |
|-----|---------|
| `POI_RADIUS_METERS` | Overpass search radius for tap POI lookup |
| `POI_PREFER_DISTANCE_METERS` | Extra slack (m) for accepting a POI vs tap point |
| `LOCATION_STALE_MS` | When locate uses `flyTo` only vs `map.locate()` refresh |
| `LONG_PRESS_*` | Long-press timing, move tolerance, click suppression |
| `OVERPASS_TAGS` | OSM tag keys used for tap POI queries |
| `RESOLVE_PLACE_*` | Long-press / add-shop Overpass query |
| `USER_LOCATION_*` | Geolocation watch throttling and timeouts |

Helpers **`buildOverpassAroundQuery`** and **`clampOverpassRadiusM`** keep Overpass QL consistent.

**Full behavior:** [docs/map-behavior.md](docs/map-behavior.md)

---

## Usage (quick reference)

| Action | Result |
|--------|--------|
| **Tap map** | Select point → sheet (directions, navigation, add shop); label from POI/reverse |
| **Long-press map** | Add Shop modal with enriched place |
| **Search + Enter** | Geocode / shop match / fallback variants |
| **Scan** | Open scanner → match shops from photo |
| **Locate** | Center on user (fresh GPS) or refresh if stale |

---

## Limitations

- **Raster basemap** — POIs drawn on tiles are not individually clickable; behavior is **lat/lng + OSM**, not true POI picking.
- **ETA** — Approximate urban-speed heuristic unless you add a **routing API**.
- **External APIs** — Nominatim and Overpass are subject to **usage policies**, rate limits, and availability.
- **CORS / HTTPS** — Geolocation and third-party fetches may require **secure context** and correct API URLs in production.

---

## Future improvements

- Real **routing** (directions polyline, traffic-aware ETA)
- **Route drawing** on the map
- **Offline** tiles / cached searches
- Dedicated **Nominatim / Overpass** instances for production scale

---

## Project layout

```
Rachna-App/
├── backend/          # Express API, MongoDB, embeddings, scan route
├── frontend/         # Vite + React app (map, scan UI, …)
├── docs/
│   └── map-behavior.md
└── README.md
```

---

## Author

**Rachna Pvt Ltd** — map and product development.

For deeper map semantics, start with [docs/map-behavior.md](docs/map-behavior.md).
