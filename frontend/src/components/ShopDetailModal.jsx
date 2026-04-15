import React from "react";

/**
 * ShopDetailModal — Rich shop details view.
 *
 * Props:
 *   - shop: shop object (or null)
 *   - isOpen: boolean
 *   - onClose: () => void
 *   - onDelete: (id) => void
 */
export default function ShopDetailModal({ shop, isOpen, onClose, onDelete, showDelete = true }) {
  if (!isOpen || !shop) return null;

  const initial = shop.shop_name?.charAt(0)?.toUpperCase() || "?";

  const handleDelete = () => {
    if (window.confirm(`Delete "${shop.shop_name}"? This cannot be undone.`)) {
      onDelete?.(shop._id);
      onClose();
    }
  };

  return (
    <div className="modal modal--backdrop" onClick={onClose}>
      <div className="modal__sheet glass-modal detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content modal-content--detail">
          {/* Hero Image */}
          <div className="detail-hero">
            {shop.image_url ? (
              <img src={shop.image_url} alt={shop.shop_name} className="detail-hero-img" />
            ) : (
              <div className="detail-hero-initial">
                <span>{initial}</span>
              </div>
            )}
            <button className="modal-close-btn detail-close" onClick={onClose} type="button">
              ✕
            </button>
          </div>

          {/* Shop Info */}
          <div className="detail-body">
            <h2 className="detail-name">{shop.shop_name || "Unknown Shop"}</h2>

            {shop.category && shop.category !== "General" && (
              <span className="category-badge">{shop.category}</span>
            )}

            {shop.description && (
              <div className="detail-section">
                <h4>Description</h4>
                <p>{shop.description}</p>
              </div>
            )}

            {shop.sales_details && (
              <div className="detail-section">
                <h4>Sales Details</h4>
                <p className="detail-sales">{shop.sales_details}</p>
              </div>
            )}

            {shop.notes && (
              <div className="detail-section">
                <h4>Notes</h4>
                <p>{shop.notes}</p>
              </div>
            )}

            {(shop.latitude || shop.longitude) && (
              <div className="detail-section">
                <h4>Location</h4>
                <p className="detail-coords">
                  📍 {shop.latitude?.toFixed(6)}, {shop.longitude?.toFixed(6)}
                </p>
              </div>
            )}

            {shop.score !== undefined && (
              <div className="detail-section">
                <h4>Match Score</h4>
                <div className="match-score detail-match-score">
                  <div className="score-bar">
                    <div
                      className="score-fill"
                      style={{ width: `${Math.round(shop.score * 100)}%` }}
                    />
                  </div>
                  <span>{Math.round(shop.score * 100)}% confidence</span>
                </div>
              </div>
            )}

            {shop.createdAt && (
              <p className="detail-date">
                Added {new Date(shop.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            )}

            {/* Actions */}
            {showDelete && (
              <div className="detail-actions">
                <button className="btn btn-delete" onClick={handleDelete}>
                  Delete Shop
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
