const express = require("express");
const router = express.Router();
const Shop = require("../models/Shop");

// Add shop
router.post("/add", async (req, res) => {
  try {
    const shop = new Shop(req.body);
    await shop.save();
    res.json(shop);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get shops
router.get("/", async (req, res) => {
  const shops = await Shop.find();
  res.json(shops);
});

module.exports = router;