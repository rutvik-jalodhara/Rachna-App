const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected");
  } catch (error) {
    console.error("MongoDB Connection Failed (Check Network / IP Whitelist):", error.message);
    // Removed process.exit(1) so Express does not crash, preventing ERR_CONNECTION_REFUSED in React
  }
};

module.exports = connectDB;