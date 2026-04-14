import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { parseLatLngQuery, nominatimSearch, nominatimSearchWithFallback, formatSearchHit } from "../utils/geocoding";
import { haversineMeters, formatDistance } from "../utils/geoDistance";
import { getRecentSearches, pushRecentSearch } from "../utils/recentSearches";

function distanceFromUser(userCoords, lat, lng) {
  if (!userCoords || lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return haversineMeters(userCoords.lat, userCoords.lng, lat, lng);
}

/** Highlight first case-insensitive match of query in text (Google-style). */
function HighlightLabel({ text, query }) {
  const t = String(text ?? "");
  const q = query.trim();
  if (!q || !t) return <>{t}</>;
  const lower = t.toLowerCase();
  const qi = lower.indexOf(q.toLowerCase());
  if (qi === -1) return <>{t}</>;
  return (
    <>
      {t.slice(0, qi)}
      <mark className="map-search-highlight">{t.slice(qi, qi + q.length)}</mark>
      {t.slice(qi + q.length)}
    </>
  );
}

function pickNearestShop(shops, userCoords) {
  if (!shops.length) return null;
  if (shops.length === 1) return shops[0];
  const scored = shops.map((s) => ({
    shop: s,
    d: distanceFromUser(userCoords, s.latitude, s.longitude) ?? 1e15,
  }));
  scored.sort((a, b) => a.d - b.d);
  return scored[0].shop;
}

function MapSearchBar({
  shops = [],
  userCoords = null,
  locationStatus = "idle",
  onPickPlace,
  onPickShop,
  onPickCoords,
  onSearchToast,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [osmResults, setOsmResults] = useState([]);
  const [error, setError] = useState(null);
  const [recentTick, setRecentTick] = useState(0);
  const abortRef = useRef(null);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const recents = useMemo(() => getRecentSearches(), [recentTick]);

  const shopMatches = useCallback(
    (q) => {
      const s = q.trim().toLowerCase();
      if (s.length < 2) return [];
      return shops.filter((sh) => sh?.shop_name && sh.shop_name.toLowerCase().includes(s));
    },
    [shops]
  );

  const shopsHit = useMemo(() => shopMatches(query), [shopMatches, query]);

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
  const trimmedQuery = query.trim();

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

  const hasQuery = trimmedQuery.length > 0;
  const showResultsPanel = open && hasQuery;
  const showRecentsPanel = open && !hasQuery && recents.length > 0;

  const locationHint =
    locationStatus === "denied" ||
    locationStatus === "unsupported" ||
    locationStatus === "unavailable" ||
    locationStatus === "error"
      ? "Distances need location access — enable in browser settings"
      : null;

  const recordAndPick = useCallback(
    (labelForRecent, apply) => {
      if (labelForRecent) pushRecentSearch(labelForRecent);
      setRecentTick((t) => t + 1);
      apply();
    },
    []
  );

  const commitSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      onSearchToast?.("Enter a place or shop name", "warning");
      return;
    }

    const parsed = parseLatLngQuery(trimmed);
    if (parsed) {
      const label = `${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)}`;
      recordAndPick(label, () => {
        onPickCoords?.({ ...parsed, label });
        setQuery(label);
        setOpen(false);
        setOsmResults([]);
        setError(null);
      });
      return;
    }

    const shopMatches = shopsHit;
    if (shopMatches.length > 0) {
      const best = pickNearestShop(shopMatches, userCoords);
      if (best) {
        recordAndPick(best.shop_name, () => {
          onPickShop?.(best);
          setQuery(best.shop_name);
          setOpen(false);
          setOsmResults([]);
          setError(null);
        });
      }
      return;
    }

    if (trimmed.length < 2) {
      onSearchToast?.("Keep typing — at least 2 characters", "info");
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;
    setLoading(true);
    setError(null);
    try {
      const { hit } = await nominatimSearchWithFallback(trimmed, { signal, limit: 10 });
      if (hit) {
        const lat = parseFloat(hit.lat);
        const lng = parseFloat(hit.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const label = formatSearchHit(hit);
          recordAndPick(label, () => {
            onPickPlace?.({ lat, lng, label, raw: hit });
            setQuery(label);
            setOpen(false);
            setOsmResults([]);
          });
          return;
        }
      }
      setError("No results");
      onSearchToast?.("No matching place found — try fewer words or a nearby town", "warning");
    } catch (e) {
      if (e.name === "AbortError") return;
      setError("Search failed");
      onSearchToast?.("Search failed. Check your connection and try again.", "error");
    } finally {
      setLoading(false);
    }
  }, [
    query,
    shopsHit,
    userCoords,
    onPickCoords,
    onPickShop,
    onPickPlace,
    recordAndPick,
    onSearchToast,
  ]);

  return (
    <div className="map-search-bar-wrap" ref={rootRef}>
      <div className={`google-search-bar map-search-bar ${open ? "map-search-bar--open" : ""}`}>
        <svg className="map-search-bar__icon" viewBox="0 0 24 24" aria-hidden>
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Search places, shops, or coordinates"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitSearch();
            }
          }}
        />
        <button
          type="button"
          className="map-search-bar__submit"
          onClick={() => commitSearch()}
          title="Search"
          aria-label="Search"
        >
          <svg className="map-search-bar__submit-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <path
              fill="currentColor"
              d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
            />
          </svg>
        </button>
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

      {showRecentsPanel && (
        <ul className="map-search-suggestions map-search-suggestions--recents" role="listbox" aria-label="Recent searches">
          <li className="map-search-suggestions__section-title">Recent</li>
          {recents.map((r) => (
            <li key={r}>
              <button
                type="button"
                className="map-search-suggestions__item map-search-suggestions__item--recent"
                onClick={() => {
                  setQuery(r);
                  setOpen(true);
                  inputRef.current?.focus();
                }}
              >
                <span className="map-search-suggestions__recent-icon" aria-hidden>
                  ↻
                </span>
                <span className="map-search-suggestions__label">{r}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showResultsPanel && (
        <ul className="map-search-suggestions map-search-suggestions--results" role="listbox">
          {locationHint && (
            <li className="map-search-suggestions__hint" role="note">
              {locationHint}
            </li>
          )}
          {loading && trimmedQuery.length >= 3 && (
            <li className="map-search-loading-row" aria-live="polite">
              <span className="spinner-small map-search-loading-spinner" />
              <span>Searching…</span>
            </li>
          )}
          {suggestionRows.map((row) => (
            <li key={row.key}>
              <button
                type="button"
                className="map-search-suggestions__item map-search-suggestions__item--row"
                onClick={() => {
                  const labelText = row.kind === "coords" ? row.sub : row.label;
                  recordAndPick(labelText, () => {
                    row.onPick();
                    setQuery(row.kind === "coords" ? row.sub : row.label);
                    setOpen(false);
                    setOsmResults([]);
                  });
                }}
              >
                <span className="map-search-suggestions__main">
                  <span className="map-search-suggestions__label">
                    <HighlightLabel text={row.label} query={trimmedQuery} />
                  </span>
                  <span className="map-search-suggestions__meta">{row.sub}</span>
                </span>
                {formatDistance(row.distanceM) && (
                  <span className="map-search-suggestions__distance">{formatDistance(row.distanceM)}</span>
                )}
              </button>
            </li>
          ))}
          {error && <li className="map-search-suggestions__status map-search-suggestions__status--error">{error}</li>}
          {!loading &&
            !error &&
            trimmedQuery.length >= 3 &&
            osmResults.length === 0 &&
            shopsHit.length === 0 &&
            !coords && <li className="map-search-suggestions__status">No results</li>}
        </ul>
      )}
    </div>
  );
}

export default React.memo(MapSearchBar);
