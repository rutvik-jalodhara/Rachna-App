const tf = require("@tensorflow/tfjs");
const mobilenet = require("@tensorflow-models/mobilenet");
const { generateScaleVariants, prepareQueryImage } = require("./imageService");

// ───────────────────────────────────────────────
// Model Singleton + Warm Cache
// ───────────────────────────────────────────────

let model = null;
let modelLoading = null;

/**
 * Lazy-load and cache MobileNet model.
 * Uses a loading lock to prevent duplicate loads.
 */
async function getModel() {
  if (model) return model;
  if (modelLoading) return modelLoading;

  console.log("[AI] Loading MobileNet v2 model...");
  const startTime = Date.now();

  modelLoading = mobilenet.load({
    version: 2,
    alpha: 1.0, // Full-size model for best accuracy
  });

  model = await modelLoading;
  modelLoading = null;

  console.log(`[AI] MobileNet v2 loaded in ${Date.now() - startTime}ms`);
  return model;
}

/**
 * Warm up the model at server startup.
 * This prevents cold-start latency on first request.
 */
async function warmUpModel() {
  try {
    const m = await getModel();
    // Run a dummy inference to warm up the GPU/CPU pipeline
    const dummyTensor = tf.zeros([1, 224, 224, 3]);
    const dummyResult = m.infer(dummyTensor, true);
    dummyResult.dispose();
    dummyTensor.dispose();
    console.log("[AI] Model warm-up complete. Ready for inference.");
  } catch (err) {
    console.error("[AI] Model warm-up failed:", err.message);
  }
}

// ───────────────────────────────────────────────
// Embedding Generation
// ───────────────────────────────────────────────

/**
 * Convert a 224x224 JPEG buffer into a 3D tensor [224, 224, 3].
 * Manual decoding since we don't have tf-node's decodeImage.
 * @param {Buffer} buffer - JPEG image buffer
 * @returns {tf.Tensor3D}
 */
function bufferToTensor(buffer) {
  // Decode JPEG manually using tf.node if available, otherwise use raw pixel approach
  // Since we're using pure tfjs, we need to decode the JPEG ourselves.
  // We'll use sharp to get raw pixel data.
  return null; // Placeholder — actual implementation below uses sharp
}

/**
 * Convert image buffer to raw RGB pixel tensor using Sharp.
 * @param {Buffer} buffer - Image buffer (any format Sharp supports)
 * @returns {Promise<tf.Tensor3D>} [224, 224, 3] float32 tensor normalized to [-1, 1]
 */
async function imageBufferToTensor(buffer) {
  const sharp = require("sharp");

  // Get raw RGB pixels from the image
  const { data, info } = await sharp(buffer)
    .resize(224, 224, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Create tensor from raw pixel data: [height, width, channels]
  const tensor = tf.tensor3d(
    new Uint8Array(data),
    [info.height, info.width, info.channels]
  );

  // Normalize to [0, 1] range (MobileNet handles further normalization internally)
  const normalized = tensor.toFloat().div(tf.scalar(255));
  tensor.dispose();

  return normalized;
}

/**
 * Generate a single embedding vector from an image buffer.
 * @param {Buffer} imageBuffer - Preprocessed 224x224 JPEG buffer
 * @returns {Promise<number[]>} - 1280-dim embedding vector (MobileNet v2)
 */
async function getEmbedding(imageBuffer) {
  const m = await getModel();
  const tensor = await imageBufferToTensor(imageBuffer);

  // Expand dims to batch: [1, 224, 224, 3]
  const batched = tensor.expandDims(0);

  // infer(tensor, embedding=true) returns the internal embedding layer
  const embeddingTensor = m.infer(batched, true);
  const embeddingData = await embeddingTensor.data();

  // Cleanup tensors to prevent memory leak
  tensor.dispose();
  batched.dispose();
  embeddingTensor.dispose();

  // Convert to regular array and L2-normalize for cosine similarity
  const embedding = Array.from(embeddingData);
  return l2Normalize(embedding);
}

/**
 * Generate multi-scale embeddings from a single image.
 * Creates 4 variants (original, center-crop, zoom-in, zoom-out)
 * and generates an embedding for each.
 * @param {Buffer} rawBuffer - Original uploaded image buffer
 * @returns {Promise<number[][]>} - Array of 4 embedding vectors
 */
async function getMultiScaleEmbeddings(rawBuffer) {
  const variants = await generateScaleVariants(rawBuffer);
  const embeddings = [];

  for (const variantBuffer of variants) {
    const emb = await getEmbedding(variantBuffer);
    embeddings.push(emb);
  }

  console.log(
    `[AI] Generated ${embeddings.length} multi-scale embeddings ` +
    `(dim=${embeddings[0].length} each)`
  );

  return embeddings;
}

// ───────────────────────────────────────────────
// Similarity Search
// ───────────────────────────────────────────────

/**
 * L2-normalize a vector (unit length for cosine similarity).
 * @param {number[]} vec
 * @returns {number[]}
 */
function l2Normalize(vec) {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

/**
 * Cosine similarity between two L2-normalized vectors.
 * Since vectors are normalized, dot product = cosine similarity.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} - Similarity score [0, 1]
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  // Clamp to [0, 1] range (can be slightly negative due to floating point)
  return Math.max(0, Math.min(1, dot));
}

/**
 * Find the best matching shops for a query image.
 * 
 * Multi-scale matching:
 * - The query embedding is compared against ALL stored embeddings per shop
 * - The maximum similarity across all variants is used as the shop's score
 * 
 * Dynamic confidence:
 * - If top score >> second best → strong match
 * - If scores are close → return multiple candidates
 * 
 * @param {number[]} queryEmbedding - L2-normalized query embedding
 * @param {Array<{_id, shop_name, embeddings: number[][]}>} shops - Shops with embeddings
 * @returns {{matches: Array<{shop_id, shop_name, score, confidence}>, bestMatch: object|null}}
 */
function findBestMatches(queryEmbedding, shops) {
  if (!shops || shops.length === 0) {
    return { matches: [], bestMatch: null };
  }

  // Calculate similarity scores for each shop
  const scored = [];

  for (const shop of shops) {
    if (!shop.embeddings || shop.embeddings.length === 0) continue;

    // Find MAX similarity across all scale variants for this shop
    let maxSim = 0;
    let bestVariantIdx = 0;

    for (let i = 0; i < shop.embeddings.length; i++) {
      const sim = cosineSimilarity(queryEmbedding, shop.embeddings[i]);
      if (sim > maxSim) {
        maxSim = sim;
        bestVariantIdx = i;
      }
    }

    const variantLabels = ["original", "center-crop", "zoom-in", "zoom-out"];

    scored.push({
      shop_id: shop._id,
      shop_name: shop.shop_name,
      image_url: shop.image_url,
      category: shop.category,
      score: maxSim,
      matchedVariant: variantLabels[bestVariantIdx] || "unknown",
    });
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Take top 5 for analysis
  const top5 = scored.slice(0, 5);

  if (top5.length === 0) {
    return { matches: [], bestMatch: null };
  }

  // ─── Dynamic Confidence System ───
  const topScore = top5[0].score;
  const secondScore = top5.length > 1 ? top5[1].score : 0;
  const gap = topScore - secondScore;

  // Calculate confidence level
  let confidence;
  if (topScore >= 0.85 && gap >= 0.10) {
    confidence = "high"; // Very strong match, clear winner
  } else if (topScore >= 0.70 && gap >= 0.05) {
    confidence = "medium"; // Good match but not as definitive
  } else if (topScore >= 0.55) {
    confidence = "low"; // Possible match, user should verify
  } else {
    confidence = "none"; // No meaningful match
  }

  // Add confidence to each match
  const matches = top5.map((m, idx) => ({
    ...m,
    confidence: idx === 0 ? confidence : "candidate",
    rank: idx + 1,
  }));

  // Determine best match based on confidence
  let bestMatch = null;
  if (confidence === "high" || confidence === "medium") {
    bestMatch = matches[0];
  }

  // Log for debugging
  console.log("[AI] Similarity Results:");
  matches.forEach((m) => {
    console.log(
      `  #${m.rank} ${m.shop_name}: ${(m.score * 100).toFixed(1)}% ` +
      `(variant: ${m.matchedVariant}, confidence: ${m.confidence})`
    );
  });
  console.log(`  Gap (1st-2nd): ${(gap * 100).toFixed(1)}%`);

  return { matches, bestMatch };
}

// ───────────────────────────────────────────────
// Embedding Cache (in-memory for fast scan)
// ───────────────────────────────────────────────

let embeddingCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 1000; // 60 seconds

/**
 * Get all shop embeddings, with caching.
 * @returns {Promise<Array>}
 */
async function getCachedEmbeddings() {
  const Shop = require("../models/Shop");
  const now = Date.now();

  if (embeddingCache && now - cacheTimestamp < CACHE_TTL) {
    return embeddingCache;
  }

  // Fetch only shops with embeddings, select only needed fields
  const shops = await Shop.find(
    { embeddings: { $exists: true, $ne: [] } },
    { shop_name: 1, image_url: 1, category: 1, embeddings: 1 }
  ).select("+embeddings").lean();

  embeddingCache = shops;
  cacheTimestamp = now;

  console.log(`[AI] Embedding cache refreshed: ${shops.length} shops loaded`);
  return shops;
}

/**
 * Invalidate the embedding cache (call after add/delete).
 */
function invalidateCache() {
  embeddingCache = null;
  cacheTimestamp = 0;
}

module.exports = {
  warmUpModel,
  getEmbedding,
  getMultiScaleEmbeddings,
  findBestMatches,
  cosineSimilarity,
  getCachedEmbeddings,
  invalidateCache,
};
