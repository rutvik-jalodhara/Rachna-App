import axios from "axios";

// Auto-detect API base: use Render in production, localhost in dev
const API_BASE =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:5000"
    : "https://rachna-app.onrender.com";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000, // 2 min timeout (embedding generation can be slow)
});

/**
 * Get all shops
 */
export async function fetchShops() {
  const { data } = await api.get("/api/shops");
  return Array.isArray(data) ? data : [];
}

/**
 * Get single shop by ID
 */
export async function fetchShopById(id) {
  const { data } = await api.get(`/api/shops/${id}`);
  return data;
}

/**
 * Add a new shop with optional image.
 * @param {Object} shopData - Shop form data
 * @param {File|Blob|null} imageFile - Optional image file
 * @param {function} onProgress - Upload progress callback (0-100)
 * @returns {Promise<Object>} Created shop
 */
export async function addShop(shopData, imageFile = null, onProgress = null) {
  const formData = new FormData();
  
  // Append text fields
  Object.entries(shopData).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      formData.append(key, value);
    }
  });

  // Append image if provided
  if (imageFile) {
    formData.append("image", imageFile, "shop-image.jpg");
  }

  const { data } = await api.post("/api/shops/add", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percent);
      }
    },
  });

  return data;
}

/**
 * Delete a shop by ID.
 */
export async function deleteShop(id) {
  const { data } = await api.delete(`/api/shops/${id}`);
  return data;
}

/**
 * Scan an image to find matching shop.
 * @param {File|Blob} imageFile - Image to scan
 * @param {function} onProgress - Upload progress callback
 * @returns {Promise<Object>} Scan result
 */
export async function scanShop(imageFile, onProgress = null) {
  const formData = new FormData();
  formData.append("image", imageFile, "scan-image.jpg");

  const { data } = await api.post("/api/shops/scan", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percent);
      }
    },
  });

  return data;
}

export default api;
