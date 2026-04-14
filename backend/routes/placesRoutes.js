const express = require("express");
const { createRateLimiter } = require("../middleware/rateLimit");
const { TTLCache } = require("../services/ttlCache");

const router = express.Router();

const nearbyLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 90, // cost-control: 90 requests/min/IP
});

const nearbyCache = new TTLCache({
  ttlMs: 45_000, // 30–60s requested
  maxEntries: 2000,
});

function clampInt(v, min, max, fallback) {
  const n = Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampFloat(v, min, max) {
  const n = Number.parseFloat(String(v));
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function roundCoord(value, decimals = 4) {
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
}

/**
 * Secure proxy to Google Places Nearby Search.
 * GET /api/places/nearby?lat=..&lng=..&radius=..
 * - Does NOT expose API key to frontend.
 */
router.get("/nearby", nearbyLimiter, async (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(501).json({ error: "GOOGLE_MAPS_API_KEY is not configured" });
  }

  const lat = clampFloat(req.query.lat, -90, 90);
  const lng = clampFloat(req.query.lng, -180, 180);
  if (lat == null || lng == null) {
    return res.status(400).json({ error: "Invalid lat/lng" });
  }

  // Google Nearby Search max radius is 50000m. We keep it tight for tap snapping.
  const radius = clampInt(req.query.radius, 25, 2000, 250);
  const cachedKey = `${roundCoord(lat)}:${roundCoord(lng)}:${radius}`;
  const cached = nearbyCache.get(cachedKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }
  res.setHeader("X-Cache", "MISS");

  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("key", apiKey);

  try {
    const controller = new AbortController();
    const timeoutMs = 3500;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const resp = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    const data = await resp.json().catch(() => null);

    const status = data?.status;

    // Graceful failures: return best=null so frontend can fallback to reverse-geocode.
    if (!resp.ok) {
      const payload = {
        tap: { lat, lng, radius },
        best: null,
        candidates: [],
        provider: "google_places_nearbysearch",
        places_status: status || "HTTP_ERROR",
        error: "Places request failed",
      };
      nearbyCache.set(cachedKey, payload, { ttlMs: 15_000 });
      return res.json(payload);
    }

    if (status && status !== "OK" && status !== "ZERO_RESULTS") {
      const payload = {
        tap: { lat, lng, radius },
        best: null,
        candidates: [],
        provider: "google_places_nearbysearch",
        places_status: status,
        error: data?.error_message ? String(data.error_message) : "Places API error",
      };
      nearbyCache.set(cachedKey, payload, { ttlMs: 15_000 });
      return res.json(payload);
    }

    const results = Array.isArray(data?.results) ? data.results : [];
    const candidates = results
      .map((r) => {
        const name = r?.name ? String(r.name).trim() : "";
        const rLat = r?.geometry?.location?.lat;
        const rLng = r?.geometry?.location?.lng;
        if (!name) return null;
        if (!Number.isFinite(rLat) || !Number.isFinite(rLng)) return null;
        const d = haversineMeters(lat, lng, rLat, rLng);
        return {
          place_id: r?.place_id || null,
          name,
          lat: rLat,
          lng: rLng,
          types: Array.isArray(r?.types) ? r.types : [],
          vicinity: r?.vicinity || "",
          distance_m: Math.round(d),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distance_m - b.distance_m);

    const best = candidates[0] || null;

    const payload = {
      tap: { lat, lng, radius },
      best,
      candidates: candidates.slice(0, 12),
      provider: "google_places_nearbysearch",
      places_status: status || null,
    };

    nearbyCache.set(cachedKey, payload);
    return res.json(payload);
  } catch (err) {
    const isAbort = err?.name === "AbortError";
    if (!isAbort) console.error("[PLACES]", err.message);
    const payload = {
      tap: { lat, lng, radius },
      best: null,
      candidates: [],
      provider: "google_places_nearbysearch",
      places_status: isAbort ? "TIMEOUT" : "ERROR",
      error: isAbort ? "Places request timed out" : "Places proxy error",
    };
    nearbyCache.set(cachedKey, payload, { ttlMs: 15_000 });
    return res.json(payload);
  }
});

module.exports = router;