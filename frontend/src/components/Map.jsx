import {
  MapContainer,
  TileLayer,
  Marker,
  LayerGroup,
  ZoomControl,
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
import { quickReverseLabel, resolvePlaceAtLocation } from "../utils/geocoding";
import { haversineMeters, formatDistance, googleMapsDirectionsUrl } from "../utils/geoDistance";
import { useUserLocation } from "../hooks/useUserLocation";

// ───────────────────────────────────────────
// GPS locate control
// ───────────────────────────────────────────

function LocationFinder() {
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (buttonRef.current) {
      L.DomEvent.disableClickPropagation(buttonRef.current);
    }
  }, []);

  const map = useMapEvents({
    locationfound(e) {
      setPosition(e.latlng);
      map.flyTo(e.latlng, 15);
    },
    locationerror(e) {
      console.error("Location error:", e.message);
      alert("Could not get your location. Check Location permissions.");
    },
  });

  const userIcon = L.divIcon({
    className: "user-location-marker",
    html: '<div class="pulse-dot"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });

  return (
    <>
      <button
        ref={buttonRef}
        className="google-locate-btn"
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          map.locate();
        }}
        title="Show your location"
      >
        <svg focusable="false" viewBox="0 0 24 24" style={{ width: "24px", height: "24px", fill: "#666" }}>
          <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
        </svg>
      </button>

      {position !== null && <Marker position={position} icon={userIcon} />}
    </>
  );
}

// ───────────────────────────────────────────
// Main Map
// ───────────────────────────────────────────

const selectionPinIcon = L.divIcon({
  className: "map-selection-pin",
  html: '<div class="map-selection-pin__inner"></div>',
  iconSize: [28, 36],
  iconAnchor: [14, 34],
  popupAnchor: [0, -34],
});

function Map() {
  const { showToast } = useToast();
  const { coords: userCoords, status: locationStatus } = useUserLocation();
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
      setSelectionShop(null);
      setSelectionPoint({ lat, lng, label: "…" });
      setSheetOpen(true);
      setFlyTo({ center: [lat, lng], zoom: Math.max(14, 15), key: Date.now() });

      tapAbortRef.current?.abort();
      tapAbortRef.current = new AbortController();
      const { signal } = tapAbortRef.current;
      const label = await quickReverseLabel(lat, lng, { signal });
      setSelectionPoint((prev) => {
        if (!prev || prev.lat !== lat || prev.lng !== lng) return prev;
        return {
          lat,
          lng,
          label: label || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        };
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
    setSelectionPoint({ lat: place.lat, lng: place.lng, label: place.label || "Selected place" });
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
      label: coords.label || `${coords.lat}, ${coords.lng}`,
    });
    setSheetOpen(true);
    setFlyTo({ center: [coords.lat, coords.lng], zoom: 16, key: Date.now() });
  }, []);

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
    : selectionPoint?.label || "Location";

  const sheetSubtitle = selectionShop
    ? [selectionShop.category, selectionShop.description].filter(Boolean).join(" · ") ||
      `${selectionShop.latitude?.toFixed(5)}, ${selectionShop.longitude?.toFixed(5)}`
    : selectionPoint
      ? `${selectionPoint.lat.toFixed(5)}, ${selectionPoint.lng.toFixed(5)}`
      : "";

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
  }, [sheetDistanceM, locationStatus]);

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
        />
      </div>

      <button type="button" className="scan-fab" onClick={() => setScanModalOpen(true)} title="Scan a shop">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden>
          <path d="M9.5 6.5v3h-3v-3h3M11 5H5v6h6V5zm-1.5 9.5v3h-3v-3h3M11 13H5v6h6v-6zm6.5-6.5v3h-3v-3h3M19 5h-6v6h6V5zm-6 8h1.5v1.5H13V13zm1.5 1.5H16V16h-1.5v-1.5zM16 13h1.5v1.5H16V13zm-3 3h1.5v1.5H13V16zm1.5 1.5H16V19h-1.5v-1.5zM16 16h1.5v1.5H16V16zm1.5-1.5H19V16h-1.5v-1.5zm0 3H19V19h-1.5v-1.5zM22 7h-2V4h-3V2h5v5zm0 15v-5h-2v3h-3v2h5zM2 22h5v-2H4v-3H2v5zM2 2v5h2V4h3V2H2z" />
        </svg>
        <span className="scan-fab-label">Scan</span>
      </button>

      <MapContainer center={[23.0225, 72.5714]} zoom={13} zoomControl={false} style={{ height: "100%", width: "100%", zIndex: 1 }}>
        <TileLayer attribution="&copy; Google Maps" url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" />
        <ZoomControl position="bottomright" />
        <MapFlyTo target={flyTo} />
        <MapInteractionLayer onTapMap={handleTapMap} onLongPressMap={handleLongPressMap} />
        <LocationFinder />

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
            <Marker position={[selectionPoint.lat, selectionPoint.lng]} icon={selectionPinIcon} interactive={false} />
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
        subtitle={sheetSubtitle}
        distanceLabel={sheetDistanceLabel}
        isShop={Boolean(selectionShop)}
        onClose={clearMapSelection}
        onViewShop={() => {
          if (!selectionShop) return;
          setDetailShop(selectionShop);
          setDetailModalOpen(true);
          clearMapSelection();
        }}
        onAddShop={() => {
          if (!selectionPoint) return;
          setSelectedLocation({ lat: selectionPoint.lat, lng: selectionPoint.lng });
          setDetectedName(selectionPoint.label && selectionPoint.label !== "…" ? selectionPoint.label : "");
          setAddModalOpen(true);
          setSheetOpen(false);
        }}
        onDirections={() => {
          if (directionsLat == null || directionsLng == null) return;
          window.open(googleMapsDirectionsUrl(directionsLat, directionsLng), "_blank", "noopener,noreferrer");
        }}
        onStartNavigation={() => {
          if (directionsLat == null || directionsLng == null) return;
          window.open(googleMapsDirectionsUrl(directionsLat, directionsLng, { driving: true }), "_blank", "noopener,noreferrer");
        }}
        onDelete={
          selectionShop
            ? () => {
                if (window.confirm(`Delete "${selectionShop.shop_name}"?`)) {
                  handleDeleteShop(selectionShop._id);
                  clearMapSelection();
                }
              }
            : undefined
        }
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
