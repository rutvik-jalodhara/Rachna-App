const mongoose = require("mongoose");

const shopSchema = new mongoose.Schema(
  {
    shop_name: {
      type: String,
      required: [true, "Shop name is required"],
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    sales_details: {
      type: String,
      trim: true,
      default: "",
    },
    category: {
      type: String,
      trim: true,
      default: "General",
      enum: [
        "General",
        "Grocery",
        "Electronics",
        "Clothing",
        "Restaurant",
        "Medical",
        "Hardware",
        "Salon",
        "Jewellery",
        "Stationery",
        "Other",
      ],
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    image_url: {
      type: String,
      default: "",
    },
    image_public_id: {
      type: String,
      default: "",
    },
    // Multi-scale embeddings: array of 1024-dim vectors
    // [original, center-crop, zoomed-in, zoomed-out]
    embeddings: {
      type: [[Number]],
      default: [],
      select: false, // Excluded from default queries for performance
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster name-based duplicate detection
shopSchema.index({ shop_name: 1, latitude: 1, longitude: 1 });

module.exports = mongoose.model("Shop", shopSchema);