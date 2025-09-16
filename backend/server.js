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

require("dotenv").config();
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const multer = require("multer");
const session = require("express-session");

const ROOT = path.join(__dirname, "..");
const PROFILES_DIR = path.join(ROOT, "profiles");

// ensure profiles dir exists before using it
if (!fs.existsSync(PROFILES_DIR)) {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

// configure multer after PROFILES_DIR exists
const upload = multer({ dest: path.join(PROFILES_DIR, "tmp") });

const app = express();
const PORT = process.env.PORT || 5000;

// Simple session middleware (memory store) - fine for local/dev
app.use(session({
  secret: process.env.SESSION_SECRET || "musix-dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // secure:true requires HTTPS
}));
//--------------------------------------------
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret",
  resave: false,
  saveUninitialized: true
}));

//--------------------------------------------
app.use(cors());
app.use(bodyParser.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Serve profile files under /downloads -> maps to project/profiles
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

      if (!fs.existsSync(metaPath)) continue; // skip invalid folders

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

    // Always (re)create meta file
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

    const avatarPath = path.join(profilePath, "avatar.png");
    await fs.promises.rename(req.file.path, avatarPath);

    res.json({ success: true, avatarUrl: `/downloads/${id}/avatar.png` });
  } catch (err) {
    res.status(500).json({ error: "Failed to upload avatar", detail: String(err) });
  }
});

// Music API (routes file)
const musicRoutes = require("./routes/music");
app.use("/api/music", musicRoutes);

// Spotify routes (auth + playlists)
const spotifyRoutes = require("./routes/spotify");
app.use("/api/spotify", spotifyRoutes);

// SPA entrypoint
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.listen(PORT, () => {
  console.log(`🎵 Musix server running at http://localhost:${PORT}`);
});
