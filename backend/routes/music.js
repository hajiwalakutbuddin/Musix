// backend/routes/music.js
// Minimal, robust wrapper that runs a local yt-dlp binary (yt-dlp.exe) or the one on PATH.
// Uses execFile for quick commands (search / metadata) and spawn for downloads (progress via stderr).

const express = require("express");
const router = express.Router();

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { execFile, spawn } = require("child_process");
const util = require("util");
const execFileP = util.promisify(execFile);

const sanitize = require("../utils/sanitize");

// Project root (one level above backend)
const ROOT = path.join(__dirname, "..");

// ---------- find yt-dlp binary ----------
function findYtdlp() {
  const candidates = [
    path.join(ROOT, "yt-dlp.exe"),
    path.join(ROOT, "yt-dlp"),
    path.join(__dirname, "..", "yt-dlp.exe"),
    path.join(__dirname, "..", "yt-dlp"),
  ];

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch (e) {}
  }

  // Try PATH: 'where' on Windows, 'which' on Unix
  try {
    if (process.platform === "win32") {
      const out = require("child_process")
        .execSync("where yt-dlp", { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
      if (out) return out.split(/\r?\n/)[0];
    } else {
      const out = require("child_process")
        .execSync("which yt-dlp", { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
      if (out) return out.split(/\r?\n/)[0];
    }
  } catch (e) {
    // not found on PATH
  }

  return null;
}

const YTDLP_PATH = findYtdlp();
if (YTDLP_PATH) {
  console.log("Using yt-dlp binary at:", YTDLP_PATH);
} else {
  console.warn("yt-dlp binary not found by music route (will error when running search/download).");
}

function ensureYtdlp() {
  if (!YTDLP_PATH) {
    throw new Error(
      `yt-dlp binary not found. Place 'yt-dlp' (unix) or 'yt-dlp.exe' (Windows) in the project root or install it on PATH.\n` +
      `Download: https://github.com/yt-dlp/yt-dlp/releases`
    );
  }
}

// ---------- storage / folders ----------
const STORAGE = path.join(ROOT, "storage.json");
const DOWNLOADS = path.join(ROOT, "downloads");

if (!fs.existsSync(STORAGE)) fs.writeFileSync(STORAGE, JSON.stringify({ playlists: {} }, null, 2));
if (!fs.existsSync(DOWNLOADS)) fs.mkdirSync(DOWNLOADS, { recursive: true });

function loadDB() {
  return JSON.parse(fs.readFileSync(STORAGE, "utf-8"));
}
function saveDB(db) {
  fs.writeFileSync(STORAGE, JSON.stringify(db, null, 2));
}

// ---------- jobs ----------
const jobs = new Map();
function newJob() {
  const id = Math.random().toString(36).slice(2);
  jobs.set(id, { status: "running", percent: 0, message: "Starting..." });
  return id;
}
function setJob(id, patch) { if (jobs.has(id)) Object.assign(jobs.get(id), patch); }
function doneJob(id) { setJob(id, { status: "done", percent: 100, message: "Completed" }); }
function failJob(id, msg) { setJob(id, { status: "error", message: msg }); }

// ---------- helpers to run yt-dlp ----------
async function execYtdlp(args, opts = {}) {
  ensureYtdlp();
  const execOpts = { maxBuffer: 20 * 1024 * 1024, ...opts };
  // execFile returns { stdout, stderr }
  const { stdout, stderr } = await execFileP(YTDLP_PATH, args, execOpts);
  // prefer stdout but some versions print to stderr
  return (stdout || stderr || "").toString();
}

function spawnYtdlp(args, opts = {}) {
  ensureYtdlp();
  // spawn returns a ChildProcess. Caller must add listeners.
  // Use stdio pipes so we can read stderr for progress.
  return spawn(YTDLP_PATH, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
}

// ---------- small utilities ----------
function safeFileName(base) {
  let s = sanitize(base || "Untitled");
  if (!s.endsWith(".mp3")) s += ".mp3";
  return s;
}
function parseProgressFromLine(line) {
  const m = line.toString().match(/\[download\]\s+(\d+(?:\.\d+)?)%/i);
  return m ? parseFloat(m[1]) : null;
}

const FFMPEG_PATH = process.env.FFMPEG_PATH || (process.platform === "win32" ? "C:\\ffmpeg\\bin\\ffmpeg.exe" : "ffmpeg");

// ================= routes =================

// Create playlist
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

// List playlist names
router.get("/playlists", (_req, res) => {
  const db = loadDB();
  res.json({ names: Object.keys(db.playlists) });
});

// Get songs in a playlist (only those that exist on disk)
router.get("/playlist/:name", async (req, res) => {
  try {
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
  } catch (e) {
    res.status(500).json({ error: "Failed to read playlist", detail: String(e) });
  }
});

// Delete playlist (files + DB entry)
router.delete("/playlist/:name", async (req, res) => {
  const name = sanitize(req.params.name);
  const db = loadDB();
  if (!db.playlists[name]) return res.status(404).json({ error: "Playlist not found" });

  const dir = path.join(DOWNLOADS, name);
  if (fs.existsSync(dir)) {
    const entries = await fsp.readdir(dir);
    for (const e of entries) await fsp.rm(path.join(dir, e), { force: true });
    await fsp.rmdir(dir, { force: true }).catch(() => {});
  }

  delete db.playlists[name];
  saveDB(db);
  res.json({ success: true });
});

// Delete one song from a playlist
router.delete("/playlist/:name/song", async (req, res) => {
  const name = sanitize(req.params.name);
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: "filename required" });

  const db = loadDB();
  const list = db.playlists[name];
  if (!list) return res.status(404).json({ error: "Playlist not found" });

  const file = path.join(DOWNLOADS, name, filename);
  if (fs.existsSync(file)) await fsp.rm(file, { force: true });

  const idx = list.findIndex(s => s.filename === filename);
  if (idx >= 0) list.splice(idx, 1);
  saveDB(db);

  res.json({ success: true });
});

// ----------------- Search -----------------
router.get("/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ results: [] });

  try {
    const infoStr = await execYtdlp([`ytsearch15:${q}`, "--dump-single-json", "--flat-playlist"]);
    const info = typeof infoStr === "string" ? JSON.parse(infoStr.trim()) : infoStr;
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
async function downloadByIdToPlaylist(videoId, playlistName, jobId) {
  const plKey = sanitize(playlistName);
  const dir = path.join(DOWNLOADS, plKey);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // metadata
  let info;
  try {
    const infoStr = await execYtdlp([url, "--dump-single-json"]);
    info = typeof infoStr === "string" ? JSON.parse(infoStr.trim()) : infoStr;
  } catch (err) {
    throw new Error("Failed to fetch video metadata: " + String(err));
  }

  const title = info.title || videoId;
  const fileName = safeFileName(`${title}.mp3`);
  const outTemplate = path.join(dir, "%(title).150B.%(ext)s");

  // spawn for download
  const child = spawnYtdlp([
    url,
    "--extract-audio",
    "--audio-format", "mp3",
    "--embed-thumbnail",
    "--add-metadata",
    "--output", outTemplate,
    "--ffmpeg-location", FFMPEG_PATH
  ]);

  // attach handlers (ensure we catch 'error' so it does not bubble unhandled)
  child.on("error", (err) => {
    // bubble up via promise rejection below
  });

  child.stderr.on("data", (chunk) => {
    const p = parseProgressFromLine(chunk.toString());
    if (p !== null) setJob(jobId, { percent: Math.max(1, Math.min(99, p)), message: `Downloading ${title}` });
  });

  await new Promise((resolve, reject) => {
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp exited with ${code}`));
    });
  });

  // find file
  const afterFiles = await fsp.readdir(dir);
  const found = afterFiles.find(f => f.toLowerCase().endsWith(".mp3"));
  const finalFile = found || fileName;

  // update DB
  const db = loadDB();
  if (!db.playlists[plKey]) db.playlists[plKey] = [];
  const existing = db.playlists[plKey].find(s => s.id === videoId);
  const payload = { id: videoId, title, url, filename: finalFile };
  if (existing) Object.assign(existing, payload);
  else db.playlists[plKey].push(payload);
  saveDB(db);
}

// ----------------- Download single song -----------------
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

// ----------------- Import preview -----------------
router.post("/import/preview", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url required" });

  try {
    const infoStr = await execYtdlp([url, "--dump-single-json", "--flat-playlist"]);
    const info = typeof infoStr === "string" ? JSON.parse(infoStr.trim()) : infoStr;
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

// ----------------- Import download (selected ids) -----------------
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

// ----------------- Progress endpoint -----------------
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
    const files = (await fsp.readdir(path.join(DOWNLOADS, pl))).filter(n => n.toLowerCase().endsWith(".mp3"));
    out[pl] = files.map(f => ({ filename: f, fileUrl: `/downloads/${encodeURIComponent(pl)}/${encodeURIComponent(f)}` }));
  }
  res.json({ downloads: out, base: "/downloads" });
});

module.exports = router;
