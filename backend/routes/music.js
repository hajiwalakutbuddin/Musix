// backend/routes/music.js
const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const { spawn, execFile } = require("child_process");
const util = require("util");
const execFileP = util.promisify(execFile);

const sanitize = require("../utils/sanitize");
const { strongSanitize } = require("../utils/strongSanitize");

const ROOT = path.join(__dirname, "..", "..");
const PROFILES_DIR = path.join(ROOT, "profiles");
if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });

// ---------- yt-dlp ----------
function findYtdlp() {
  const candidates = [
    path.join(ROOT, "yt-dlp.exe"),
    path.join(ROOT, "yt-dlp"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return "yt-dlp"; // assume globally installed
}
const YTDLP_PATH = findYtdlp();

function ensureYtdlp() {
  if (!YTDLP_PATH) throw new Error("yt-dlp not found.");
}

// ---------- helpers ----------
function safeFileName(base) {
  let s = sanitize(base || "Untitled");
  if (!s.endsWith(".mp3")) s += ".mp3";
  return s;
}
function parseProgressFromLine(line) {
  const m = line.toString().match(/\[download\]\s+(\d+(?:\.\d+)?)%/i);
  return m ? parseFloat(m[1]) : null;
}

const FFMPEG_PATH = process.env.FFMPEG_PATH || "C:\\ffmpeg\\bin\\ffmpeg.exe";

async function ensureProfileDirs(profileId) {
  const base = path.join(PROFILES_DIR, profileId);
  await fsp.mkdir(path.join(base, "playlists"), { recursive: true });
  await fsp.mkdir(path.join(base, "downloads"), { recursive: true });
  return base;
}

// ---------- jobs ----------
const jobs = new Map();
function newJob() {
  const id = Math.random().toString(36).slice(2);
  jobs.set(id, { status: "running", percent: 0, message: "Starting...", failed: [] });
  return id;
}
function setJob(id, patch) { if (jobs.has(id)) Object.assign(jobs.get(id), patch); }
function doneJob(id) { setJob(id, { status: "done", percent: 100, message: "Completed" }); }
function failJob(id, msg) { setJob(id, { status: "error", message: msg }); }

async function execYtdlp(args, opts = {}) {
  ensureYtdlp();
  const { stdout, stderr } = await execFileP(
    YTDLP_PATH,
    [...args, "--extractor-args", "youtube:player_client=android"],
    { maxBuffer: 20 * 1024 * 1024, ...opts }
  );
  return (stdout || stderr || "").toString();
}
function spawnYtdlp(args, opts = {}) {
  ensureYtdlp();
  return spawn(
    YTDLP_PATH,
    [...args, "--extractor-args", "youtube:player_client=android"],
    { stdio:["ignore","pipe","pipe"], ...opts }
  );
}

// ---------- routes ----------

// List playlists for profile
router.get("/playlists", async (req, res) => {
  const profileId = strongSanitize(req.query.profileId || "");
  if (!profileId) return res.status(400).json({ error: "profileId required" });
  const base = await ensureProfileDirs(profileId);
  const plDir = path.join(base, "playlists");
  const playlists = (await fsp.readdir(plDir, { withFileTypes: true }))
    .filter(d => d.isDirectory())
    .map(d => d.name);
  res.json({ names: playlists });
});

// Create playlist
router.post("/playlist", async (req, res) => {
  let { profileId, name } = req.body;
  if (!profileId || !name) return res.status(400).json({ error: "profileId and name required" });
  profileId = strongSanitize(profileId);
  name = strongSanitize(name);
  const base = await ensureProfileDirs(profileId);
  const dir = path.join(base, "playlists", name);
  await fsp.mkdir(dir, { recursive: true });
  res.json({ success: true, name });
});

// Get playlist songs
router.get("/playlist/:profileId/:name", async (req, res) => {
  try {
    const profileId = strongSanitize(req.params.profileId);
    const name = strongSanitize(req.params.name);
    const dir = path.join(PROFILES_DIR, profileId, "playlists", name);
    if (!fs.existsSync(dir)) return res.json({ name, songs: [] });
    const files = (await fsp.readdir(dir)).filter(f => f.toLowerCase().endsWith(".mp3"));
    const songs = files.map(f => ({
      id: f.match(/\[([a-zA-Z0-9_-]{6,})\]/)?.[1] || f,
      title: f.replace(/\[[^\]]+\]\.mp3$/, "").trim(),
      filename: f,
      fileUrl: `/downloads/${profileId}/playlists/${encodeURIComponent(name)}/${encodeURIComponent(f)}`
    }));
    res.json({ name, songs });
  } catch (err) {
    res.status(500).json({ error: "Failed to read playlist", detail: String(err) });
  }
});

// Delete playlist
router.delete("/playlist/:profileId/:name", async (req, res) => {
  const profileId = strongSanitize(req.params.profileId);
  const name = strongSanitize(req.params.name);
  const dir = path.join(PROFILES_DIR, profileId, "playlists", name);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: "Playlist not found" });
  await fsp.rm(dir, { recursive: true, force: true });
  res.json({ success: true });
});

// Delete one song
router.delete("/playlist/:profileId/:name/song", async (req, res) => {
  const profileId = strongSanitize(req.params.profileId);
  const name = strongSanitize(req.params.name);
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: "filename required" });
  const file = path.join(PROFILES_DIR, profileId, "playlists", name, filename);
  if (fs.existsSync(file)) await fsp.rm(file, { force: true });
  res.json({ success: true });
});

// Search
router.get("/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ results: [] });
  try {
    const infoStr = await execYtdlp([`ytsearch15:${q}`, "--dump-single-json", "--flat-playlist"]);
    const info = JSON.parse(infoStr.trim());
    const entries = (info.entries || []).map(e => ({ id: e.id, title: e.title, url: e.url || `https://www.youtube.com/watch?v=${e.id}` }));
    res.json({ results: entries });
  } catch (e) { res.status(500).json({ error: "Search failed", detail: String(e) }); }
});

// Download helper
async function downloadByIdToPlaylist(videoId, profileId, playlistName, jobId) {
  const dir = path.join(PROFILES_DIR, profileId, "playlists", playlistName);
  await fsp.mkdir(dir, { recursive: true });
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  let info;
  try {
    const infoStr = await execYtdlp([url, "--dump-single-json"]);
    info = JSON.parse(infoStr.trim());
  } catch (err) { throw new Error("Failed to fetch video metadata: " + String(err)); }
  const title = info.title || videoId;
  const finalFile = safeFileName(`${title} [${videoId}].mp3`);
  const outTemplate = path.join(dir, "%(title).100B [%(id)s].%(ext)s");

  const child = spawnYtdlp([url, "--extract-audio", "--audio-format", "mp3", "--embed-thumbnail", "--add-metadata", "--output", outTemplate, "--ffmpeg-location", FFMPEG_PATH]);
  child.stderr.on("data", (chunk) => {
    const p = parseProgressFromLine(chunk.toString());
    if (p !== null) setJob(jobId, { percent: Math.max(1, Math.min(99, p)), message: `Downloading ${title}` });
  });
  await new Promise((res, rej) => {
    child.on("error", rej);
    child.on("close", code => { code === 0 ? res() : rej(new Error("yt-dlp exited " + code)); });
  });

  let saved = (await fsp.readdir(dir)).find(f => f.includes(videoId));
  if (!saved) throw new Error("Download finished but no MP3 found.");
  if (saved !== finalFile) {
    try { await fsp.rename(path.join(dir, saved), path.join(dir, finalFile)); saved = finalFile; } catch (_) {}
  }
}

// Download single
router.post("/download/song", async (req, res) => {
  const { profileId, playlist, videoId } = req.body;
  if (!profileId || !playlist || !videoId) return res.status(400).json({ error: "profileId, playlist and videoId required" });
  const jobId = newJob();
  res.json({ jobId });
  try { await downloadByIdToPlaylist(videoId, strongSanitize(profileId), strongSanitize(playlist), jobId); doneJob(jobId); }
  catch (e) { failJob(jobId, String(e)); }
});

// Import preview
router.post("/import/preview", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url required" });
  try {
    const infoStr = await execYtdlp([url, "--dump-single-json", "--flat-playlist"]);
    const info = JSON.parse(infoStr.trim());
    const entries = (info.entries || []).map(e => ({ id: e.id, title: e.title || e.id, url: e.url || `https://www.youtube.com/watch?v=${e.id}` }));
    res.json({ results: entries });
  } catch (e) { res.status(500).json({ error: "Import preview failed", detail: String(e) }); }
});

// Import download
router.post("/import/download", async (req, res) => {
  const { profileId, name, selectedIds } = req.body;
  if (!profileId || !name || !Array.isArray(selectedIds) || !selectedIds.length) return res.status(400).json({ error: "profileId, name and selectedIds[] required" });
  const jobId = newJob();
  res.json({ jobId });
  try {
    const total = selectedIds.length; let idx = 0;
    for (const vid of selectedIds) {
      setJob(jobId, { message: `Downloading ${idx + 1}/${total}` });
      try { await downloadByIdToPlaylist(vid, strongSanitize(profileId), strongSanitize(name), jobId); }
      catch (err) { console.error("Import failed:", vid, err); }
      idx++; setJob(jobId, { percent: Math.min(99, Math.round((idx / total) * 100)) });
    }
    doneJob(jobId);
  } catch (e) { failJob(jobId, String(e)); }
});

// Progress
router.get("/progress/:id", (req, res) => {
  const id = req.params.id;
  if (!jobs.has(id)) return res.status(404).json({ error: "job not found" });
  res.json(jobs.get(id));
});

module.exports = router;
