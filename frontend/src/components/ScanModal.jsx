import React, { useRef, useState, useCallback, useMemo } from "react";
import { compressImage, fileToDataUrl } from "../utils/imageUtils";
import { fetchShopById, scanShop } from "../hooks/useApi";
import { useToast } from "./Toast";
import { haversineMeters, formatDistance, formatApproxDriveEta, googleMapsDirectionsUrl } from "../utils/geoDistance";
import ShopDetailModal from "./ShopDetailModal";

function shopLatLng(shop) {
  const lat = shop?.latitude ?? shop?.lat;
  const lng = shop?.longitude ?? shop?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * ScanModal — Full-screen AI scanner experience.
 *
 * Props:
 *   - isOpen: boolean
 *   - onClose: () => void
 *   - onMatchFound: (shop) => void — Navigate to matched shop
 *   - userCoords: { lat, lng } | null — for distance + navigation
 */
export default function ScanModal({ isOpen, onClose, onMatchFound, userCoords = null }) {
  const { showToast } = useToast();
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const [stage, setStage] = useState("idle"); // idle | captured | scanning | result
  const [previewUrl, setPreviewUrl] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [detailShop, setDetailShop] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const reset = useCallback(() => {
    setStage("idle");
    setPreviewUrl(null);
    setScanResult(null);
    setScanError(null);
    setDetailShop(null);
    setDetailOpen(false);
  }, []);

  const handleFile = useCallback(
    async (file) => {
      if (!file) return;

      try {
        // Compress
        const compressed = await compressImage(file, 1200, 0.85);
        const preview = await fileToDataUrl(compressed);

        setPreviewUrl(preview);
        setStage("captured");

        // Auto-scan after brief preview
        setTimeout(() => doScan(compressed), 600);
      } catch (err) {
        console.error("Capture error:", err);
        showToast("Failed to process image", "error");
      }
    },
    [showToast]
  );

  const doScan = async (imageBlob) => {
    setStage("scanning");
    setScanError(null);

    try {
      const result = await scanShop(imageBlob);
      setScanResult(result);
      setStage("result");

      if (result.match) {
        showToast(
          `Match found: ${result.bestMatch.shop_name} (${(result.bestMatch.score * 100).toFixed(1)}%)`,
          "success"
        );
      }
    } catch (err) {
      console.error("Scan error:", err);
      setScanError(err.response?.data?.error || err.message || "Scan failed");
      setStage("result");
      showToast("Scan failed. Please try again.", "error");
    }
  };

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleMatchClick = async (shop) => {
    try {
      const id = shop?._id || shop?.shop_id;
      if (!id) return;
      const full = await fetchShopById(id);
      setDetailShop({
        ...full,
        score: shop?.score ?? full?.score,
      });
      setDetailOpen(true);
    } catch (err) {
      console.error("Open shop detail error:", err);
      showToast("Failed to open shop details", "error");
    }
  };

  const handleClose = () => {
    onClose();
    setTimeout(reset, 300);
  };

  const bestMatchNavLabels = useMemo(() => {
    const shop = scanResult?.bestMatch;
    if (!shop) return { distance: null, eta: null };
    const ll = shopLatLng(shop);
    if (!ll || !userCoords) return { distance: null, eta: null };
    const m = haversineMeters(userCoords.lat, userCoords.lng, ll.lat, ll.lng);
    return {
      distance: formatDistance(m),
      eta: formatApproxDriveEta(m),
    };
  }, [scanResult, userCoords]);

  const openDirectionsForShop = (shop) => {
    const ll = shopLatLng(shop);
    if (!ll) return;
    window.open(googleMapsDirectionsUrl(ll.lat, ll.lng), "_blank", "noopener,noreferrer");
  };

  if (!isOpen) return null;

  return (
    <div className="modal modal--fullscreen scan-modal" role="dialog" aria-modal="true" aria-label="Scan shop">
      {/* Header */}
      <div className="scan-header scan-header--safe">
        <button className="scan-close-btn" onClick={handleClose}>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="white">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
        <h2 className="scan-title">
          {stage === "idle" && "Scan Shop"}
          {stage === "captured" && "Image Captured"}
          {stage === "scanning" && "Analyzing…"}
          {stage === "result" && (scanResult?.match ? "Match Found!" : "Scan Complete")}
        </h2>
        <div style={{ width: 28 }} /> {/* Spacer for centering */}
      </div>

      {/* Content Area — scrollable on small viewports / long results */}
      <div className="modal-content scan-content scan-content--scroll">
        {/* ── IDLE: Show capture buttons ── */}
        {stage === "idle" && (
          <div className="scan-idle">
            <div className="scan-viewfinder">
              <div className="viewfinder-corners">
                <span className="vf-corner vf-tl"></span>
                <span className="vf-corner vf-tr"></span>
                <span className="vf-corner vf-bl"></span>
                <span className="vf-corner vf-br"></span>
              </div>
              <div className="viewfinder-text">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="rgba(255,255,255,0.6)">
                  <path d="M9.4 10.5l4.77-8.26a10.03 10.03 0 00-4.17-.89c-2.32 0-4.45.79-6.14 2.12l4.77 8.27.77-1.24zM21.54 9h-7.92a2.008 2.008 0 00-1.39-.55c-.08 0-.15.01-.23.02l-4.78-8.28C5.08 1.56 3.83 3.87 3.2 5.47L3.06 9h18.48zm-4.14 1H6.6c-.17.33-.33.66-.48 1H18.88c-.15-.34-.31-.67-.48-1zm-7.26 7h4.72c.05-.32.09-.65.09-.99s-.03-.66-.08-.99h-4.73c-.05.33-.08.66-.08.99s.03.67.08.99zM21.8 15h-7.49a3.97 3.97 0 01-3.86 3c-1.79 0-3.3-1.18-3.82-2.8l-4.78 8.27A10.035 10.035 0 0012 25c2.1 0 4.05-.65 5.66-1.76L12.87 15h8.93z" />
                </svg>
                <p>Point camera at a shop</p>
                <p className="viewfinder-hint">or upload from gallery</p>
              </div>
            </div>

            <div className="scan-capture-buttons">
              <button
                className="scan-btn scan-btn-camera"
                onClick={() => cameraRef.current?.click()}
              >
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                  <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" />
                  <path d="M9 2 7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
                </svg>
                Take Photo
              </button>
              <button
                className="scan-btn scan-btn-gallery"
                onClick={() => galleryRef.current?.click()}
              >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                </svg>
                Gallery
              </button>
            </div>
          </div>
        )}

        {/* ── CAPTURED: Show preview ── */}
        {stage === "captured" && previewUrl && (
          <div className="scan-captured">
            <img src={previewUrl} alt="Captured" className="scan-preview-img" />
            <div className="scan-preparing">
              <div className="scan-ray"></div>
            </div>
          </div>
        )}

        {/* ── SCANNING: Animated analysis ── */}
        {stage === "scanning" && (
          <div className="scan-analyzing">
            {previewUrl && (
              <img src={previewUrl} alt="Scanning" className="scan-preview-img scan-img-dimmed" />
            )}
            <div className="scan-animation-overlay">
              <div className="scan-ray-sweep"></div>
              <div className="scan-pulse-ring"></div>
              <div className="scan-status-text">
                <div className="spinner-white"></div>
                <p className="scan-analyzing-title">Analyzing…</p>
                <p className="scan-substatus">Matching against your saved shops</p>
                <div className="scan-analyzing-progress" aria-hidden>
                  <div className="scan-analyzing-progress__indeterminate" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── RESULT ── */}
        {stage === "result" && (
          <div className="scan-result">
            {scanError ? (
              /* Error state */
              <div className="scan-error-card">
                <div className="scan-error-icon">✕</div>
                <h3>Scan Failed</h3>
                <p>{scanError}</p>
                <button className="btn btn-submit" onClick={reset}>
                  Try Again
                </button>
              </div>
            ) : scanResult?.match ? (
              /* Match found */
              <div className="scan-match-card">
                <div
                  className={`match-confidence-badge ${
                    scanResult.confidence === "high"
                      ? "match-confidence-high"
                      : "match-confidence-medium"
                  }`}
                >
                  {scanResult.confidence === "high" ? "🎯 Strong Match" : "🔍 Possible Match"}
                </div>

                {scanResult.bestMatch?.ambiguousTop && (
                  <p className="scan-substatus" style={{ textAlign: "center", margin: "0 0 8px" }}>
                    Several shops scored very similarly — confirm the correct one if needed.
                  </p>
                )}

                {/* Best Match */}
                <div
                  className="match-shop-card"
                  onClick={() => handleMatchClick(scanResult.bestMatch)}
                >
                  {scanResult.bestMatch.image_url ? (
                    <img
                      src={scanResult.bestMatch.image_url}
                      alt={scanResult.bestMatch.shop_name}
                      className="match-shop-img"
                    />
                  ) : (
                    <div className="match-shop-initial">
                      {scanResult.bestMatch.shop_name?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                  )}
                  <div className="match-shop-info">
                    <h3>{scanResult.bestMatch.shop_name}</h3>
                    {scanResult.bestMatch.category && (
                      <span className="category-badge">{scanResult.bestMatch.category}</span>
                    )}
                    <div className="match-score">
                      <div className="score-bar">
                        <div
                          className="score-fill"
                          style={{ width: `${Math.min(100, scanResult.bestMatch.score * 100)}%` }}
                        />
                      </div>
                      <span>{(scanResult.bestMatch.score * 100).toFixed(1)}% match</span>
                    </div>
                    {shopLatLng(scanResult.bestMatch) && bestMatchNavLabels.distance && (
                      <p className="scan-match-distance">
                        {bestMatchNavLabels.distance} from you
                        {bestMatchNavLabels.eta && (
                          <span className="scan-match-eta"> · {bestMatchNavLabels.eta}</span>
                        )}
                      </p>
                    )}
                    {shopLatLng(scanResult.bestMatch) && !bestMatchNavLabels.distance && !userCoords && (
                      <p className="scan-match-distance scan-match-distance--muted">Enable location for distance</p>
                    )}
                    <div
                      className="scan-nav-actions"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <button
                        type="button"
                        className="btn btn-cancel scan-nav-actions__btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDirectionsForShop(scanResult.bestMatch);
                        }}
                      >
                        Directions
                      </button>
                    </div>
                  </div>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="#6c5ce7" className="match-arrow">
                    <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                  </svg>
                </div>

                {/* Other candidates */}
                {scanResult.topMatches && scanResult.topMatches.length > 1 && (
                  <div className="match-candidates">
                    <h4>Other Possibilities</h4>
                    {scanResult.topMatches.slice(1, 3).map((m) => (
                      <div
                        key={m.shop_id}
                        className="candidate-row"
                        onClick={() => handleMatchClick({ _id: m.shop_id, ...m })}
                      >
                        {m.image_url ? (
                          <img src={m.image_url} alt={m.shop_name} className="candidate-img" />
                        ) : (
                          <div className="candidate-initial">
                            {m.shop_name?.charAt(0)?.toUpperCase() || "?"}
                          </div>
                        )}
                        <span className="candidate-name">{m.shop_name}</span>
                        <span className="candidate-score">
                          {(m.score * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="scan-result-actions">
                  <button className="btn btn-cancel" onClick={reset}>
                    Scan Another
                  </button>
                  <button
                    className="btn btn-submit"
                    onClick={() => handleMatchClick(scanResult.bestMatch)}
                  >
                    View Shop
                  </button>
                </div>

              </div>
            ) : (
              /* No match */
              <div className="scan-no-match">
                {/* Show low-confidence candidates if available */}
                {scanResult?.topMatches?.length > 0 ? (
                  <>
                    <div className="no-match-icon">🔍</div>
                    <h3>No Strong Match</h3>
                    <p>Did you mean one of these?</p>
                    <div className="match-candidates">
                      {scanResult.topMatches.map((m) => (
                        <div
                          key={m.shop_id}
                          className="candidate-row"
                          onClick={() => handleMatchClick({ _id: m.shop_id, ...m })}
                        >
                          {m.image_url ? (
                            <img src={m.image_url} alt={m.shop_name} className="candidate-img" />
                          ) : (
                            <div className="candidate-initial">
                              {m.shop_name?.charAt(0)?.toUpperCase() || "?"}
                            </div>
                          )}
                          <span className="candidate-name">{m.shop_name}</span>
                          <span className="candidate-score">
                            {(m.score * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="no-match-icon">📷</div>
                    <h3>No Matching Shop Found</h3>
                    <p>This shop hasn't been registered yet.</p>
                  </>
                )}

                <div className="scan-result-actions">
                  <button className="btn btn-submit" onClick={reset}>
                    Try Again
                  </button>
                </div>

              </div>
            )}
          </div>
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileInput}
        style={{ display: "none" }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileInput}
        style={{ display: "none" }}
      />

      <ShopDetailModal
        shop={detailShop}
        isOpen={detailOpen}
        onClose={() => {
          setDetailOpen(false);
        }}
        showDelete={false}
      />
    </div>
  );
}
