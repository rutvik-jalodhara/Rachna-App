const Shop = require("../models/Shop");
const { uploadImage, deleteFromCloudinary } = require("../services/imageService");
const {
  getMultiScaleEmbeddings,
  getEmbedding,
  findBestMatches,
  getCachedEmbeddings,
  invalidateCache,
} = require("../services/embeddingService");
const { prepareQueryImage } = require("../services/imageService");

// ───────────────────────────────────────────────
// POST /api/shops/add
// Add a new shop with optional image + auto-embedding
// ───────────────────────────────────────────────
exports.addShop = async (req, res) => {
  try {
    const { shop_name, description, sales_details, category, notes, latitude, longitude } = req.body;

    // Validate required field
    if (!shop_name || !shop_name.trim()) {
      return res.status(400).json({ error: "Shop name is required" });
    }

    // Check for duplicates (same name + nearby location)
    if (latitude && longitude) {
      const existing = await Shop.findOne({
        shop_name: { $regex: new RegExp(`^${shop_name.trim()}$`, "i") },
        latitude: {
          $gte: parseFloat(latitude) - 0.001,
          $lte: parseFloat(latitude) + 0.001,
        },
        longitude: {
          $gte: parseFloat(longitude) - 0.001,
          $lte: parseFloat(longitude) + 0.001,
        },
      });
      if (existing) {
        return res.status(409).json({
          error: "A shop with this name already exists at this location",
          existing_shop: existing,
        });
      }
    }

    // Prepare shop data
    const shopData = {
      shop_name: shop_name.trim(),
      description: description || "",
      sales_details: sales_details || "",
      category: category || "General",
      notes: notes || "",
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
    };

    // Handle image upload if provided
    if (req.file) {
      console.log(`[SHOP] Processing image for "${shop_name}" (${(req.file.size / 1024).toFixed(0)} KB)`);

      // 1. Upload to Cloudinary
      const { url, public_id } = await uploadImage(req.file.buffer);
      shopData.image_url = url;
      shopData.image_public_id = public_id;
      console.log(`[SHOP] Image uploaded: ${url}`);

      // 2. Generate multi-scale embeddings
      try {
        const embeddings = await getMultiScaleEmbeddings(req.file.buffer);
        shopData.embeddings = embeddings;
        console.log(`[SHOP] Generated ${embeddings.length} embeddings for "${shop_name}"`);
      } catch (embErr) {
        console.error(`[SHOP] Embedding generation failed (continuing without): ${embErr.message}`);
        // Shop is still saved, just without AI search capability
      }
    }

    // Save to database
    const shop = new Shop(shopData);
    await shop.save();

    // Invalidate embedding cache
    invalidateCache();

    // Return shop without embedding data (too large for response)
    const response = shop.toObject();
    delete response.embeddings;

    console.log(`[SHOP] Created: "${shop_name}" (ID: ${shop._id})`);
    res.status(201).json(response);
  } catch (err) {
    console.error("[SHOP] Add error:", err);
    res.status(500).json({ error: err.message || "Failed to add shop" });
  }
};

// ───────────────────────────────────────────────
// GET /api/shops
// List all shops (without embeddings for performance)
// ───────────────────────────────────────────────
exports.getShops = async (req, res) => {
  try {
    const shops = await Shop.find().sort({ createdAt: -1 }).lean();
    res.json(shops);
  } catch (err) {
    console.error("[SHOP] List error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ───────────────────────────────────────────────
// GET /api/shops/:id
// Get single shop details
// ───────────────────────────────────────────────
exports.getShopById = async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id).lean();
    if (!shop) {
      return res.status(404).json({ error: "Shop not found" });
    }
    res.json(shop);
  } catch (err) {
    console.error("[SHOP] Get error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ───────────────────────────────────────────────
// DELETE /api/shops/:id
// Delete shop + cleanup Cloudinary image
// ───────────────────────────────────────────────
exports.deleteShop = async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ error: "Shop not found" });
    }

    // Cleanup Cloudinary image
    if (shop.image_public_id) {
      await deleteFromCloudinary(shop.image_public_id);
      console.log(`[SHOP] Cloudinary image deleted: ${shop.image_public_id}`);
    }

    await Shop.findByIdAndDelete(req.params.id);

    // Invalidate embedding cache
    invalidateCache();

    console.log(`[SHOP] Deleted: "${shop.shop_name}" (ID: ${shop._id})`);
    res.json({ message: "Shop deleted successfully" });
  } catch (err) {
    console.error("[SHOP] Delete error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ───────────────────────────────────────────────
// POST /api/shops/scan
// Scan image → find matching shop using AI
// ───────────────────────────────────────────────
exports.scanShop = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image provided for scanning" });
    }

    console.log(`[SCAN] Processing scan image (${(req.file.size / 1024).toFixed(0)} KB)`);
    const startTime = Date.now();

    // 1. Prepare query image (normalize, resize to 224x224)
    const preparedBuffer = await prepareQueryImage(req.file.buffer);

    // 2. Generate embedding for the scanned image
    const queryEmbedding = await getEmbedding(preparedBuffer);
    console.log(`[SCAN] Query embedding generated (dim=${queryEmbedding.length})`);

    // 3. Get all stored shop embeddings (cached)
    const shops = await getCachedEmbeddings();

    if (shops.length === 0) {
      return res.json({
        match: false,
        message: "No shops with images found in database",
        matches: [],
        processingTime: Date.now() - startTime,
      });
    }

    // 4. Multi-scale similarity search
    const { matches, bestMatch } = findBestMatches(queryEmbedding, shops);

    const processingTime = Date.now() - startTime;
    console.log(`[SCAN] Completed in ${processingTime}ms`);

    if (bestMatch) {
      // Fetch full shop details for the best match
      const fullShop = await Shop.findById(bestMatch.shop_id).lean();

      res.json({
        match: true,
        confidence: bestMatch.confidence,
        bestMatch: {
          ...(fullShop || {
            _id: bestMatch.shop_id,
            shop_name: bestMatch.shop_name,
            image_url: bestMatch.image_url,
            category: bestMatch.category,
          }),
          score: bestMatch.score,
          matchedVariant: bestMatch.matchedVariant,
          ambiguousTop: Boolean(bestMatch.ambiguousTop),
        },
        topMatches: matches.slice(0, 3).map((m) => ({
          shop_id: m.shop_id,
          shop_name: m.shop_name,
          image_url: m.image_url,
          score: m.score,
          confidence: m.confidence,
          rank: m.rank,
        })),
        processingTime,
      });
    } else {
      // No confident match — return top candidates if any
      const hasLowConfidence = matches.length > 0 && matches[0].score >= 0.45;

      res.json({
        match: false,
        confidence: hasLowConfidence ? "low" : "none",
        message: hasLowConfidence
          ? "No strong match found, but here are possible candidates"
          : "No matching shop found",
        topMatches: hasLowConfidence
          ? matches.slice(0, 3).map((m) => ({
              shop_id: m.shop_id,
              shop_name: m.shop_name,
              image_url: m.image_url,
              score: m.score,
              rank: m.rank,
            }))
          : [],
        processingTime,
      });
    }
  } catch (err) {
    console.error("[SCAN] Error:", err);
    res.status(500).json({ error: err.message || "Scan failed" });
  }
};
