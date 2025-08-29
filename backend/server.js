const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const ytdl = require("ytdl-core");
const { spawn } = require("child_process");

const app = express();
const PORT = 5000;

// ---------------- MIDDLEWARE ----------------
app.use(cors());
app.use(bodyParser.json());

// Serve frontend
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Serve downloads folder
app.use("/downloads", express.static(path.join(__dirname, "downloads")));

// ---------------- ROUTES ----------------
// Playlist routes
const musicRoutes = require("./routes/music");
app.use("/api", musicRoutes);

// Root → index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

// ---------------- STREAM ROUTE ----------------
app.get("/api/stream", (req, res) => {
  const url = req.query.url; // YouTube URL

  if (!url) {
    return res.status(400).json({ error: "No URL provided" });
  }

  try {
    res.setHeader("Content-Type", "audio/mpeg");

    // ytdl gets YouTube audio
    const audio = ytdl(url, { quality: "highestaudio" });

    // Path to your ffmpeg.exe
    const ffmpegPath = "C:\\ffmpeg-2025-08-25-git-1b62f9d3ae-full_build\\bin\\ffmpeg.exe";

    // Spawn ffmpeg to convert to mp3
    const ffmpeg = spawn(ffmpegPath, [
      "-i", "pipe:0", // input from stdin
      "-f", "mp3",    // output format
      "pipe:1"        // output to stdout
    ]);

    audio.pipe(ffmpeg.stdin);
    ffmpeg.stdout.pipe(res);

    ffmpeg.stderr.on("data", (d) => console.log("ffmpeg:", d.toString()));
    ffmpeg.on("close", (code) => console.log("ffmpeg exited with code", code));

  } catch (err) {
    console.error("Streaming error:", err);
    res.status(500).send("Stream error");
  }
});

// ---------------- START SERVER ----------------
app.listen(PORT, () => {
  console.log(`🎵 Musix server running at http://localhost:${PORT}`);
});
