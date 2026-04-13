import React from "react";

/**
 * Bottom action panel for a selected map point or saved shop (Google Maps–style).
 */
export default function MapActionSheet({
  isOpen,
  title,
  subtitle,
  isShop,
  onClose,
  onViewShop,
  onAddShop,
  onDirections,
  onDelete,
}) {
  if (!isOpen) return null;

  return (
    <div className="map-action-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="map-action-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-action-sheet-title"
      >
        <div className="map-action-sheet__handle" aria-hidden />
        <button type="button" className="map-action-sheet__close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="map-action-sheet__scroll">
          <h2 id="map-action-sheet-title" className="map-action-sheet__title">
            {title || "Selected location"}
          </h2>
          {subtitle && <p className="map-action-sheet__subtitle">{subtitle}</p>}
          <div className="map-action-sheet__actions">
            <button type="button" className="map-action-sheet__btn map-action-sheet__btn--primary" onClick={onDirections}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z" />
              </svg>
              Get Directions
            </button>
            {isShop ? (
              <>
                <button type="button" className="map-action-sheet__btn map-action-sheet__btn--secondary" onClick={onViewShop}>
                  View shop details
                </button>
                {onDelete && (
                  <button type="button" className="map-action-sheet__btn map-action-sheet__btn--danger" onClick={onDelete}>
                    Delete shop
                  </button>
                )}
              </>
            ) : (
              <button type="button" className="map-action-sheet__btn map-action-sheet__btn--secondary" onClick={onAddShop}>
                Add shop here
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
