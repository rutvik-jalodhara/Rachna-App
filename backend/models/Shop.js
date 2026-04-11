const mongoose = require("mongoose");

const shopSchema = new mongoose.Schema({
  shop_name: String,
  description: String,
  sales_details: String,
  latitude: Number,
  longitude: Number,
}, { timestamps: true });

module.exports = mongoose.model("Shop", shopSchema);