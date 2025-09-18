// // backend/server.js
// const path = require("path");
// const express = require("express");
// const bodyParser = require("body-parser");
// const cors = require("cors");
// const fs = require("fs");
// const multer = require("multer");

// const ROOT = path.join(__dirname, "..");
// const PROFILES_DIR = path.join(ROOT, "profiles");

// // ensure profiles dir exists before using it
// if (!fs.existsSync(PROFILES_DIR)) {
//   fs.mkdirSync(PROFILES_DIR, { recursive: true });
// }

// // configure multer after PROFILES_DIR exists
// const upload = multer({ dest: path.join(PROFILES_DIR, "tmp") });

// const app = express();
// const PORT = process.env.PORT || 5000;

// app.use(cors());
// app.use(bodyParser.json());

// // Serve frontend static files
// app.use(express.static(path.join(__dirname, "..", "frontend")));

// // Serve profile files under /downloads -> maps to project/profiles
// app.use("/downloads", express.static(PROFILES_DIR));

// // app.get("/api/profiles", async (req, res) => {
// //   try {
// //     const dirs = await fs.promises.readdir(PROFILES_DIR, { withFileTypes: true });

// //     // filter out internal folders (hidden tmp and accidental 'undefined')
// //     const visibleDirs = dirs.filter(d =>
// //       d.isDirectory() &&
// //       !d.name.startsWith(".") &&
// //       d.name !== "tmp" &&
// //       d.name !== "undefined"
// //     );

// //     const profiles = visibleDirs.map(d => {
// //       const id = d.name;
// //       try {
// //         const metaPath = path.join(PROFILES_DIR, id, "profile.json");
// //         const meta = fs.existsSync(metaPath)
// //           ? JSON.parse(fs.readFileSync(metaPath, "utf-8"))
// //           : { displayName: id };

// //         // if avatar exists, expose URL to client
// //         const avatarPath = path.join(PROFILES_DIR, id, "avatar.png");
// //         const avatarUrl = fs.existsSync(avatarPath) ? `/downloads/${id}/avatar.png` : null;

// //         return { id, displayName: meta.displayName || id, avatarUrl };
// //       } catch (e) {
// //         return { id, displayName: id, avatarUrl: null };
// //       }
// //     });

// //     res.json(profiles);
// //   } catch (err) {
// //     res.status(500).json({ error: "Failed to list profiles", detail: String(err) });
// //   }
// // });
// // Profiles API (filesystem-backed)
// app.get("/api/profiles", async (req, res) => {
//   try {
//     const dirs = await fs.promises.readdir(PROFILES_DIR, { withFileTypes: true });
//     const profiles = [];

//     for (const d of dirs) {
//       if (!d.isDirectory()) continue;

//       const id = d.name;
//       const metaPath = path.join(PROFILES_DIR, id, "profile.json");

//       if (!fs.existsSync(metaPath)) continue; // skip invalid folders

//       try {
//         const meta = JSON.parse(await fs.promises.readFile(metaPath, "utf-8"));
//         profiles.push({
//           id,
//           displayName: meta.displayName || id,
//           avatarUrl: fs.existsSync(path.join(PROFILES_DIR, id, "avatar.png"))
//             ? `/downloads/${id}/avatar.png`
//             : null,
//         });
//       } catch (err) {
//         console.warn(`Skipping corrupt profile ${id}:`, err);
//         continue;
//       }
//     }

//     res.json(profiles);
//   } catch (err) {
//     res.status(500).json({ error: "Failed to list profiles", detail: String(err) });
//   }
// });


// // app.post("/api/profiles", async (req, res) => {
// //   try {
// //     let { id, displayName } = req.body;
// //     if (!displayName) return res.status(400).json({ error: "displayName required" });
// //     id = (id || displayName).toString().toLowerCase().replace(/[^a-z0-9_\-]/g, "_").slice(0, 64);
// //     const profilePath = path.join(PROFILES_DIR, id);
// //     if (!fs.existsSync(profilePath)) {
// //       await fs.promises.mkdir(path.join(profilePath, "playlists"), { recursive: true });
// //       await fs.promises.mkdir(path.join(profilePath, "downloads"), { recursive: true });
// //       const meta = { id, displayName };
// //       await fs.promises.writeFile(path.join(profilePath, "profile.json"), JSON.stringify(meta, null, 2));
// //     } else {
// //       // update displayName
// //       const metaPath = path.join(profilePath, "profile.json");
// //       try {
// //         let meta = fs.existsSync(metaPath)
// //           ? JSON.parse(await fs.promises.readFile(metaPath, "utf-8"))
// //           : { id, displayName };
// //         meta.displayName = displayName;
// //         await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2));
// //       } catch (_) {}
// //     }
// //     res.json({ id, displayName });
// //   } catch (err) {
// //     res.status(500).json({ error: "Failed to create profile", detail: String(err) });
// //   }
// // });
// app.post("/api/profiles", async (req, res) => {
//   try {
//     let { id, displayName } = req.body;
//     if (!displayName) return res.status(400).json({ error: "displayName required" });

//     id = (id || displayName)
//       .toString()
//       .toLowerCase()
//       .replace(/[^a-z0-9_\-]/g, "_")
//       .slice(0, 64);

//     const profilePath = path.join(PROFILES_DIR, id);
//     const metaPath = path.join(profilePath, "profile.json");

//     if (!fs.existsSync(profilePath)) {
//       await fs.promises.mkdir(path.join(profilePath, "playlists"), { recursive: true });
//       await fs.promises.mkdir(path.join(profilePath, "downloads"), { recursive: true });
//     }

//     // Always (re)create meta file
//     const meta = { id, displayName };
//     await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2));

//     res.json({
//       id,
//       displayName,
//       avatarUrl: fs.existsSync(path.join(profilePath, "avatar.png"))
//         ? `/downloads/${id}/avatar.png`
//         : null,
//     });
//   } catch (err) {
//     res.status(500).json({ error: "Failed to create profile", detail: String(err) });
//   }
// });


// // Avatar upload API
// app.post("/api/profiles/:id/avatar", upload.single("avatar"), async (req, res) => {
//   try {
//     const id = req.params.id;
//     const profilePath = path.join(PROFILES_DIR, id);
//     if (!fs.existsSync(profilePath)) return res.status(404).json({ error: "Profile not found" });

//     const avatarPath = path.join(profilePath, "avatar.png");
//     await fs.promises.rename(req.file.path, avatarPath);

//     res.json({ success: true, avatarUrl: `/downloads/${id}/avatar.png` });
//   } catch (err) {
//     res.status(500).json({ error: "Failed to upload avatar", detail: String(err) });
//   }
// });

// // Music API (routes file)
// const musicRoutes = require("./routes/music");
// app.use("/api/music", musicRoutes);

// // SPA entrypoint
// app.get("/", (_req, res) => {
//   res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
// });

// const spotifyRoutes = require("./routes/spotify");
// app.use("/api/spotify", spotifyRoutes);


// // 404
// app.use((req, res) => {
//   res.status(404).json({ error: "Not Found" });
// });

// app.listen(PORT, () => {
//   console.log(`🎵 Musix server running at http://localhost:${PORT}`);
// });


//-----------------------------------------------------------------------------------------
// backend/server.js
// Main server entrypoint for Musix
// - exposes /api/music (existing routes/music.js)
// - exposes /api/spotify (new robust Spotify routes)
// - provides profiles endpoint + avatar upload
// - session middleware required for Spotify login flow

const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const multer = require("multer");
require("dotenv").config();
const session = require("express-session");

const ROOT = path.join(__dirname, "..");
const PROFILES_DIR = path.join(ROOT, "profiles");

// ensure profiles dir exists before using it
if (!fs.existsSync(PROFILES_DIR)) {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

// configure multer (store temp uploads inside profiles/tmp)
const upload = multer({ dest: path.join(PROFILES_DIR, "tmp") });

const app = express();
const PORT = process.env.PORT || 5000;

// Session: required for Spotify login flow (state + tokens)
// Use a proper SESSION_SECRET in production via .env
const SESSION_SECRET = process.env.SESSION_SECRET || "musix_dev_secret_change_me";
// app.use(session({
//   secret: SESSION_SECRET,
//   resave: false,
//   saveUninitialized: false,
//   cookie: { secure: false } // secure:true only for HTTPS production
// }));
// app.use(cors());
app.use(cors({
  origin: "http://localhost:5000",  // or your frontend origin
  credentials: true
}));

// app.use(session({
//   secret: process.env.SESSION_SECRET || "supersecret",
//   resave: false,
//   saveUninitialized: false,
//   cookie: {
//     httpOnly: true,
//     secure: false,       // ✅ must be false on localhost:5000 (no HTTPS)
//     sameSite: "lax",     // ✅ Spotify redirect will work with "lax"
//     maxAge: 1000 * 60 * 60 // 1 hour
//   }
// }));
app.use(session({
  name: "musix.sid",  // give your cookie a unique name
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,   // don’t save empty sessions
  cookie: {
    httpOnly: true,
    secure: false,   // true only if HTTPS
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 // 1 hour
  }
}));

app.use((req, res, next) => {
  console.log("[session middleware] Incoming request:", req.method, req.url);
  console.log("[session middleware] Session ID =", req.sessionID);
  console.log("[session middleware] Session =", req.session);
  next();
});


// // app.use(cors());
// app.use(cors({
//   origin: "http://localhost:5000",  // or your frontend origin
//   credentials: true
// }));

app.use(bodyParser.json());

const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

// Serve profile files under /downloads -> maps to project/profiles
// Example file URL returned by API: /downloads/<profileId>/playlists/<playlist>/<file.mp3>
app.use("/downloads", express.static(PROFILES_DIR));

// Profiles API (filesystem-backed)
app.get("/api/profiles", async (req, res) => {
  try {
    const dirs = await fs.promises.readdir(PROFILES_DIR, { withFileTypes: true });
    const profiles = [];

    for (const d of dirs) {
      if (!d.isDirectory()) continue;

      const id = d.name;
      const metaPath = path.join(PROFILES_DIR, id, "profile.json");

      // skip folders without meta (prevents showing tmp/undefined)
      if (!fs.existsSync(metaPath)) continue;

      try {
        const meta = JSON.parse(await fs.promises.readFile(metaPath, "utf-8"));
        profiles.push({
          id,
          displayName: meta.displayName || id,
          avatarUrl: fs.existsSync(path.join(PROFILES_DIR, id, "avatar.png"))
            ? `/downloads/${id}/avatar.png`
            : null,
        });
      } catch (err) {
        // Skip corrupt profile folders to avoid crashing
        console.warn(`Skipping corrupt profile ${id}:`, err);
        continue;
      }
    }

    res.json(profiles);
  } catch (err) {
    res.status(500).json({ error: "Failed to list profiles", detail: String(err) });
  }
});

app.post("/api/profiles", async (req, res) => {
  try {
    let { id, displayName } = req.body;
    if (!displayName) return res.status(400).json({ error: "displayName required" });

    id = (id || displayName)
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9_\-]/g, "_")
      .slice(0, 64);

    const profilePath = path.join(PROFILES_DIR, id);
    const metaPath = path.join(profilePath, "profile.json");

    if (!fs.existsSync(profilePath)) {
      await fs.promises.mkdir(path.join(profilePath, "playlists"), { recursive: true });
      await fs.promises.mkdir(path.join(profilePath, "downloads"), { recursive: true });
    }

    // Always write (or overwrite) meta file (keeps things consistent)
    const meta = { id, displayName };
    await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2));

    res.json({
      id,
      displayName,
      avatarUrl: fs.existsSync(path.join(profilePath, "avatar.png"))
        ? `/downloads/${id}/avatar.png`
        : null,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to create profile", detail: String(err) });
  }
});

// Avatar upload API
app.post("/api/profiles/:id/avatar", upload.single("avatar"), async (req, res) => {
  try {
    const id = req.params.id;
    const profilePath = path.join(PROFILES_DIR, id);
    if (!fs.existsSync(profilePath)) return res.status(404).json({ error: "Profile not found" });

    // move uploaded file to avatar.png for that profile
    const avatarPath = path.join(profilePath, "avatar.png");
    await fs.promises.rename(req.file.path, avatarPath);

    res.json({ success: true, avatarUrl: `/downloads/${id}/avatar.png` });
  } catch (err) {
    res.status(500).json({ error: "Failed to upload avatar", detail: String(err) });
  }
});

// Music API (existing routes)
const musicRoutes = require("./routes/music");
app.use("/api/music", musicRoutes);

// Spotify routes (new)
const spotifyRoutes = require("./routes/spotify");
app.use("/api/spotify", spotifyRoutes);

// Serve static frontend files (index.html, assets, etc)
app.use(express.static(FRONTEND_DIR));

// SPA fallback: use middleware rather than registering a route string like app.get("*", ...)
// Using app.use with a function avoids parsing a pattern through path-to-regexp
app.use((req, res, next) => {
  try {
    // Only handle navigation GETs that aren't API or downloads
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api/") || req.path.startsWith("/downloads")) return next();
    // Send the SPA index
    return res.sendFile(path.join(FRONTEND_DIR, "index.html"));
  } catch (err) {
    return next(err);
  }
});

// 404 handler (for any leftover API/non-GET requests)
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.listen(PORT, () => {
  console.log(`🎵 Musix server running at http://127.0.0.1:${PORT}`);
});


