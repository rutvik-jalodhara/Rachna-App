import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
  LayerGroup,
  ZoomControl,
} from "react-leaflet";
import React, { useEffect, useState, useCallback } from "react";
import L from "leaflet";
import AddShopModal from "./AddShopModal";
import ScanModal from "./ScanModal";
import ShopDetailModal from "./ShopDetailModal";
import { useToast } from "./Toast";
import { fetchShops, addShop, deleteShop as deleteShopApi } from "../hooks/useApi";

// ───────────────────────────────────────────
// Map sub-components (outside main to avoid re-creation)
// ───────────────────────────────────────────

function MapEvents({ onLocationSelect }) {
  useMapEvents({
    click(e) {
      if (onLocationSelect) {
        onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    },
  });
  return null;
}

function LocationFinder() {
  const [position, setPosition] = useState(null);
  const buttonRef = React.useRef(null);

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
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          map.locate();
        }}
        title="Show your location"
      >
        <svg focusable="false" viewBox="0 0 24 24" style={{ width: "24px", height: "24px", fill: "#666" }}>
          <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"></path>
        </svg>
      </button>

      {position !== null && (
        <Marker position={position} icon={userIcon}>
          <Popup>You are here!</Popup>
        </Marker>
      )}
    </>
  );
}

// ───────────────────────────────────────────
// Main Map Component
// ───────────────────────────────────────────

function Map() {
  const { showToast } = useToast();
  const [shops, setShops] = useState([]);
  const [isLocating, setIsLocating] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);

  // Modal states
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [detailShop, setDetailShop] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const [detectedName, setDetectedName] = useState("");

  // Fetch shops on mount
  useEffect(() => {
    fetchShops()
      .then(setShops)
      .catch((err) => {
        console.error("Error fetching shops:", err);
        setShops([]);
      });
  }, []);

  // ── Map click handler with location detection ──
  const handleMapClick = useCallback(async (loc) => {
    setIsLocating(true);

    try {
      const radius = 50;
      const query = `[out:json][timeout:10];(nwr["shop"](around:${radius},${loc.lat},${loc.lng});nwr["amenity"](around:${radius},${loc.lat},${loc.lng});nwr["building"](around:${radius},${loc.lat},${loc.lng}););out center;`;
      const overpassRes = await fetch(
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
      );
      const overpassData = await overpassRes.json();

      let name = "";
      let finalLoc = loc;

      if (overpassData?.elements?.length > 0) {
        const namedElements = overpassData.elements.filter((el) => el.tags?.name);
        if (namedElements.length > 0) {
          let closestEl = null;
          let minDist = Infinity;

          namedElements.forEach((el) => {
            const elLat = el.lat || el.center?.lat;
            const elLng = el.lon || el.center?.lon;
            if (elLat && elLng) {
              const dist = Math.hypot(elLat - loc.lat, elLng - loc.lng);
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

      if (!name) {
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lng}&zoom=18&addressdetails=1`
        );
        const nomData = await nomRes.json();
        if (nomData?.name) {
          name = nomData.name;
        } else if (nomData?.address) {
          name = nomData.address.shop || nomData.address.amenity || nomData.address.building || nomData.address.road || "";
        }
      }

      setSelectedLocation(finalLoc);
      setDetectedName(name || "");
      setIsLocating(false);
      setAddModalOpen(true);
    } catch (err) {
      console.error("Location detection failed:", err);
      setSelectedLocation(loc);
      setDetectedName("");
      setIsLocating(false);
      setAddModalOpen(true);
    }
  }, []);

  // ── Add shop handler ──
  const handleAddShop = useCallback(
    async (shopData, imageFile, onProgress) => {
      try {
        const savedShop = await addShop(shopData, imageFile, onProgress);
        setShops((prev) => [savedShop, ...prev]);
        setAddModalOpen(false);
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
        throw err; // Re-throw so modal stays open
      }
    },
    [showToast]
  );

  // ── Delete shop handler ──
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

  // ── Scan match handler ──
  const handleMatchFound = useCallback((shop) => {
    setDetailShop(shop);
    setDetailModalOpen(true);
  }, []);

  // ── Shop popup click → detail ──
  const handleShopClick = useCallback((shop) => {
    setDetailShop(shop);
    setDetailModalOpen(true);
  }, []);

  // ── Create marker icons ──
  const createCustomIcon = useCallback((shop) => {
    if (shop.image_url) {
      // Image-based marker
      return L.divIcon({
        className: "custom-marker",
        html: `
          <div class="marker-pin marker-pin-img">
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
      html: `<div class="marker-pin"><span class="marker-initial">${initial}</span></div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -36],
    });
  }, []);

  // Filter valid shops
  const validShops = (Array.isArray(shops) ? shops : []).filter(
    (s) => s && typeof s.latitude === "number" && typeof s.longitude === "number"
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "calc(100vh - 65px)" }}>
      {/* Search Bar */}
      <div className="google-search-bar" style={{ position: "absolute", zIndex: 1000 }}>
        <svg style={{ width: "24px", height: "24px", fill: "#5f6368" }} focusable="false" viewBox="0 0 24 24">
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path>
        </svg>
        <input type="text" placeholder="Search Rachna Map App" />
      </div>

      {/* ✨ SCAN FAB BUTTON ✨ */}
      <button
        className="scan-fab"
        onClick={() => setScanModalOpen(true)}
        title="Scan a shop"
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
          <path d="M9.5 6.5v3h-3v-3h3M11 5H5v6h6V5zm-1.5 9.5v3h-3v-3h3M11 13H5v6h6v-6zm6.5-6.5v3h-3v-3h3M19 5h-6v6h6V5zm-6 8h1.5v1.5H13V13zm1.5 1.5H16V16h-1.5v-1.5zM16 13h1.5v1.5H16V13zm-3 3h1.5v1.5H13V16zm1.5 1.5H16V19h-1.5v-1.5zM16 16h1.5v1.5H16V16zm1.5-1.5H19V16h-1.5v-1.5zm0 3H19V19h-1.5v-1.5zM22 7h-2V4h-3V2h5v5zm0 15v-5h-2v3h-3v2h5zM2 22h5v-2H4v-3H2v5zM2 2v5h2V4h3V2H2z" />
        </svg>
        <span className="scan-fab-label">Scan</span>
      </button>

      {/* Leaflet Map */}
      <MapContainer
        center={[23.0225, 72.5714]}
        zoom={13}
        zoomControl={false}
        style={{ height: "100%", width: "100%", zIndex: 1 }}
      >
        <TileLayer
          attribution="&copy; Google Maps"
          url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
        />
        <ZoomControl position="bottomright" />
        <MapEvents onLocationSelect={handleMapClick} />
        <LocationFinder />

        <LayerGroup>
          {validShops.map((shop, index) => (
            <Marker
              key={shop._id || index}
              position={[shop.latitude, shop.longitude]}
              icon={createCustomIcon(shop)}
            >
              <Popup>
                <div className="shop-popup">
                  {shop.image_url && (
                    <img src={shop.image_url} alt={shop.shop_name} className="popup-shop-img" />
                  )}
                  <h4>{shop.shop_name || "Unknown Shop"}</h4>
                  {shop.category && shop.category !== "General" && (
                    <span className="category-badge category-badge-sm">{shop.category}</span>
                  )}
                  {shop.description && <p className="popup-desc">{shop.description}</p>}
                  {shop.sales_details && <p className="sales">Sales: {shop.sales_details}</p>}
                  <div className="popup-actions">
                    <button
                      className="popup-btn popup-btn-view"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShopClick(shop);
                      }}
                    >
                      View Details
                    </button>
                    <button
                      className="popup-btn popup-btn-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm("Delete this shop?")) {
                          handleDeleteShop(shop._id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </LayerGroup>
      </MapContainer>

      {/* Loading Overlay */}
      {isLocating && (
        <div className="loader-overlay">
          <div className="spinner"></div>
          <div className="loader-text">Detecting Location...</div>
        </div>
      )}

      {/* Add Shop Modal */}
      <AddShopModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddShop}
        initialName={detectedName}
        location={selectedLocation}
      />

      {/* Scan Modal */}
      <ScanModal
        isOpen={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        onMatchFound={handleMatchFound}
      />

      {/* Shop Detail Modal */}
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

// Error Boundary
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
