import React, { useState } from "react";
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

/**
 * AddShopModal — Enhanced shop creation form with image upload.
 *
 * Props:
 *   - isOpen: boolean
 *   - onClose: () => void
 *   - onSubmit: (shopData, imageFile) => Promise<void>
 *   - initialName: string (pre-detected shop name)
 *   - location: { lat, lng }
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

  // Reset form when initialName changes (new modal open)
  React.useEffect(() => {
    if (isOpen) {
      setFormData((prev) => ({
        ...prev,
        shop_name: initialName || prev.shop_name,
      }));
    }
  }, [isOpen, initialName]);

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

    setIsSubmitting(true);
    setUploadProgress(0);

    try {
      await onSubmit(
        {
          ...formData,
          latitude: location?.lat,
          longitude: location?.lng,
        },
        imageFile,
        (progress) => setUploadProgress(progress)
      );

      // Reset form on success
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-modal add-shop-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header stays visible; form scrolls on small screens */}
        <div className="modal-header modal-header--sticky">
          <h3>
            {formData.shop_name
              ? `Add "${formData.shop_name}"`
              : "Add New Shop"}
          </h3>
          <button className="modal-close-btn" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <form className="modal-scroll modal-scroll--form" onSubmit={handleSubmit}>
          {/* Image Upload Section */}
          <div className="image-upload-section">
            <label className="section-label">Shop Photo</label>
            <ImageUploader
              onImageSelect={handleImageSelect}
              onImageClear={handleImageClear}
              previewUrl={previewUrl}
              disabled={isSubmitting}
            />
          </div>

          {/* Shop Name */}
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

          {/* Category */}
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

          {/* Description */}
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

          {/* Sales Details */}
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

          {/* Notes */}
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

          {/* Upload Progress */}
          {isSubmitting && uploadProgress > 0 && (
            <div className="upload-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <span className="progress-text">
                {uploadProgress < 100
                  ? `Uploading... ${uploadProgress}%`
                  : "Processing AI embeddings..."}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-cancel"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="spinner-small-inline"></span>
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
