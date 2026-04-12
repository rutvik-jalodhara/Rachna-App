const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const {
  addShop,
  getShops,
  getShopById,
  deleteShop,
  scanShop,
} = require("../controllers/shopController");

// Add shop (with optional image upload)
router.post("/add", upload.single("image"), addShop);

// Get all shops
router.get("/", getShops);

// Get single shop by ID
router.get("/:id", getShopById);

// Delete shop
router.delete("/:id", deleteShop);

// Scan shop image (AI matching)
router.post("/scan", upload.single("image"), scanShop);

module.exports = router;