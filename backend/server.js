// backend/server.js
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());

// serve static frontend
app.use("/", express.static(path.join(__dirname, "..", "frontend")));

// serve profiles folder as downloads
const PROFILES_DIR = path.join(__dirname, "..", "profiles");
if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });
app.use("/downloads", express.static(PROFILES_DIR));

// routes
const musicRoutes = require("./routes/music");
app.use("/api/music", musicRoutes);

// profiles management
const sanitize = require("./utils/sanitize");
const { strongSanitize } = require("./utils/strongSanitize");

app.get("/api/profiles", async (req, res) => {
  try {
    const dirs = await fs.promises.readdir(PROFILES_DIR, { withFileTypes: true });
    const profiles = dirs.filter(d => d.isDirectory()).map(d => ({ id: d.name, displayName: d.name }));
    res.json(profiles);
  } catch (err) {
    res.status(500).json({ error: "Failed to list profiles", detail: String(err) });
  }
});

app.post("/api/profiles", async (req, res) => {
  let { id, displayName } = req.body;
  if (!displayName) return res.status(400).json({ error: "displayName required" });
  id = id || displayName.toLowerCase().replace(/\s+/g, "_");

  id = strongSanitize(id);
  displayName = sanitize(displayName);

  const dir = path.join(PROFILES_DIR, id);
  try {
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(path.join(dir, "playlists"), { recursive: true });
      await fs.promises.mkdir(path.join(dir, "downloads"), { recursive: true });
    }
    res.json({ id, displayName });
  } catch (err) {
    res.status(500).json({ error: "Failed to create profile", detail: String(err) });
  }
});

// start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Musix server running on http://localhost:" + PORT));
