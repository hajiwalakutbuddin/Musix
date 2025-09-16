// backend/routes/music.js
// Handles search, download, progress and profile-backed playlists.

const express = require("express");
const router = express.Router();

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { execFile, spawn } = require("child_process");
const util = require("util");
const execFileP = util.promisify(execFile);

const sanitize = require("../utils/sanitize");
const { strongSanitize } = require("../utils/strongSanitize");

const ROOT = path.join(__dirname, "..", "..");
const PROFILES_DIR = path.join(ROOT, "profiles");
if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });

// locate yt-dlp
function findYtdlp() {
  const candidates = [
    path.join(ROOT, "yt-dlp.exe"),
    path.join(ROOT, "yt-dlp"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  try {
    if (process.platform === "win32") {
      return require("child_process").execSync("where yt-dlp", { stdio:["ignore","pipe","ignore"] }).toString().trim().split(/\r?\n/)[0];
    } else {
      return require("child_process").execSync("which yt-dlp", { stdio:["ignore","pipe","ignore"] }).toString().trim().split(/\r?\n/)[0];
    }
  } catch (_) {}
  return null;
}
const YTDLP_PATH = findYtdlp();
if (YTDLP_PATH) console.log("Using yt-dlp at:", YTDLP_PATH);
else console.warn("yt-dlp not found. Place yt-dlp(.exe) in project root or install globally.");

function ensureYtdlp() { if (!YTDLP_PATH) throw new Error("yt-dlp not found"); }
function spawnYtdlp(args, opts = {}) {
  ensureYtdlp();
  return spawn(YTDLP_PATH, [...args, "--extractor-args", "youtube:player_client=android"], { stdio:["ignore","pipe","pipe"], ...opts });
}
async function execYtdlp(args, opts = {}) {
  ensureYtdlp();
  const { stdout, stderr } = await execFileP(YTDLP_PATH, [...args, "--extractor-args", "youtube:player_client=android"], { maxBuffer: 20*1024*1024, ...opts });
  return (stdout || stderr || "").toString();
}

const FFMPEG_PATH = process.env.FFMPEG_PATH || "C:\\ffmpeg\\bin\\ffmpeg.exe";

function safeFileName(base) {
  let s = sanitize(base || "Untitled");
  if (!s.endsWith(".mp3")) s += ".mp3";
  return s;
}
function parseProgressFromLine(line) {
  const m = line.toString().match(/\[download\]\s+(\d+(?:\.\d+)?)%/i);
  return m ? parseFloat(m[1]) : null;
}

// jobs
const jobs = new Map();
function newJob() {
  const id = Math.random().toString(36).slice(2);
  jobs.set(id, { status: "running", percent: 0, message: "Starting...", failed: [] });
  return id;
}
function setJob(id, patch) { if (jobs.has(id)) Object.assign(jobs.get(id), patch); }
function doneJob(id) { setJob(id, { status: "done", percent: 100, message: "Completed" }); }
function failJob(id, msg) { setJob(id, { status: "error", message: msg }); }

// ensure profile filesystem layout
async function ensureProfile(profileId) {
  if (!profileId) throw new Error("profileId required");
  const id = strongSanitize(profileId);
  const base = path.join(PROFILES_DIR, id);
  await fsp.mkdir(path.join(base, "playlists"), { recursive: true });
  await fsp.mkdir(path.join(base, "downloads"), { recursive: true });
  const metaPath = path.join(base, "profile.json");
  if (!fs.existsSync(metaPath)) {
    await fsp.writeFile(metaPath, JSON.stringify({ id, displayName: id }, null, 2));
  }
  return id;
}

// List playlists (for a profile)
router.get("/playlists", async (req, res) => {
  try {
    const profileId = req.query.profileId;
    if (!profileId) return res.status(400).json({ error: "profileId required" });
    const id = await ensureProfile(profileId);
    const plDir = path.join(PROFILES_DIR, id, "playlists");
    if (!fs.existsSync(plDir)) return res.json({ names: [] });
    const dirs = await fsp.readdir(plDir, { withFileTypes: true });
    const names = dirs.filter(d => d.isDirectory()).map(d => d.name);
    res.json({ names });
  } catch (err) {
    res.status(500).json({ error: "Failed to list playlists", detail: String(err) });
  }
});

// Create playlist
router.post("/playlist", async (req, res) => {
  try {
    let { profileId, name } = req.body;
    if (!profileId || !name) return res.status(400).json({ error: "profileId and name required" });
    const id = await ensureProfile(profileId);
    name = sanitize(name);
    const dir = path.join(PROFILES_DIR, id, "playlists", name);
    await fsp.mkdir(dir, { recursive: true });
    res.json({ success: true, name });
  } catch (err) { res.status(500).json({ error: "Failed to create playlist", detail: String(err) }); }
});

// Get playlist songs
router.get("/playlist/:profileId/:name", async (req, res) => {
  try {
    const profileId = req.params.profileId;
    const name = req.params.name;
    const id = await ensureProfile(profileId);
    const dir = path.join(PROFILES_DIR, id, "playlists", name);
    if (!fs.existsSync(dir)) return res.json({ name, songs: [] });
    const files = (await fsp.readdir(dir)).filter(f => f.toLowerCase().endsWith(".mp3"));
    const songs = files.map(f => ({
      id: (f.match(/\[([a-zA-Z0-9_-]{6,})\]/)||[])[1] || f,
      title: f.replace(/\s*\[[^\]]+\]\.mp3$/i, "").trim(),
      filename: f,
      fileUrl: `/downloads/${encodeURIComponent(id)}/playlists/${encodeURIComponent(name)}/${encodeURIComponent(f)}`
    }));
    res.json({ name, songs });
  } catch (err) { res.status(500).json({ error: "Failed to read playlist", detail: String(err) }); }
});

// Delete playlist
router.delete("/playlist/:profileId/:name", async (req, res) => {
  try {
    const profileId = req.params.profileId;
    const name = req.params.name;
    const id = await ensureProfile(profileId);
    const dir = path.join(PROFILES_DIR, id, "playlists", name);
    if (!fs.existsSync(dir)) return res.status(404).json({ error: "Playlist not found" });
    await fsp.rm(dir, { recursive: true, force: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to delete playlist", detail: String(err) }); }
});

// Delete one song
router.delete("/playlist/:profileId/:name/song", async (req, res) => {
  try {
    const profileId = req.params.profileId;
    const name = req.params.name;
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: "filename required" });
    const id = await ensureProfile(profileId);
    const filePath = path.join(PROFILES_DIR, id, "playlists", name, filename);
    if (fs.existsSync(filePath)) await fsp.rm(filePath, { force: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to delete song", detail: String(err) }); }
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

// download helper
async function downloadByIdToPlaylist(videoId, profileId, playlistName, jobId) {
  const id = await ensureProfile(profileId);
  const dir = path.join(PROFILES_DIR, id, "playlists", playlistName);
  await fsp.mkdir(dir, { recursive: true });
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  let info;
  try { const infoStr = await execYtdlp([url, "--dump-single-json"]); info = JSON.parse(infoStr.trim()); } catch (err) { throw new Error("Failed to fetch video metadata: " + String(err)); }
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
    child.on("close", code => code === 0 ? res() : rej(new Error("yt-dlp exited " + code)));
  });
  // ensure file exists
  const found = (await fsp.readdir(dir)).find(f => f.includes(videoId));
  if (!found) throw new Error("Download finished but no MP3 found.");
  // rename to finalFile if needed
  if (found !== finalFile) {
    try { await fsp.rename(path.join(dir, found), path.join(dir, finalFile)); } catch (_) {}
  }
}

// Download single
router.post("/download/song", async (req, res) => {
  const { profileId, playlist, videoId } = req.body;
  if (!profileId || !playlist || !videoId) return res.status(400).json({ error: "profileId, playlist and videoId required" });
  const jobId = newJob();
  res.json({ jobId });
  try { await downloadByIdToPlaylist(videoId, profileId, playlist, jobId); doneJob(jobId); }
  catch (e) {
    if (jobs.has(jobId)) {
      jobs.get(jobId).failed.push({
        id: videoId,
        title: videoId
      });
    }
    failJob(jobId, String(e));
  }

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
// Import download
router.post("/import/download", async (req, res) => {
  const { profileId, name, selectedIds, url } = req.body;
  if (!profileId || !name || !Array.isArray(selectedIds) || !selectedIds.length) {
    return res.status(400).json({ error: "profileId, name, url and selectedIds[] required" });
  }
  const jobId = newJob();
  res.json({ jobId });

  try {
    const id = await ensureProfile(profileId);

    // Prefetch metadata so we know the titles (even if download fails)
    let infoMap = {};
    if (url) {
      try {
        const infoStr = await execYtdlp([url, "--dump-single-json", "--flat-playlist"]);
        const info = JSON.parse(infoStr.trim());
        (info.entries || []).forEach(e => {
          infoMap[e.id] = { title: e.title || e.id };
        });
      } catch (e) {
        console.warn("Could not prefetch playlist info for titles:", e);
      }
    }

    const total = selectedIds.length;
    let idx = 0;

    for (const vid of selectedIds) {
      setJob(jobId, { message: `Downloading ${idx + 1}/${total}` });
      try {
        await downloadByIdToPlaylist(vid, profileId, name, jobId);
      } catch (err) {
        console.error("Import failed:", vid, err);
        if (jobs.has(jobId)) {
          jobs.get(jobId).failed.push({
            id: vid,
            title: (infoMap[vid]?.title) || vid
          });
        }
      }
      idx++;
      setJob(jobId, { percent: Math.min(99, Math.round((idx / total) * 100)) });
    }

    doneJob(jobId);
  } catch (e) {
    failJob(jobId, String(e));
  }
});

// Progress
router.get("/progress/:id", (req, res) => {
  const id = req.params.id;
  if (!jobs.has(id)) return res.status(404).json({ error: "job not found" });
  res.json(jobs.get(id));
});

// Downloads listing: returns playlists -> files for the profile
// Downloads listing: returns playlists -> files for the profile
router.get("/downloads", async (req, res) => {
  try {
    const profileId = req.query.profileId;
    const out = {};
    if (!profileId) {
      // return grouped across profiles (keeps older UI compatibility) as profile__playlist keys
      const profiles = (await fsp.readdir(PROFILES_DIR, { withFileTypes: true }))
        .filter(d => d.isDirectory() && !d.name.startsWith(".") && d.name !== "tmp" && d.name !== "undefined")
        .map(d => d.name);

      for (const id of profiles) {
        const plDir = path.join(PROFILES_DIR, id, "playlists");
        if (!fs.existsSync(plDir)) continue;
        const folders = (await fsp.readdir(plDir, { withFileTypes: true }))
          .filter(d => d.isDirectory())
          .map(d => d.name);
        for (const pl of folders) {
          const files = (await fsp.readdir(path.join(plDir, pl))).filter(n => n.toLowerCase().endsWith(".mp3"));
          if (files.length) out[`${id}__${pl}`] = files.map(f => ({ filename: f }));
        }
      }
      return res.json({ downloads: out, base: "/downloads" });
    } else {
      const id = await ensureProfile(profileId);
      const plDir = path.join(PROFILES_DIR, id, "playlists");
      if (!fs.existsSync(plDir)) return res.json({ downloads: {}, base: "/downloads" });
      const folders = (await fsp.readdir(plDir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
      for (const pl of folders) {
        const files = (await fsp.readdir(path.join(plDir, pl))).filter(n => n.toLowerCase().endsWith(".mp3"));
        out[pl] = files.map(f => ({ filename: f, fileUrl: `/downloads/${encodeURIComponent(id)}/playlists/${encodeURIComponent(pl)}/${encodeURIComponent(f)}` }));
      }
      return res.json({ downloads: out, base: "/downloads" });
    }
  } catch (err) { res.status(500).json({ error: "Failed to list downloads", detail: String(err) }); }
});


// Repair (basic file-based)
router.post("/repair/:profileId/:name", async (req, res) => {
  try {
    const profileId = req.params.profileId;
    const name = req.params.name;
    const id = await ensureProfile(profileId);
    const dir = path.join(PROFILES_DIR, id, "playlists", name);
    if (!fs.existsSync(dir)) return res.json({ fixed: 0, added: 0 });
    const files = (await fsp.readdir(dir)).filter(f => f.toLowerCase().endsWith(".mp3"));
    // this implementation is file-based: nothing to fix besides reporting
    res.json({ fixed: 0, added: files.length });
  } catch (err) { res.status(500).json({ error: "Repair failed", detail: String(err) }); }
});

module.exports = router;
