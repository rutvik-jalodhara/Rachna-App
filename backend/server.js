const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const { warmUpModel } = require("./services/embeddingService");

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Routes
app.use("/api/shops", require("./routes/shopRoutes"));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Global error handler for multer and other errors
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large. Maximum size is 10MB." });
  }
  if (err.message && err.message.includes("Invalid file type")) {
    return res.status(415).json({ error: err.message });
  }

  res.status(500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT ? process.env.PORT : 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);

  // Warm up TensorFlow model in background (non-blocking)
  warmUpModel().catch((err) => {
    console.error("[STARTUP] Model warm-up skipped:", err.message);
  });
});