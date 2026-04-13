import React, { useState, useEffect, useCallback } from "react";
import ImageUploader from "./ImageUploader";
import { useToast } from "./Toast";

const CATEGORIES = [
  "General",
  "Grocery",
  "Electronics",
  "Clothing",
  "Restaurant",
  "Medical",
  "Hardware",
  "Salon",
  "Jewellery",
  "Stationery",
  "Other",
];

const GEO_OPTIONS = {
  enableHighAccuracy: false,
  maximumAge: 60_000,
  timeout: 12_000,
};

/**
 * AddShopModal — shop creation with map or GPS coordinates.
 */
export default function AddShopModal({
  isOpen,
  onClose,
  onSubmit,
  initialName = "",
  location = null,
}) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    shop_name: initialName,
    description: "",
    sales_details: "",
    category: "General",
    notes: "",
  });
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [coordSource, setCoordSource] = useState("map");
  const [gpsCoords, setGpsCoords] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setFormData((prev) => ({
        ...prev,
        shop_name: initialName || prev.shop_name,
      }));
      setCoordSource("map");
      setGpsCoords(null);
      setGpsError(null);
      setGpsLoading(false);
    }
  }, [isOpen, initialName]);

  const effectiveCoords =
    coordSource === "current" && gpsCoords
      ? gpsCoords
      : location && location.lat != null && location.lng != null
        ? { lat: location.lat, lng: location.lng }
        : null;

  const useCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported.");
      showToast("Geolocation not supported", "error");
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setCoordSource("current");
        setGpsLoading(false);
        showToast("Using your current location", "success");
      },
      (err) => {
        setGpsLoading(false);
        const msg =
          err.code === 1
            ? "Permission denied. Allow location access to use this option."
            : err.message || "Could not read your location.";
        setGpsError(msg);
        showToast(msg, "error");
      },
      GEO_OPTIONS
    );
  }, [showToast]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageSelect = (file, preview) => {
    setImageFile(file);
    setPreviewUrl(preview);
  };

  const handleImageClear = () => {
    setImageFile(null);
    setPreviewUrl(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.shop_name.trim()) {
      showToast("Shop name is required", "error");
      return;
    }

    if (!effectiveCoords || !Number.isFinite(effectiveCoords.lat) || !Number.isFinite(effectiveCoords.lng)) {
      showToast("Choose a location on the map or use current location", "error");
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(0);

    try {
      await onSubmit(
        {
          ...formData,
          latitude: effectiveCoords.lat,
          longitude: effectiveCoords.lng,
        },
        imageFile,
        (progress) => setUploadProgress(progress)
      );

      setFormData({
        shop_name: "",
        description: "",
        sales_details: "",
        category: "General",
        notes: "",
      });
      handleImageClear();
    } catch (err) {
      showToast(err.message || "Failed to save shop", "error");
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  if (!isOpen) return null;

  const hasMapLocation = location && Number.isFinite(location.lat) && Number.isFinite(location.lng);

  return (
    <div className="modal modal--backdrop" onClick={onClose}>
      <div className="modal__sheet glass-modal add-shop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header modal-header--sticky">
          <h3>{formData.shop_name ? `Add "${formData.shop_name}"` : "Add New Shop"}</h3>
          <button className="modal-close-btn" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <form className="modal-content modal-content--form" onSubmit={handleSubmit}>
          <div className="add-shop-location-block">
            <label className="section-label">Coordinates</label>
            <p className="add-shop-coords-readout">
              {effectiveCoords
                ? `${effectiveCoords.lat.toFixed(6)}, ${effectiveCoords.lng.toFixed(6)}`
                : "—"}
            </p>
            <p className="add-shop-coords-source">
              {coordSource === "current" ? "Using device GPS" : hasMapLocation ? "Using selected map location" : "Set location from map or GPS"}
            </p>
            <div className="add-shop-location-chips">
              <button
                type="button"
                className={`add-shop-loc-chip ${coordSource === "map" && hasMapLocation ? "add-shop-loc-chip--active" : ""}`}
                disabled={!hasMapLocation || isSubmitting}
                onClick={() => {
                  setCoordSource("map");
                  setGpsError(null);
                }}
              >
                Use selected map location
              </button>
              <button
                type="button"
                className={`add-shop-loc-chip ${coordSource === "current" ? "add-shop-loc-chip--active" : ""}`}
                disabled={isSubmitting || gpsLoading}
                onClick={useCurrentLocation}
              >
                {gpsLoading ? "Getting location…" : "Use current location"}
              </button>
            </div>
            {gpsError && <p className="add-shop-gps-error">{gpsError}</p>}
          </div>

          <div className="image-upload-section">
            <label className="section-label">Shop Photo</label>
            <ImageUploader
              onImageSelect={handleImageSelect}
              onImageClear={handleImageClear}
              previewUrl={previewUrl}
              disabled={isSubmitting}
            />
          </div>

          <div className="input-group">
            <label>Shop Name *</label>
            <input
              type="text"
              name="shop_name"
              value={formData.shop_name}
              onChange={handleChange}
              required
              placeholder="E.g., Rachna Store"
              disabled={isSubmitting}
            />
          </div>

          <div className="input-group">
            <label>Category</label>
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              disabled={isSubmitting}
              className="category-select"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <label>Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="What does this shop sell?"
              rows="2"
              disabled={isSubmitting}
            />
          </div>

          <div className="input-group">
            <label>Sales Details</label>
            <input
              type="text"
              name="sales_details"
              value={formData.sales_details}
              onChange={handleChange}
              placeholder="E.g., ₹50,000/month"
              disabled={isSubmitting}
            />
          </div>

          <div className="input-group">
            <label>Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Any additional notes..."
              rows="2"
              disabled={isSubmitting}
            />
          </div>

          {isSubmitting && uploadProgress > 0 && (
            <div className="upload-progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
              <span className="progress-text">
                {uploadProgress < 100 ? `Uploading... ${uploadProgress}%` : "Processing AI embeddings..."}
              </span>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-cancel" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <span className="spinner-small-inline" />
                  Saving...
                </>
              ) : (
                "Save Shop"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
