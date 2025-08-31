// backend/server.js
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

// Basic middleware
app.use(cors());
app.use(bodyParser.json());

// Static: downloads and frontend
app.use("/downloads", express.static(path.join(__dirname, "downloads")));
app.use(express.static(path.join(__dirname, "..", "frontend")));

// API routes
const musicRoutes = require("./routes/music");
app.use("/api", musicRoutes);

// SPA entry
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`🎵 Musix server running at http://localhost:${PORT}`);
});
