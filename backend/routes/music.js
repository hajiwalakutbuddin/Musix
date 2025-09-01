// backend/routes/music.js
const express = require("express");
const router = express.Router();

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const sanitize = require("../utils/sanitize");

// ✅ Import shim for yt-dlp-wrap v2.3.12
let YTDlpWrap = require("yt-dlp-wrap");
if (YTDlpWrap.default) {
  YTDlpWrap = YTDlpWrap.default;
}
const ytdlp = new YTDlpWrap();

const ROOT = path.join(__dirname, "..");
const STORAGE = path.join(ROOT, "storage.json");
const DOWNLOADS = path.join(ROOT, "downloads");

// ---- ffmpeg location (Windows) ----
const FFMPEG_PATH = process.env.FFMPEG_PATH || "C:\\ffmpeg\\bin\\ffmpeg.exe";

// ensure storage + downloads
if (!fs.existsSync(STORAGE))
  fs.writeFileSync(STORAGE, JSON.stringify({ playlists: {} }, null, 2));
if (!fs.existsSync(DOWNLOADS)) fs.mkdirSync(DOWNLOADS, { recursive: true });

function loadDB() {
  return JSON.parse(fs.readFileSync(STORAGE, "utf-8"));
}
function saveDB(db) {
  fs.writeFileSync(STORAGE, JSON.stringify(db, null, 2));
}

// In-memory job progress
const jobs = new Map();
function newJob() {
  const id = Math.random().toString(36).slice(2);
  jobs.set(id, { status: "running", percent: 0, message: "Starting..." });
  return id;
}
function setJob(id, patch) {
  if (jobs.has(id)) Object.assign(jobs.get(id), patch);
}
function doneJob(id) {
  setJob(id, { status: "done", percent: 100, message: "Completed" });
}
function failJob(id, msg) {
  setJob(id, { status: "error", message: msg });
}

// ----------------- Playlists -----------------
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

router.get("/playlists", async (_req, res) => {
  const db = loadDB();
  res.json({ names: Object.keys(db.playlists) });
});

// Only return DOWNLOADED songs
router.get("/playlist/:name", async (req, res) => {
  const name = sanitize(req.params.name);
  const db = loadDB();
  const list = db.playlists[name];
  if (!list) return res.status(404).json({ error: "Playlist not found" });

  const dir = path.join(DOWNLOADS, name);
  let downloaded = [];
  if (fs.existsSync(dir)) {
    const files = (await fsp.readdir(dir)).filter(f => f.toLowerCase().endsWith(".mp3"));
    const fileSet = new Set(files);
    downloaded = list
      .filter(s => s.filename && fileSet.has(s.filename))
      .map(s => ({
        id: s.id,
        title: s.title,
        url: s.url,
        filename: s.filename,
        fileUrl: `/downloads/${encodeURIComponent(name)}/${encodeURIComponent(s.filename)}`
      }));
  }

  res.json({ name, songs: downloaded });
});

// ----------------- Search (YouTube) -----------------
router.get("/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ results: [] });

  try {
    const result = await ytdlp.exec([
      `ytsearch15:${q}`,
      "--dump-single-json",
      "--flat-playlist"
    ]);
    const info = JSON.parse(result.stdout);
    const entries = (info.entries || []).map(e => ({
      id: e.id,
      title: e.title,
      url: e.url || `https://www.youtube.com/watch?v=${e.id}`,
    }));

    res.json({ results: entries });
  } catch (e) {
    res.status(500).json({ error: "Search failed", detail: String(e) });
  }
});

// ----------------- Download helpers -----------------
function safeFileName(base) {
  let s = sanitize(base || "Untitled");
  if (!s.endsWith(".mp3")) s += ".mp3";
  return s;
}
function parseProgressFromLine(line) {
  const m = line.toString().match(/\[download\]\s+(\d+(?:\.\d+)?)%/i);
  return m ? parseFloat(m[1]) : null;
}
async function downloadByIdToPlaylist(videoId, playlistName, jobId) {
  const plKey = sanitize(playlistName);
  const dir = path.join(DOWNLOADS, plKey);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const infoStr = await ytdlp.exec([url, "--dump-single-json"]);
  const info = JSON.parse(infoStr.stdout);
  const title = info.title || videoId;
  const fileName = safeFileName(`${title}.mp3`);
  const outTemplate = path.join(dir, "%(title).150B.%(ext)s");

  const child = ytdlp.spawn([
    url,
    "--extract-audio",
    "--audio-format", "mp3",
    "--embed-thumbnail",
    "--add-metadata",
    "--output", outTemplate,
    "--ffmpeg-location", FFMPEG_PATH
  ]);

  child.stderr.on("data", (chunk) => {
    const p = parseProgressFromLine(chunk.toString());
    if (p !== null) setJob(jobId, { percent: Math.max(1, Math.min(99, p)), message: `Downloading ${title}` });
  });

  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp exited with ${code}`));
    });
  });

  const afterFiles = await fsp.readdir(dir);
  const found = afterFiles.find(f => f.toLowerCase().endsWith(".mp3"));
  const finalFile = found || fileName;

  const db = loadDB();
  if (!db.playlists[plKey]) db.playlists[plKey] = [];
  const existing = db.playlists[plKey].find(s => s.id === videoId);
  const payload = { id: videoId, title, url, filename: finalFile };
  if (existing) Object.assign(existing, payload);
  else db.playlists[plKey].push(payload);
  saveDB(db);
}

// ----------------- Download one song -----------------
router.post("/download/song", async (req, res) => {
  const { playlist, videoId } = req.body;
  if (!playlist || !videoId) return res.status(400).json({ error: "playlist and videoId required" });

  const jobId = newJob();
  res.json({ jobId });

  try {
    await downloadByIdToPlaylist(videoId, playlist, jobId);
    doneJob(jobId);
  } catch (e) {
    failJob(jobId, String(e));
  }
});

// ----------------- Import playlist preview -----------------
router.post("/import/preview", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url required" });

  try {
    const result = await ytdlp.exec([url, "--dump-single-json", "--flat-playlist"]);
    const info = JSON.parse(result.stdout);
    const entries = (info.entries || []).map(e => ({
      id: e.id,
      title: e.title || e.id,
      url: e.url || `https://www.youtube.com/watch?v=${e.id}`,
    }));

    res.json({ results: entries });
  } catch (e) {
    res.status(500).json({ error: "Import preview failed", detail: String(e) });
  }
});

// ----------------- Import playlist download -----------------
router.post("/import/download", async (req, res) => {
  const { name, selectedIds } = req.body;
  if (!name || !Array.isArray(selectedIds) || selectedIds.length === 0) {
    return res.status(400).json({ error: "name and selectedIds[] required" });
  }

  const jobId = newJob();
  res.json({ jobId });

  try {
    const db = loadDB();
    const key = sanitize(name);
    if (!db.playlists[key]) db.playlists[key] = [];
    saveDB(db);

    const total = selectedIds.length;
    let idx = 0;
    for (const vid of selectedIds) {
      setJob(jobId, { message: `Downloading ${idx + 1}/${total}` });
      await downloadByIdToPlaylist(vid, key, jobId);
      idx++;
      setJob(jobId, { percent: Math.min(99, Math.round((idx / total) * 100)) });
    }

    doneJob(jobId);
  } catch (e) {
    failJob(jobId, String(e));
  }
});

// ----------------- Progress polling -----------------
router.get("/progress/:id", (req, res) => {
  const id = req.params.id;
  if (!jobs.has(id)) return res.status(404).json({ error: "job not found" });
  res.json(jobs.get(id));
});

// ----------------- Downloads listing -----------------
router.get("/downloads", async (_req, res) => {
  const out = {};
  if (!fs.existsSync(DOWNLOADS)) return res.json({ downloads: out, base: "/downloads" });

  const folders = (await fsp.readdir(DOWNLOADS, { withFileTypes: true }))
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const pl of folders) {
    const files = (await fsp.readdir(path.join(DOWNLOADS, pl)))
      .filter(n => n.toLowerCase().endsWith(".mp3"));
    out[pl] = files.map(f => ({
      filename: f,
      fileUrl: `/downloads/${encodeURIComponent(pl)}/${encodeURIComponent(f)}`
    }));
  }
  res.json({ downloads: out, base: "/downloads" });
});

module.exports = router;
