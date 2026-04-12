const sharp = require("sharp");
const { uploadBuffer, deleteImage } = require("../config/cloudinary");

/**
 * Normalize and compress an image buffer for consistent processing.
 * - Resize to max dimension while maintaining aspect ratio
 * - Normalize brightness/contrast
 * - Convert to JPEG for consistency
 * @param {Buffer} buffer - Raw image buffer
 * @param {number} maxDim - Maximum width/height
 * @param {number} quality - JPEG quality (1-100)
 * @returns {Promise<Buffer>}
 */
async function compressImage(buffer, maxDim = 800, quality = 85) {
  return sharp(buffer)
    .rotate() // Auto-rotate based on EXIF
    .resize(maxDim, maxDim, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .normalize() // Stretch histogram for brightness/contrast normalization
    .sharpen({ sigma: 0.5 }) // Mild sharpening for noisy/blurry images
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

/**
 * Generate multiple scale variants of an image for robust embedding.
 * Returns buffers for: original, center-crop, zoom-in, zoom-out
 * @param {Buffer} buffer - Raw image buffer
 * @returns {Promise<Buffer[]>}
 */
async function generateScaleVariants(buffer) {
  const metadata = await sharp(buffer).metadata();
  const w = metadata.width || 800;
  const h = metadata.height || 800;

  // 1. Original — normalized, resized to 224x224 (MobileNet input)
  const original = await sharp(buffer)
    .rotate()
    .resize(224, 224, { fit: "cover" })
    .normalize()
    .jpeg({ quality: 90 })
    .toBuffer();

  // 2. Center crop — extract central 60% then resize to 224x224
  //    Simulates a zoomed-in perspective
  const cropW = Math.round(w * 0.6);
  const cropH = Math.round(h * 0.6);
  const cropLeft = Math.round((w - cropW) / 2);
  const cropTop = Math.round((h - cropH) / 2);
  const centerCrop = await sharp(buffer)
    .rotate()
    .extract({
      left: Math.max(0, cropLeft),
      top: Math.max(0, cropTop),
      width: Math.min(cropW, w),
      height: Math.min(cropH, h),
    })
    .resize(224, 224, { fit: "cover" })
    .normalize()
    .jpeg({ quality: 90 })
    .toBuffer();

  // 3. Zoomed in more — central 40%
  const zoomW = Math.round(w * 0.4);
  const zoomH = Math.round(h * 0.4);
  const zoomLeft = Math.round((w - zoomW) / 2);
  const zoomTop = Math.round((h - zoomH) / 2);
  const zoomedIn = await sharp(buffer)
    .rotate()
    .extract({
      left: Math.max(0, zoomLeft),
      top: Math.max(0, zoomTop),
      width: Math.min(zoomW, w),
      height: Math.min(zoomH, h),
    })
    .resize(224, 224, { fit: "cover" })
    .normalize()
    .jpeg({ quality: 90 })
    .toBuffer();

  // 4. Zoomed out — add padding (simulates distance)
  const zoomedOut = await sharp(buffer)
    .rotate()
    .resize(160, 160, { fit: "cover" })
    .extend({
      top: 32,
      bottom: 32,
      left: 32,
      right: 32,
      background: { r: 128, g: 128, b: 128 },
    })
    .resize(224, 224, { fit: "cover" })
    .normalize()
    .jpeg({ quality: 90 })
    .toBuffer();

  return [original, centerCrop, zoomedIn, zoomedOut];
}

/**
 * Prepare a single query image for embedding comparison.
 * @param {Buffer} buffer - Raw image buffer from scan
 * @returns {Promise<Buffer>} - 224x224 normalized buffer
 */
async function prepareQueryImage(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(224, 224, { fit: "cover" })
    .normalize()
    .sharpen({ sigma: 0.5 })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Upload image to Cloudinary after compression.
 * @param {Buffer} buffer
 * @returns {Promise<{url: string, public_id: string}>}
 */
async function uploadImage(buffer) {
  const compressed = await compressImage(buffer);
  return uploadBuffer(compressed);
}

module.exports = {
  compressImage,
  generateScaleVariants,
  prepareQueryImage,
  uploadImage,
  deleteFromCloudinary: deleteImage,
};
