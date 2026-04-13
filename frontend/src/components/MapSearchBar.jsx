import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { parseLatLngQuery, nominatimSearch, formatSearchHit } from "../utils/geocoding";
import { haversineMeters, formatDistance } from "../utils/geoDistance";

function distanceFromUser(userCoords, lat, lng) {
  if (!userCoords || lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return haversineMeters(userCoords.lat, userCoords.lng, lat, lng);
}

/**
 * Map search: coordinates, Nominatim places, and local shop names — distance-aware, Google-style list.
 */
export default function MapSearchBar({
  shops = [],
  userCoords = null,
  locationStatus = "idle",
  onPickPlace,
  onPickShop,
  onPickCoords,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [osmResults, setOsmResults] = useState([]);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const rootRef = useRef(null);

  const shopMatches = useCallback(
    (q) => {
      const s = q.trim().toLowerCase();
      if (s.length < 2) return [];
      return shops.filter((sh) => sh?.shop_name && sh.shop_name.toLowerCase().includes(s));
    },
    [shops]
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setOsmResults([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setLoading(true);
      setError(null);
      try {
        const data = await nominatimSearch(trimmed, { signal: abortRef.current.signal, limit: 10 });
        setOsmResults(Array.isArray(data) ? data : []);
      } catch (e) {
        if (e.name === "AbortError") return;
        setOsmResults([]);
        setError("Search unavailable. Try again.");
      } finally {
        setLoading(false);
      }
    }, 380);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [query]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);

  const coords = parseLatLngQuery(query);
  const shopsHit = shopMatches(query);

  const suggestionRows = useMemo(() => {
    const rows = [];

    if (coords) {
      rows.push({
        kind: "coords",
        key: "coords",
        label: "Go to coordinates",
        sub: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
        distanceM: distanceFromUser(userCoords, coords.lat, coords.lng),
        onPick: () => onPickCoords?.({ ...coords, label: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` }),
      });
    }

    const shopsWithD = shopsHit.map((shop) => ({
      kind: "shop",
      key: String(shop._id || shop.shop_name),
      label: shop.shop_name,
      sub: "Your shop",
      distanceM: distanceFromUser(userCoords, shop.latitude, shop.longitude),
      onPick: () => onPickShop?.(shop),
    }));
    shopsWithD.sort((a, b) => (a.distanceM ?? 1e15) - (b.distanceM ?? 1e15));
    rows.push(...shopsWithD);

    const placesWithD = osmResults.map((hit) => {
      const lat = parseFloat(hit.lat);
      const lng = parseFloat(hit.lon);
      return {
        kind: "place",
        key: `place-${hit.place_id}`,
        label: formatSearchHit(hit),
        sub: "Place",
        distanceM: distanceFromUser(userCoords, lat, lng),
        importance: Number(hit.importance) || 0,
        hit,
      };
    });
    placesWithD.sort((a, b) => {
      const da = a.distanceM ?? 1e15;
      const db = b.distanceM ?? 1e15;
      if (Math.abs(da - db) > 250) return da - db;
      return b.importance - a.importance;
    });
    rows.push(
      ...placesWithD.map(({ hit, ...rest }) => ({
        ...rest,
        onPick: () => {
          const lat = parseFloat(hit.lat);
          const lng = parseFloat(hit.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          onPickPlace?.({
            lat,
            lng,
            label: formatSearchHit(hit),
            raw: hit,
          });
        },
      }))
    );

    return rows;
  }, [coords, shopsHit, osmResults, userCoords, onPickCoords, onPickShop, onPickPlace]);

  const showSuggestions = open && query.trim().length > 0;

  const locationHint =
    locationStatus === "denied" ||
    locationStatus === "unsupported" ||
    locationStatus === "unavailable" ||
    locationStatus === "error"
      ? "Distances need location access — enable in browser settings"
      : null;

  return (
    <div className="map-search-bar-wrap" ref={rootRef}>
      <div className="google-search-bar map-search-bar">
        <svg className="map-search-bar__icon" viewBox="0 0 24 24" aria-hidden>
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
        <input
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Search shops, places, or lat, lng"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {query && (
          <button
            type="button"
            className="map-search-bar__clear"
            onClick={() => {
              setQuery("");
              setOsmResults([]);
              setError(null);
            }}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {showSuggestions && (
        <ul className="map-search-suggestions" role="listbox">
          {locationHint && (
            <li className="map-search-suggestions__hint" role="note">
              {locationHint}
            </li>
          )}
          {suggestionRows.map((row) => (
            <li key={row.key}>
              <button
                type="button"
                className="map-search-suggestions__item map-search-suggestions__item--row"
                onClick={() => {
                  row.onPick();
                  setQuery(row.kind === "coords" ? row.sub : row.label);
                  setOpen(false);
                  setOsmResults([]);
                }}
              >
                <span className="map-search-suggestions__main">
                  <span className="map-search-suggestions__label">{row.label}</span>
                  <span className="map-search-suggestions__meta">{row.sub}</span>
                </span>
                {formatDistance(row.distanceM) && (
                  <span className="map-search-suggestions__distance">{formatDistance(row.distanceM)}</span>
                )}
              </button>
            </li>
          ))}
          {loading && <li className="map-search-suggestions__status">Searching places…</li>}
          {error && <li className="map-search-suggestions__status map-search-suggestions__status--error">{error}</li>}
          {!loading &&
            !error &&
            query.trim().length >= 3 &&
            osmResults.length === 0 &&
            shopsHit.length === 0 &&
            !coords && <li className="map-search-suggestions__status">No results</li>}
        </ul>
      )}
    </div>
  );
}
