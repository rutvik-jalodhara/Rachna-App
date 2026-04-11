import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
  LayerGroup,
  ZoomControl,
} from "react-leaflet";
import React, { useEffect, useState } from "react";
import L from "leaflet";

// Move MapEvents outside to prevent component recreation and context loss inside Leaflet
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
      map.flyTo(e.latlng, 15); // smooth fly to the detected location
    },
    locationerror(e) {
      console.error("Location error:", e.message);
      alert(
        "Could not get your exact device location. Ensure your system's Location privacy settings are enabled!",
      );
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
        <svg
          focusable="false"
          viewBox="0 0 24 24"
          style={{ width: "24px", height: "24px", fill: "#666" }}
        >
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

function Map() {
  const [shops, setShops] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [formData, setFormData] = useState({
    shop_name: "",
    description: "",
    sales_details: "",
  });

  // Fetch shops
  useEffect(() => {
    fetch("http://localhost:5000/api/shops")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setShops(data);
        } else {
          setShops([]);
        }
      })
      .catch((err) => {
        console.error("Error fetching shops:", err);
        setShops([]); // Reset safely if backend is unreachable
      });
  }, []);

  const handleMapClick = async (loc) => {
    setIsLocating(true);

    try {
      // 1. Cast a massive 50-meter wide net as requested to catch nearby shops or amenities!
      const radius = 50;
      const query = `[out:json][timeout:10];(nwr["shop"](around:${radius},${loc.lat},${loc.lng});nwr["amenity"](around:${radius},${loc.lat},${loc.lng});nwr["building"](around:${radius},${loc.lat},${loc.lng}););out center;`;
      const overpassRes = await fetch(
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
      );
      const overpassData = await overpassRes.json();

      let detectedName = "";
      let finalLoc = loc;

      // If we caught locations in our 50m net, manually calculate the absolute closest one geographically
      if (overpassData && overpassData.elements && overpassData.elements.length > 0) {
        const namedElements = overpassData.elements.filter((el) => el.tags && el.tags.name);

        if (namedElements.length > 0) {
          let closestEl = null;
          let minDistance = Infinity;

          namedElements.forEach((el) => {
            const elLat = el.lat || (el.center && el.center.lat);
            const elLng = el.lon || (el.center && el.center.lon);
            if (elLat && elLng) {
              // Calculate straightforward distance relative to tap
              const dist = Math.hypot(elLat - loc.lat, elLng - loc.lng);
              if (dist < minDistance) {
                minDistance = dist;
                closestEl = el;
              }
            }
          });

          if (closestEl) {
            detectedName = closestEl.tags.name;
            const cLat = closestEl.lat || closestEl.center.lat;
            const cLng = closestEl.lon || closestEl.center.lon;
            finalLoc = { lat: cLat, lng: cLng };
          }
        }
      }

      // 2. Fallback: If 50 meters somehow yielded nothing, just do a raw coordinate Reverse Geocode.
      if (!detectedName) {
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lng}&zoom=18&addressdetails=1`,
        );
        const nomData = await nomRes.json();
        if (nomData && nomData.name) {
          detectedName = nomData.name;
        } else if (nomData && nomData.address) {
          detectedName =
            nomData.address.shop ||
            nomData.address.amenity ||
            nomData.address.building ||
            nomData.address.road ||
            "";
        }
      }

      setSelectedLocation(finalLoc);
      setFormData((prev) => ({ ...prev, shop_name: detectedName || "" }));
      setIsLocating(false);
      setModalOpen(true);
    } catch (err) {
      console.error("Reverse geocoding failed", err);
      setSelectedLocation(loc);
      setFormData((prev) => ({ ...prev, shop_name: "" }));
      setIsLocating(false);
      setModalOpen(true);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.shop_name) return;

    const newShop = {
      ...formData,
      latitude: selectedLocation.lat,
      longitude: selectedLocation.lng,
    };

    fetch("http://localhost:5000/api/shops/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(newShop),
    })
      .then((res) => res.json())
      .then((savedShop) => {
        setShops((prev) => [...prev, savedShop]);
        setModalOpen(false);
        setFormData({ shop_name: "", description: "", sales_details: "" });
      })
      .catch((err) => {
        console.error("Error adding shop:", err);
        // Failsafe: if backend is down, temporarily add it to local state anyway
        setShops((prev) => [...prev, { ...newShop, _id: Date.now() }]);
        setModalOpen(false);
        setFormData({ shop_name: "", description: "", sales_details: "" });
      });
  };

  const handleDeleteShop = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this mapped location?")) return;
    
    // Optimistically update UI immediately
    setShops((prev) => prev.filter((shop) => shop._id !== id));

    try {
      const res = await fetch(`http://localhost:5000/api/shops/${id}`, {
        method: "DELETE"
      });
      if (!res.ok) {
        console.error("Failed to delete shop on server");
      }
    } catch (err) {
      console.error("Error deleting shop:", err);
    }
  };

  // Create custom icon
  const createCustomIcon = (shopName) => {
    const initial = shopName && shopName.length > 0 ? shopName.charAt(0).toUpperCase() : "?";
    return L.divIcon({
      className: "custom-marker",
      html: `<div class="marker-pin"><span class="marker-initial">${initial}</span></div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -36],
    });
  };

  // Extract valid shops to guarantee no 'null' children are passed to react-leaflet Container
  const validShops = Array.isArray(shops)
    ? shops.filter(
        (shop) => shop && typeof shop.latitude === "number" && typeof shop.longitude === "number",
      )
    : [];

  return (
    <div style={{ position: "relative", width: "100%", height: "calc(100vh - 65px)" }}>
      {/* Google Maps Floating Search Bar Overlay */}
      <div className="google-search-bar" style={{ position: "absolute", zIndex: 1000 }}>
        <svg
          style={{ width: "24px", height: "24px", fill: "#5f6368" }}
          focusable="false"
          viewBox="0 0 24 24"
        >
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path>
        </svg>
        <input type="text" placeholder="Search Rachna Map App" />
      </div>

      <MapContainer
        center={[23.0225, 72.5714]}
        zoom={13}
        zoomControl={false}
        style={{ height: "100%", width: "100%", zIndex: 1 }}
      >
        {/* Google Maps Clean Minimalist Style is omitted. Rendering user-selected Map Tiles */}
        <TileLayer
          attribution="&copy; Google Maps"
          url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
        />

        {/* Bottom Right Zoom Overlays matching Google */}
        <ZoomControl position="bottomright" />

        <MapEvents onLocationSelect={handleMapClick} />

        <LocationFinder />

        <LayerGroup>
          {validShops.map((shop, index) => (
            <Marker
              key={shop._id || index}
              position={[shop.latitude, shop.longitude]}
              icon={createCustomIcon(shop.shop_name)}
            >
              <Popup>
                <div style={{ fontFamily: "Inter" }}>
                  <h4 style={{ margin: "0 0 5px 0", color: "#2d3436" }}>{shop.shop_name || "Unknown Shop"}</h4>
                  {shop.description ? <p style={{ margin: "0 0 5px 0", fontSize: "13px" }}>{shop.description}</p> : null}
                  {shop.sales_details ? <p className="sales" style={{ margin: "0 0 5px 0", fontSize: "13px", fontWeight: "bold" }}>Sales: {shop.sales_details}</p> : null}
                  <button 
                    style={{ marginTop: '10px', width: '100%', background: '#ff4757', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
                    onClick={(e) => handleDeleteShop(shop._id, e)}
                  >
                    Remove Location
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </LayerGroup>
      </MapContainer>

      {isLocating && (
        <div className="loader-overlay">
          <div className="spinner"></div>
          <div className="loader-text">Pinpointing Location...</div>
        </div>
      )}

      {modalOpen ? (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="glass-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {formData.shop_name === "Detecting location..."
                ? "Detecting location..."
                : formData.shop_name
                  ? `Details for ${formData.shop_name}`
                  : "Mark New Location"}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <label>Shop Name *</label>
                <input
                  type="text"
                  name="shop_name"
                  value={formData.shop_name}
                  onChange={handleInputChange}
                  required
                  placeholder="E.g., Rachna Store"
                />
              </div>

              <div className="input-group">
                <label>Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="What does this shop about?"
                  rows="2"
                />
              </div>

              <div className="input-group">
                <label>Sales Details</label>
                <input
                  type="text"
                  name="sales_details"
                  value={formData.sales_details}
                  onChange={handleInputChange}
                  placeholder="E.g., ₹50,000/month"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-cancel"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-submit">
                  Save Shop
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
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
        <div
          style={{
            padding: "20px",
            color: "red",
            backgroundColor: "white",
            zIndex: 9999,
            position: "relative",
          }}
        >
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
