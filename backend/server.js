const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
const PORT = 5000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // Serve frontend files

// Routes
const musicRoutes = require("./routes/music");
app.use("/api", musicRoutes);

// Root route → serve frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`🎵 Musix server running at http://localhost:${PORT}`);
});
