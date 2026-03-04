// backend/routes/transfer.js
// QR-based sharing: reads from profiles/<profileId>/playlists/
// Drop-in replacement for the old standalone server.js (App 2)

const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { parseFile } = require("music-metadata");
const crypto = require("crypto");
const QRCode = require("qrcode");

const ROOT = path.join(__dirname, "..", "..");
const PROFILES_DIR = path.join(ROOT, "profiles");
const storedPlaylists = new Map();

// ── Helpers ──────────────────────────────────────────────────────────────────

const os = require("os");

function getLanIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === "IPv4" && !net.internal) {
                return net.address;
            }
        }
    }
    return "127.0.0.1";
}

function getBaseUrl(req) {
    const port = process.env.PORT || 5000;
    return `http://${getLanIP()}:${port}`;
}

async function extractMetadata(filePath, fileUrl, coverBaseUrl) {
    try {
        const metadata = await parseFile(filePath);
        const common = metadata.common || {};
        const format = metadata.format || {};
        let coverUrl = null;

        if (common.picture && common.picture.length > 0) {
            const picture = common.picture[0];
            const hash = crypto.createHash("md5").update(filePath).digest("hex");
            const ext = picture.format === "image/png" ? "png" : "jpg";
            const coverFilename = `${hash}.${ext}`;
            const coversDir = path.join(PROFILES_DIR, "covers");
            if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });
            const coverPath = path.join(coversDir, coverFilename);
            if (!fs.existsSync(coverPath)) fs.writeFileSync(coverPath, picture.data);
            coverUrl = `${coverBaseUrl}/${coverFilename}`;
        }

        return {
            url: fileUrl,
            title: common.title || "",
            artist: common.artist || "",
            album: common.album || "",
            duration: format.duration ? Math.round(format.duration) : 0,
            coverUrl,
        };
    } catch {
        return { url: fileUrl, title: "", artist: "", album: "", duration: 0, coverUrl: null };
    }
}

// ── GET /api/transfer/tracks?profileId=xxx ────────────────────────────────────
// Returns all playlists + songs with metadata + HTTP URLs for the profile
router.get("/tracks", async (req, res) => {
    try {
        const { profileId } = req.query;
        if (!profileId) return res.status(400).json({ error: "profileId required" });

        const playlistsDir = path.join(PROFILES_DIR, profileId, "playlists");
        if (!fs.existsSync(playlistsDir)) return res.json({ profileId, playlists: {} });

        const baseUrl = getBaseUrl(req);
        const coverBaseUrl = `${baseUrl}/downloads/covers`;
        const playlists = {};

        const folders = fs.readdirSync(playlistsDir);
        for (const folder of folders) {
            const folderPath = path.join(playlistsDir, folder);
            if (!fs.statSync(folderPath).isDirectory()) continue;

            const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".mp3"));
            const songs = [];

            for (const file of files) {
                const filePath = path.join(folderPath, file);
                const fileUrl = `${baseUrl}/downloads/${encodeURIComponent(profileId)}/playlists/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`;
                const meta = await extractMetadata(filePath, fileUrl, coverBaseUrl);
                songs.push({ name: file, ...meta });
            }

            playlists[folder] = songs;
        }

        res.json({ profileId, playlists });
    } catch (err) {
        console.error("Failed /api/transfer/tracks:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ── POST /api/transfer/register-playlist ─────────────────────────────────────
// Stores playlist in-memory, returns a short URL safe for QR encoding
router.post("/register-playlist", (req, res) => {
    try {
        const { name, songs } = req.body;
        if (!name || !Array.isArray(songs) || !songs.length) {
            return res.status(400).json({ error: "Invalid name or songs" });
        }
        const id = crypto.randomBytes(4).toString("hex"); // e.g. "a3f2c1d0"
        storedPlaylists.set(id, { name, songs, createdAt: Date.now() });

        const baseUrl = getBaseUrl(req);
        const playlistUrl = `${baseUrl}/api/transfer/playlist?id=${id}`;
        console.log("[transfer] Registered playlist:", id, playlistUrl);
        res.json({ url: playlistUrl, id });
    } catch (err) {
        console.error("Failed to register playlist:", err);
        res.status(500).json({ error: "Registration failed" });
    }
});

// ── GET /api/transfer/playlist?id=xxx ────────────────────────────────────────
// Serves the registered playlist JSON — this is what the Android app fetches after scanning
router.get("/playlist", (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "Missing id" });
        const playlist = storedPlaylists.get(id);
        if (!playlist) return res.status(404).json({ error: "Playlist not found or expired" });
        res.json(playlist);
    } catch (err) {
        console.error("Failed /api/transfer/playlist:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ── GET /api/transfer/qr?data=... ────────────────────────────────────────────
// Generates a QR PNG image from the given data string
router.get("/qr", async (req, res) => {
    try {
        let { data } = req.query;
        if (!data) return res.status(400).send("Missing data param");

        try { data = decodeURIComponent(data); } catch (_) { /* already clean */ }

        if (data.length > 10000) {
            return res.status(413).send("QR data too large");
        }

        const qrDataUrl = await QRCode.toDataURL(data, { errorCorrectionLevel: "M" });
        const base64 = qrDataUrl.split(",")[1];
        const img = Buffer.from(base64, "base64");

        res.writeHead(200, {
            "Content-Type": "image/png",
            "Content-Length": img.length,
            "Cache-Control": "no-cache, no-store, must-revalidate",
        });
        res.end(img);
    } catch (err) {
        console.error("QR generation failed:", err?.message || err);
        res.status(500).send("QR generation failed");
    }
});

module.exports = router;