import React from "react";

/**
 * Bottom action panel — minimal actions for any selected map point or shop.
 */
export default function MapActionSheet({
  isOpen,
  title,
  titleLoading = false,
  locationMatchHint,
  isShopSelection = false,
  distanceLabel,
  etaLabel,
  actionsDisabled = false,
  onClose,
  onAddShop,
  onEditShop,
  onDeleteShop,
  onDirections,
  onStartNavigation,
}) {
  if (!isOpen) return null;

  const disableActions = actionsDisabled || titleLoading;

  return (
    <div className="map-action-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="map-action-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-busy={titleLoading}
        aria-labelledby="map-action-sheet-title"
      >
        <div className="map-action-sheet__handle" aria-hidden />
        <button type="button" className="map-action-sheet__close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="map-action-sheet__scroll">
          {titleLoading ? (
            <div className="map-action-sheet__title-loading" id="map-action-sheet-title">
              <span className="map-action-sheet__title-spinner spinner-small" aria-hidden />
              <div className="map-action-sheet__title-loading-text">
                <span className="map-action-sheet__title-loading-label">Fetching location…</span>
                <span className="map-action-sheet__title-loading-sub">Resolving place name</span>
              </div>
            </div>
          ) : (
            <>
              <h2 id="map-action-sheet-title" className="map-action-sheet__title">
                {title || "Selected location"}
              </h2>
              {locationMatchHint && (
                <p className="map-action-sheet__match-hint" role="status">
                  {locationMatchHint}
                </p>
              )}
            </>
          )}
          {distanceLabel && <p className="map-action-sheet__distance">{distanceLabel}</p>}
          {etaLabel && <p className="map-action-sheet__eta">{etaLabel}</p>}
          <div className="map-action-sheet__actions map-action-sheet__actions--minimal">
            {isShopSelection ? (
              <div className="map-action-sheet__nav-row">
                <button
                  type="button"
                  className="map-action-sheet__btn map-action-sheet__btn--secondary"
                  onClick={onEditShop}
                  disabled={disableActions}
                >
                  Edit details
                </button>
                <button
                  type="button"
                  className="map-action-sheet__btn map-action-sheet__btn--danger"
                  onClick={onDeleteShop}
                  disabled={disableActions}
                >
                  Delete shop
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="map-action-sheet__btn map-action-sheet__btn--secondary"
                onClick={onAddShop}
                disabled={disableActions}
              >
                Add shop here
              </button>
            )}
            <div className="map-action-sheet__nav-row">
              <button
                type="button"
                className="map-action-sheet__btn map-action-sheet__btn--primary"
                onClick={onDirections}
                disabled={disableActions}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z" />
                </svg>
                Get directions
              </button>
              <button
                type="button"
                className="map-action-sheet__btn map-action-sheet__btn--nav"
                onClick={onStartNavigation}
                disabled={disableActions}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
                Start navigation
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
