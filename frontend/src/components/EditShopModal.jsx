import React, { useEffect, useState } from "react";

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

export default function EditShopModal({ isOpen, shop, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    shop_name: "",
    description: "",
    sales_details: "",
    category: "General",
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !shop) return;
    setFormData({
      shop_name: shop.shop_name || "",
      description: shop.description || "",
      sales_details: shop.sales_details || "",
      category: shop.category || "General",
      notes: shop.notes || "",
    });
  }, [isOpen, shop]);

  if (!isOpen || !shop) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.shop_name.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit?.({
        ...formData,
        shop_name: formData.shop_name.trim(),
        latitude: shop.latitude,
        longitude: shop.longitude,
      });
      onClose?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal modal--backdrop" onClick={onClose}>
      <div className="modal__sheet glass-modal add-shop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header modal-header--sticky">
          <h3>Edit Shop Details</h3>
          <button className="modal-close-btn" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <form className="modal-content modal-content--form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Shop Name *</label>
            <input
              type="text"
              name="shop_name"
              value={formData.shop_name}
              onChange={handleChange}
              required
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
              disabled={isSubmitting}
            />
          </div>

          <div className="input-group">
            <label>Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="2"
              disabled={isSubmitting}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-cancel" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

