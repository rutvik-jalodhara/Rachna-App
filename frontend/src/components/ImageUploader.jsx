import React, { useRef, useState, useCallback } from "react";
import { compressImage, fileToDataUrl, formatFileSize } from "../utils/imageUtils";

/**
 * ImageUploader — Camera-first image picker component.
 * 
 * Props:
 *   - onImageSelect(file, previewUrl) — Called when image is selected/captured
 *   - onImageClear() — Called when image is removed
 *   - previewUrl — Current preview URL (controlled)
 *   - disabled — Disable interactions
 */
export default function ImageUploader({
  onImageSelect,
  onImageClear,
  previewUrl = null,
  disabled = false,
}) {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileInfo, setFileInfo] = useState(null);

  const handleFile = useCallback(
    async (file) => {
      if (!file) return;

      setIsProcessing(true);
      try {
        // Show original size
        const originalSize = file.size;

        // Compress on client side
        const compressed = await compressImage(file, 1200, 0.85);
        const preview = await fileToDataUrl(compressed);

        setFileInfo({
          originalSize: formatFileSize(originalSize),
          compressedSize: formatFileSize(compressed.size),
          saved: Math.round((1 - compressed.size / originalSize) * 100),
        });

        onImageSelect(compressed, preview);
      } catch (err) {
        console.error("Image processing error:", err);
        // Fallback: use original
        const preview = await fileToDataUrl(file);
        onImageSelect(file, preview);
      } finally {
        setIsProcessing(false);
      }
    },
    [onImageSelect]
  );

  const handleCapture = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = ""; // Reset for re-capture
  };

  const handleGallery = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleClear = () => {
    setFileInfo(null);
    onImageClear?.();
  };

  if (previewUrl) {
    return (
      <div className="image-uploader">
        <div className="image-preview-container">
          <img src={previewUrl} alt="Shop preview" className="image-preview" />
          {!disabled && (
            <button
              type="button"
              className="image-remove-btn"
              onClick={handleClear}
              title="Remove image"
            >
              ✕
            </button>
          )}
        </div>
        {fileInfo && (
          <div className="image-info">
            <span>{fileInfo.compressedSize}</span>
            {fileInfo.saved > 0 && (
              <span className="image-savings">
                {fileInfo.saved}% smaller
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="image-uploader">
      {isProcessing ? (
        <div className="image-processing">
          <div className="spinner-small"></div>
          <span>Processing image...</span>
        </div>
      ) : (
        <div className="image-picker-buttons">
          <button
            type="button"
            className="picker-btn picker-btn-camera"
            onClick={() => cameraRef.current?.click()}
            disabled={disabled}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" />
              <path d="M9 2 7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
            </svg>
            <span>Camera</span>
          </button>

          <button
            type="button"
            className="picker-btn picker-btn-gallery"
            onClick={() => galleryRef.current?.click()}
            disabled={disabled}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
            </svg>
            <span>Gallery</span>
          </button>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        style={{ display: "none" }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        onChange={handleGallery}
        style={{ display: "none" }}
      />
    </div>
  );
}
