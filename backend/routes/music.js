const express = require("express");
const router = express.Router();
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const sanitize = require("../utils/sanitize");
const ytdlp = require("yt-dlp-exec").raw; // use raw to access stdout piping if needed
const ytdlpExec = require("yt-dlp-exec"); // for promise-style calls

const ROOT = path.join(__dirname, "..");
const STORAGE = path.join(ROOT, "storage.json");
const DOWNLOADS = path.join(ROOT, "downloads");

// ensure storage and downloads exist
if (!fs.existsSync(STORAGE)) fs.writeFileSync(STORAGE, JSON.stringify({ playlists: {} }, null, 2));
if (!fs.existsSync(DOWNLOADS)) fs.mkdirSync(DOWNLOADS, { recursive: true });

function loadDB() {
  return JSON.parse(fs.readFileSync(STORAGE, "utf-8"));
}
function saveDB(db) {
  fs.writeFileSync(STORAGE, JSON.stringify(db, null, 2));
}

// ----------------- Playlist CRUD -----------------
router.post("/playlist", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Playlist name required" });
  const key = sanitize(name);
  const db = loadDB();
  if (!db.playlists[key]) db.playlists[key] = [];
  saveDB(db);
  const dir = path.join(DOWNLOADS, key);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  res.json({ success: true, name: key });
});

router.get("/playlists", (_req, res) => {
  const db = loadDB();
  res.json({ names: Object.keys(db.playlists) });
});

router.get("/playlist/:name", (req, res) => {
  const name = sanitize(req.params.name);
  const db = loadDB();
  if (!db.playlists[name]) return res.status(404).json({ error: "Playlist not found" });
  res.json({ name, songs: db.playlists[name] });
});

// ----------------- Add single song to playlist -----------------
router.post("/playlist/:name/add", async (req, res) => {
  const name = sanitize(req.params.name);
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL required" });
  const db = loadDB();
  if (!db.playlists[name]) return res.status(404).json({ error: "Playlist not found" });

  try {
    // get video info
    const info = await ytdlpExec(url, { dumpSingleJson: true, noWarnings: true });
    const title = sanitize(info.title || "Untitled");
    const id = info.id || url;
    if (db.playlists[name].some(s => s.id === id || s.url === url)) {
      return res.json({ success: true, message: "Already in playlist" });
    }
    db.playlists[name].push({ id, title, url });
    saveDB(db);
    res.json({ success: true, song: { id, title, url } });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch video info", detail: String(e) });
  }
});

// ----------------- Import YouTube playlist into Musix playlist -----------------
router.post("/playlist/import", async (req, res) => {
  const { url, name } = req.body;
  if (!url || !name) return res.status(400).json({ error: "URL and name required" });

  const key = sanitize(name);
  const db = loadDB();
  if (!db.playlists[key]) db.playlists[key] = [];

  try {
    // fetch playlist entries (flat) — quicker and avoids full detail fetch
    const info = await ytdlpExec(url, { dumpSingleJson: true, flatPlaylist: true, noWarnings: true });
    const entries = info.entries || [];
    for (const e of entries) {
      const videoId = e.id;
      const videoUrl = e.url || `https://www.youtube.com/watch?v=${videoId}`;
      const title = sanitize(e.title || videoId || "Untitled");
      // dedupe
      if (!db.playlists[key].some(s => s.id === videoId)) {
        db.playlists[key].push({ id: videoId, title, url: videoUrl });
      }
    }
    saveDB(db);
    const dir = path.join(DOWNLOADS, key);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    res.json({ success: true, added: entries.length, playlist: key });
  } catch (e) {
    res.status(500).json({ error: "Failed to import playlist", detail: String(e) });
  }
});

// ----------------- Stream a track (online listening) -----------------
router.get("/stream", (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send("URL required");
  try {
    // stream best audio — pipe stdout to response
    const proc = ytdlp(url, ["-f", "bestaudio", "-o", "-"], { stdio: ["ignore", "pipe", "ignore"] });
    res.setHeader("Content-Type", "audio/mpeg");
    proc.stdout.pipe(res);
    proc.on("close", () => {
      // no-op
    });
  } catch (e) {
    res.status(500).send("Stream failed");
  }
});

// helper to download a single song into folder
async function downloadSongToFolder(songUrl, outDir) {
  const template = path.join(outDir, "%(title).120B.%(ext)s");
  // ytdlp-exec promise-style
  await ytdlpExec(songUrl, {
    extractAudio: true,
    audioFormat: "mp3",
    output: template,
    embedThumbnail: true,
    addMetadata: true
  });
}

// ----------------- Download single song from a playlist -----------------
router.post("/download/song/:playlist/:index", async (req, res) => {
  const playlistName = sanitize(req.params.playlist);
  const idx = Number(req.params.index);
  const db = loadDB();
  const list = db.playlists[playlistName];
  if (!list) return res.status(404).json({ error: "Playlist not found" });
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) return res.status(404).json({ error: "Song index invalid" });

  const song = list[idx];
  const outDir = path.join(DOWNLOADS, playlistName);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  try {
    await downloadSongToFolder(song.url, outDir);
    res.json({ success: true, savedTo: `downloads/${playlistName}/` });
  } catch (e) {
    res.status(500).json({ error: "Download failed", detail: String(e) });
  }
});

// ----------------- Download entire playlist -----------------
router.post("/playlist/:name/download", async (req, res) => {
  const name = sanitize(req.params.name);
  const db = loadDB();
  const list = db.playlists[name];
  if (!list) return res.status(404).json({ error: "Playlist not found" });
  if (!list.length) return res.status(400).json({ error: "Playlist is empty" });

  const outDir = path.join(DOWNLOADS, name);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  try {
    // sequential downloads to reduce load
    for (const song of list) {
      await downloadSongToFolder(song.url, outDir);
    }
    res.json({ success: true, savedTo: `downloads/${name}/` });
  } catch (e) {
    res.status(500).json({ error: "Download failed", detail: String(e) });
  }
});

// ----------------- List server downloads -----------------
router.get("/downloads", async (_req, res) => {
  try {
    const folders = (await fsp.readdir(DOWNLOADS, { withFileTypes: true }))
      .filter(d => d.isDirectory())
      .map(d => d.name);
    const data = {};
    for (const f of folders) {
      const files = (await fsp.readdir(path.join(DOWNLOADS, f)))
        .filter(n => n.toLowerCase().endsWith(".mp3"));
      data[f] = files;
    }
    res.json({ downloads: data, base: "/downloads" });
  } catch (e) {
    res.status(500).json({ error: "Failed to read downloads" });
  }
});

module.exports = router;
