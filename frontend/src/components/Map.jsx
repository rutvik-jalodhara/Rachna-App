import {
  MapContainer,
  TileLayer,
  Marker,
  LayerGroup,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import L from "leaflet";
import AddShopModal from "./AddShopModal";
import ScanModal from "./ScanModal";
import ShopDetailModal from "./ShopDetailModal";
import MapSearchBar from "./MapSearchBar";
import MapActionSheet from "./MapActionSheet";
import MapInteractionLayer from "./MapInteractionLayer";
import MapFlyTo from "./MapFlyTo";
import { useToast } from "./Toast";
import { fetchShops, addShop, deleteShop as deleteShopApi } from "../hooks/useApi";
import { quickReverseLabel, resolvePlaceAtLocation, resolveMapTapLabel } from "../utils/geocoding";
import { haversineMeters, formatDistance, formatApproxDriveEta, googleMapsDirectionsUrl } from "../utils/geoDistance";
import { useUserLocation } from "../hooks/useUserLocation";
import { MAP_CONFIG } from "../config/mapConfig";

const liveUserIcon = L.divIcon({
  className: "user-location-marker",
  html: '<div class="pulse-dot pulse-dot--live"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -9],
});

/** Blue dot for live GPS — tap opens Add Shop at current location. */
function LiveUserMarker({ userCoords, onUserMarkerTap }) {
  if (!userCoords || !Number.isFinite(userCoords.lat) || !Number.isFinite(userCoords.lng)) return null;
  return (
    <Marker
      position={[userCoords.lat, userCoords.lng]}
      icon={liveUserIcon}
      zIndexOffset={1000}
      eventHandlers={{
        click: (e) => {
          if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
          onUserMarkerTap?.();
        },
      }}
    />
  );
}

// ───────────────────────────────────────────
// Center / locate controls (uses live userCoords when available)
// ───────────────────────────────────────────

function LocationControls({ userCoords, lastFixAt }) {
  const locateRef = useRef(null);

  const map = useMap();
  useMapEvents({
    locationfound(e) {
      map.flyTo(e.latlng, Math.max(map.getZoom(), 15), { duration: 0.55 });
    },
  });

  useEffect(() => {
    if (locateRef.current) L.DomEvent.disableClickPropagation(locateRef.current);
  }, []);

  const flyToUser = useCallback(() => {
    const hasCoords = userCoords && Number.isFinite(userCoords.lat) && Number.isFinite(userCoords.lng);
    const fresh = lastFixAt != null && Date.now() - lastFixAt < MAP_CONFIG.LOCATION_STALE_MS;
    if (hasCoords && fresh) {
      map.flyTo([userCoords.lat, userCoords.lng], Math.max(map.getZoom(), 15), { duration: 0.55 });
      return;
    }
    map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
  }, [map, userCoords, lastFixAt]);

  return (
    <button
      ref={locateRef}
      className="google-locate-btn"
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        flyToUser();
      }}
      title="Your location"
    >
      <svg focusable="false" viewBox="0 0 24 24" style={{ width: "24px", height: "24px", fill: "#666" }} aria-hidden>
        <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
      </svg>
    </button>
  );
}

// ───────────────────────────────────────────
// Main Map
// ───────────────────────────────────────────

const selectionPinIconDefault = L.divIcon({
  className: "map-selection-pin map-selection-pin--active",
  html: '<div class="map-selection-pin__inner"></div>',
  iconSize: [28, 36],
  iconAnchor: [14, 34],
  popupAnchor: [0, -34],
});

const selectionPinIconResolving = L.divIcon({
  className: "map-selection-pin map-selection-pin--resolving",
  html: '<div class="map-selection-pin__inner"></div>',
  iconSize: [28, 36],
  iconAnchor: [14, 34],
  popupAnchor: [0, -34],
});

const selectionPinIconPoi = L.divIcon({
  className: "map-selection-pin map-selection-pin--poi-match",
  html: '<div class="map-selection-pin__inner"></div>',
  iconSize: [28, 36],
  iconAnchor: [14, 34],
  popupAnchor: [0, -34],
});

/** Only re-center map after resolve if POI/reverse moved the pin enough (reduces flicker). */
const TAP_RESOLVE_FLY_MIN_M = 35;

function Map() {
  const { showToast } = useToast();
  const { coords: userCoords, status: locationStatus, lastFixAt } = useUserLocation();
  const [shops, setShops] = useState([]);
  const [isEnriching, setIsEnriching] = useState(false);
  const [flyTo, setFlyTo] = useState(null);

  const [selectionShop, setSelectionShop] = useState(null);
  const [selectionPoint, setSelectionPoint] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [detailShop, setDetailShop] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const [selectedLocation, setSelectedLocation] = useState(null);
  const [detectedName, setDetectedName] = useState("");

  const tapAbortRef = useRef(null);
  const enrichAbortRef = useRef(null);
  const tapResolutionSeqRef = useRef(0);

  useEffect(() => {
    fetchShops()
      .then(setShops)
      .catch((err) => {
        console.error("Error fetching shops:", err);
        setShops([]);
      });
  }, []);

  const clearMapSelection = useCallback(() => {
    tapAbortRef.current?.abort();
    setSelectionShop(null);
    setSelectionPoint(null);
    setSheetOpen(false);
  }, []);

  const handleAddShop = useCallback(
    async (shopData, imageFile, onProgress) => {
      try {
        const savedShop = await addShop(shopData, imageFile, onProgress);
        setShops((prev) => [savedShop, ...prev]);
        setAddModalOpen(false);
        clearMapSelection();
        showToast(
          imageFile
            ? `"${savedShop.shop_name}" saved with AI embeddings!`
            : `"${savedShop.shop_name}" saved!`,
          "success"
        );
      } catch (err) {
        const msg = err.response?.data?.error || err.message;
        if (err.response?.status === 409) {
          showToast("This shop already exists at this location", "warning");
        } else {
          showToast(msg || "Failed to save shop", "error");
        }
        throw err;
      }
    },
    [showToast, clearMapSelection]
  );

  const handleDeleteShop = useCallback(
    async (id) => {
      setShops((prev) => prev.filter((s) => s._id !== id));
      try {
        await deleteShopApi(id);
        showToast("Shop deleted", "info");
      } catch (err) {
        console.error("Delete error:", err);
        showToast("Failed to delete on server", "error");
      }
    },
    [showToast]
  );

  const handleMatchFound = useCallback((shop) => {
    setDetailShop(shop);
    setDetailModalOpen(true);
  }, []);

  const handleSelectShopFromMarker = useCallback((shop) => {
    tapAbortRef.current?.abort();
    setSelectionPoint(null);
    setSelectionShop(shop);
    setSheetOpen(true);
    setFlyTo({ center: [shop.latitude, shop.longitude], zoom: 16, key: Date.now() });
  }, []);

  const handleTapMap = useCallback(
    async (latlng) => {
      const { lat, lng } = latlng;
      const seq = ++tapResolutionSeqRef.current;

      setSelectionShop(null);
      setSelectionPoint({
        lat,
        lng,
        tapLat: lat,
        tapLng: lng,
        resolving: true,
        label: "",
        matchSource: null,
      });
      setSheetOpen(true);
      setFlyTo({ center: [lat, lng], zoom: Math.max(14, 15), key: Date.now() });

      tapAbortRef.current?.abort();
      tapAbortRef.current = new AbortController();
      const { signal } = tapAbortRef.current;

      const resolved = await resolveMapTapLabel(lat, lng, { signal });
      if (signal.aborted || seq !== tapResolutionSeqRef.current) return;

      const movedM = haversineMeters(lat, lng, resolved.lat, resolved.lng);
      if (movedM >= TAP_RESOLVE_FLY_MIN_M) {
        setFlyTo({
          center: [resolved.lat, resolved.lng],
          zoom: Math.max(15, 16),
          key: Date.now(),
        });
      }

      setSelectionPoint({
        lat: resolved.lat,
        lng: resolved.lng,
        tapLat: lat,
        tapLng: lng,
        resolving: false,
        label: resolved.label,
        matchSource: resolved.source,
      });
    },
    []
  );

  const handleLongPressMap = useCallback(async (latlng) => {
    enrichAbortRef.current?.abort();
    enrichAbortRef.current = new AbortController();
    const { signal } = enrichAbortRef.current;
    setSheetOpen(false);
    setSelectionShop(null);
    setSelectionPoint(null);
    setIsEnriching(true);
    try {
      const { location, name } = await resolvePlaceAtLocation(latlng.lat, latlng.lng, { signal });
      setSelectedLocation(location);
      setDetectedName(name);
      setAddModalOpen(true);
    } catch (err) {
      if (err.name === "AbortError") return;
      setSelectedLocation({ lat: latlng.lat, lng: latlng.lng });
      setDetectedName("");
      setAddModalOpen(true);
    } finally {
      setIsEnriching(false);
    }
  }, []);

  const handleSearchPlace = useCallback((place) => {
    setSelectionShop(null);
    setSelectionPoint({
      lat: place.lat,
      lng: place.lng,
      tapLat: place.lat,
      tapLng: place.lng,
      resolving: false,
      label: place.label || "Selected place",
      matchSource: "reverse",
    });
    setSheetOpen(true);
    setFlyTo({ center: [place.lat, place.lng], zoom: 16, key: Date.now() });
  }, []);

  const handleSearchShop = useCallback((shop) => {
    setSelectionPoint(null);
    setSelectionShop(shop);
    setSheetOpen(true);
    setFlyTo({ center: [shop.latitude, shop.longitude], zoom: 16, key: Date.now() });
  }, []);

  const handleSearchCoords = useCallback((coords) => {
    setSelectionShop(null);
    setSelectionPoint({
      lat: coords.lat,
      lng: coords.lng,
      tapLat: coords.lat,
      tapLng: coords.lng,
      resolving: false,
      label: coords.label || `${coords.lat}, ${coords.lng}`,
      matchSource: null,
    });
    setSheetOpen(true);
    setFlyTo({ center: [coords.lat, coords.lng], zoom: 16, key: Date.now() });
  }, []);

  const openAddShopAtSelection = useCallback(() => {
    if (selectionPoint?.resolving) return;
    const lat = selectionShop?.latitude ?? selectionPoint?.lat;
    const lng = selectionShop?.longitude ?? selectionPoint?.lng;
    if (lat == null || lng == null) return;
    setSelectedLocation({ lat, lng });
    const fromPoint = selectionPoint?.label?.trim() ? selectionPoint.label : "";
    setDetectedName(selectionShop ? "" : fromPoint);
    setAddModalOpen(true);
    setSheetOpen(false);
  }, [selectionShop, selectionPoint]);

  const handleUserMarkerTap = useCallback(async () => {
    if (!userCoords) return;
    clearMapSelection();
    setSelectedLocation({ lat: userCoords.lat, lng: userCoords.lng });
    setDetectedName("");
    setAddModalOpen(true);
    try {
      const name = await quickReverseLabel(userCoords.lat, userCoords.lng);
      if (name) setDetectedName(name);
    } catch {
      /* ignore */
    }
  }, [userCoords, clearMapSelection]);

  const createCustomIcon = useCallback((shop, isSelected) => {
    const sel = isSelected ? " marker-pin--selected" : "";
    if (shop.image_url) {
      return L.divIcon({
        className: "custom-marker",
        html: `
          <div class="marker-pin marker-pin-img${sel}">
            <img src="${shop.image_url}" alt="" class="marker-thumb" />
          </div>
        `,
        iconSize: [42, 42],
        iconAnchor: [21, 42],
        popupAnchor: [0, -42],
      });
    }
    const initial = shop.shop_name?.charAt(0)?.toUpperCase() || "?";
    return L.divIcon({
      className: "custom-marker",
      html: `<div class="marker-pin${sel}"><span class="marker-initial">${initial}</span></div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -36],
    });
  }, []);

  const validShops = (Array.isArray(shops) ? shops : []).filter(
    (s) => s && typeof s.latitude === "number" && typeof s.longitude === "number"
  );

  const selectedId = selectionShop?._id;

  const sheetTitle = selectionShop
    ? selectionShop.shop_name || "Shop"
    : selectionPoint?.resolving
      ? ""
      : selectionPoint?.label || "Location";

  const sheetTitleLoading = Boolean(selectionPoint?.resolving);
  const sheetLocationMatchHint =
    !selectionShop && selectionPoint && !selectionPoint.resolving && selectionPoint.matchSource === "poi"
      ? "Matched nearby place"
      : null;

  const directionsLat = selectionShop ? selectionShop.latitude : selectionPoint?.lat;
  const directionsLng = selectionShop ? selectionShop.longitude : selectionPoint?.lng;

  const sheetDistanceM = useMemo(() => {
    if (!userCoords) return null;
    if (selectionShop && Number.isFinite(selectionShop.latitude) && Number.isFinite(selectionShop.longitude)) {
      return haversineMeters(userCoords.lat, userCoords.lng, selectionShop.latitude, selectionShop.longitude);
    }
    if (selectionPoint && Number.isFinite(selectionPoint.lat) && Number.isFinite(selectionPoint.lng)) {
      return haversineMeters(userCoords.lat, userCoords.lng, selectionPoint.lat, selectionPoint.lng);
    }
    return null;
  }, [userCoords, selectionShop, selectionPoint]);

  const sheetDistanceLabel = useMemo(() => {
    if (selectionPoint?.resolving) return null;
    if (sheetDistanceM != null && Number.isFinite(sheetDistanceM)) {
      return `${formatDistance(sheetDistanceM)} away`;
    }
    if (locationStatus === "denied" || locationStatus === "unsupported") {
      return "Location off — enable for distances";
    }
    if (locationStatus === "error" || locationStatus === "unavailable") {
      return "Location unavailable — distances hidden";
    }
    return null;
  }, [sheetDistanceM, locationStatus, selectionPoint?.resolving]);

  const sheetEtaLabel = useMemo(() => {
    if (selectionPoint?.resolving) return null;
    if (sheetDistanceM == null || !Number.isFinite(sheetDistanceM)) return null;
    return formatApproxDriveEta(sheetDistanceM);
  }, [sheetDistanceM, selectionPoint?.resolving]);

  return (
    <div className="map-root">
      <div className="map-search-outer">
        <MapSearchBar
          shops={validShops}
          userCoords={userCoords}
          locationStatus={locationStatus}
          onPickPlace={handleSearchPlace}
          onPickShop={handleSearchShop}
          onPickCoords={handleSearchCoords}
          onSearchToast={showToast}
        />
      </div>

      <button type="button" className="scan-fab" onClick={() => setScanModalOpen(true)} title="Scan a shop">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden>
          <path d="M9.5 6.5v3h-3v-3h3M11 5H5v6h6V5zm-1.5 9.5v3h-3v-3h3M11 13H5v6h6v-6zm6.5-6.5v3h-3v-3h3M19 5h-6v6h6V5zm-6 8h1.5v1.5H13V13zm1.5 1.5H16V16h-1.5v-1.5zM16 13h1.5v1.5H16V13zm-3 3h1.5v1.5H13V16zm1.5 1.5H16V19h-1.5v-1.5zM16 16h1.5v1.5H16V16zm1.5-1.5H19V16h-1.5v-1.5zm0 3H19V19h-1.5v-1.5zM22 7h-2V4h-3V2h5v5zm0 15v-5h-2v3h-3v2h5zM2 22h5v-2H4v-3H2v5zM2 2v5h2V4h3V2H2z" />
        </svg>
        <span className="scan-fab-label">Scan</span>
      </button>

      <MapContainer
        center={[23.0225, 72.5714]}
        zoom={13}
        minZoom={2}
        zoomControl={false}
        tap={true}
        worldCopyJump={false}
        maxBounds={[
          [-85, -180],
          [85, 180],
        ]}
        maxBoundsViscosity={1.0}
        style={{ height: "100%", width: "100%", zIndex: 1 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.google.com/maps">Google</a> satellite'
          url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
          noWrap
        />
        <ZoomControl position="bottomright" />
        <MapFlyTo target={flyTo} />
        <MapInteractionLayer onTapMap={handleTapMap} onLongPressMap={handleLongPressMap} />
        <LiveUserMarker userCoords={userCoords} onUserMarkerTap={handleUserMarkerTap} />
        <LocationControls userCoords={userCoords} lastFixAt={lastFixAt} />

        <LayerGroup>
          {validShops.map((shop, index) => (
            <Marker
              key={shop._id || index}
              position={[shop.latitude, shop.longitude]}
              icon={createCustomIcon(shop, selectedId && shop._id === selectedId)}
              eventHandlers={{
                click: (e) => {
                  if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
                  handleSelectShopFromMarker(shop);
                },
              }}
            />
          ))}
          {selectionPoint && !selectionShop && (
            <Marker
              position={[selectionPoint.lat, selectionPoint.lng]}
              icon={
                selectionPoint.resolving
                  ? selectionPinIconResolving
                  : selectionPoint.matchSource === "poi"
                    ? selectionPinIconPoi
                    : selectionPinIconDefault
              }
              interactive={false}
            />
          )}
        </LayerGroup>
      </MapContainer>

      {isEnriching && (
        <div className="loader-overlay">
          <div className="spinner" />
          <div className="loader-text">Preparing place…</div>
        </div>
      )}

      <MapActionSheet
        isOpen={sheetOpen && (selectionShop || selectionPoint)}
        title={sheetTitle}
        titleLoading={sheetTitleLoading}
        locationMatchHint={sheetLocationMatchHint}
        distanceLabel={sheetDistanceLabel}
        etaLabel={sheetEtaLabel}
        actionsDisabled={sheetTitleLoading}
        onClose={clearMapSelection}
        onAddShop={openAddShopAtSelection}
        onDirections={() => {
          if (sheetTitleLoading || directionsLat == null || directionsLng == null) return;
          window.open(googleMapsDirectionsUrl(directionsLat, directionsLng), "_blank", "noopener,noreferrer");
        }}
        onStartNavigation={() => {
          if (sheetTitleLoading || directionsLat == null || directionsLng == null) return;
          window.open(googleMapsDirectionsUrl(directionsLat, directionsLng, { driving: true }), "_blank", "noopener,noreferrer");
        }}
      />

      <AddShopModal
        isOpen={addModalOpen}
        onClose={() => {
          setAddModalOpen(false);
          enrichAbortRef.current?.abort();
        }}
        onSubmit={handleAddShop}
        initialName={detectedName}
        location={selectedLocation}
      />

      <ScanModal
        isOpen={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        onMatchFound={handleMatchFound}
        userCoords={userCoords}
      />

      <ShopDetailModal
        shop={detailShop}
        isOpen={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setDetailShop(null);
        }}
        onDelete={handleDeleteShop}
      />

    </div>
  );
}

class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("MapErrorBoundary Caught:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", color: "red", backgroundColor: "white", zIndex: 9999, position: "relative" }}>
          <h2>Map Component Crashed</h2>
          <p>{this.state.error && this.state.error.toString()}</p>
          <pre>{this.state.errorInfo && this.state.errorInfo.componentStack}</pre>
        </div>
      );
    }
    return <Map {...this.props} />;
  }
}

export default MapErrorBoundary;
