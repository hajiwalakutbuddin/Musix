// // backend/routes/spotify.js
// const express = require("express");
// const router = express.Router();
// const fetch = require("node-fetch");
// require("dotenv").config();

// const clientId = process.env.SPOTIFY_CLIENT_ID;
// const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
// const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

// // Step 1: Redirect user to Spotify login
// router.get("/login", (req, res) => {
//   const scope = [
//     "playlist-read-private",
//     "playlist-read-collaborative",
//     "user-read-email",
//     "user-read-private"
//   ].join(" ");

//   const authUrl = new URL("https://accounts.spotify.com/authorize");
//   authUrl.searchParams.set("client_id", clientId);
//   authUrl.searchParams.set("response_type", "code");
//   authUrl.searchParams.set("redirect_uri", redirectUri);
//   authUrl.searchParams.set("scope", scope);

//   res.redirect(authUrl.toString());
// });

// // Step 2: Handle callback
// router.get("/callback", async (req, res) => {
//   const code = req.query.code;
//   if (!code) return res.status(400).send("Missing code");

//   const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
//     method: "POST",
//     headers: {
//       "Authorization": "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
//       "Content-Type": "application/x-www-form-urlencoded"
//     },
//     body: new URLSearchParams({
//       grant_type: "authorization_code",
//       code,
//       redirect_uri: redirectUri
//     })
//   });

//   const data = await tokenRes.json();
//   if (data.error) return res.status(400).json(data);

//   // Save tokens in session or in-memory for now
//   req.session = req.session || {};
//   req.session.spotify = data;

//   // Redirect back to frontend
//   res.redirect("/?spotify=success");
// });

// // Step 3: Fetch user playlists
// router.get("/playlists", async (req, res) => {
//   if (!req.session || !req.session.spotify) return res.status(401).json({ error: "Not logged in" });

//   const token = req.session.spotify.access_token;

//   const response = await fetch("https://api.spotify.com/v1/me/playlists", {
//     headers: { "Authorization": `Bearer ${token}` }
//   });

//   const playlists = await response.json();
//   res.json(playlists);
// });

// module.exports = router;

//-------------------------------------------------------------------------------

// backend/routes/spotify.js
const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
require("dotenv").config();

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

if (!clientId || !clientSecret || !redirectUri) {
  console.warn("Spotify client credentials not configured. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI in .env");
}

// Utility: simple POST form helper
async function postForm(url, form) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form)
  });
  return res.json();
}

// Step 1: Redirect user to Spotify login
// router.get("/login", (req, res) => {
//   const scope = [
//     "playlist-read-private",
//     "playlist-read-collaborative",
//     "user-read-email",
//     "user-read-private"
//   ].join(" ");

//   const authUrl = new URL("https://accounts.spotify.com/authorize");
//   authUrl.searchParams.set("client_id", clientId);
//   authUrl.searchParams.set("response_type", "code");
//   authUrl.searchParams.set("redirect_uri", redirectUri);
//   authUrl.searchParams.set("scope", scope);
//   // optional state parameter
//   const state = Math.random().toString(36).slice(2);
//   req.session.spotifyAuthState = state;
//   authUrl.searchParams.set("state", state);
//   res.redirect(authUrl.toString());
// });
// Step 1: Redirect user to Spotify login
router.get("/login", (req, res) => {
  const scope = [
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-read-email",
    "user-read-private"
  ].join(" ");

  // generate random state
  const state = Math.random().toString(36).substring(2, 15);
  req.session = req.session || {};
  req.session.spotifyState = state;

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("state", state);

  res.redirect(authUrl.toString());
});


// Step 2: Handle callback
// router.get("/callback", async (req, res) => {
//   const code = req.query.code;
//   const state = req.query.state;
//   if (!code) return res.status(400).send("Missing code");

//   if (!state || state !== req.session.spotifyAuthState) {
//     // state mismatch, but don't crash — continue but warn
//     console.warn("Spotify state mismatch (or missing)");
//   }

//   try {
//     const tokenData = await postForm("https://accounts.spotify.com/api/token", {
//       grant_type: "authorization_code",
//       code,
//       redirect_uri: redirectUri,
//       client_id: clientId,
//       client_secret: clientSecret
//     });

//     if (tokenData.error) {
//       console.error("Spotify token error:", tokenData);
//       return res.status(400).json(tokenData);
//     }

//     // Store tokens in server session
//     req.session.spotify = {
//       access_token: tokenData.access_token,
//       refresh_token: tokenData.refresh_token,
//       expires_in: tokenData.expires_in,
//       obtained_at: Date.now()
//     };

//     // Redirect back to frontend — same tab
//     res.redirect("/?spotify=success");
//   } catch (err) {
//     console.error("Spotify callback error:", err);
//     res.status(500).send("Spotify auth failed");
//   }
// });
// Step 2: Handle callback
router.get("/callback", async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;

  if (!code) return res.status(400).send("Missing code");
  if (!state || state !== (req.session && req.session.spotifyState)) {
    return res.status(400).send("Spotify state mismatch (or missing)");
  }

  // clear it so it can’t be reused
  delete req.session.spotifyState;

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });

  const data = await tokenRes.json();
  if (data.error) return res.status(400).json(data);

  // Save tokens in session
  req.session.spotify = data;

  // Redirect back to frontend
  res.redirect("/?spotify=success");
});



// Helper to ensure we have a valid access token (basic refresh logic)
async function ensureAccessToken(req) {
  if (!req.session || !req.session.spotify) throw new Error("Not logged in to Spotify");
  const s = req.session.spotify;
  const expiresAt = (s.obtained_at || 0) + ((s.expires_in || 0) * 1000) - 5000; // refresh 5s early
  if (Date.now() < expiresAt && s.access_token) return s.access_token;

  // refresh
  const refreshRes = await postForm("https://accounts.spotify.com/api/token", {
    grant_type: "refresh_token",
    refresh_token: s.refresh_token,
    client_id: clientId,
    client_secret: clientSecret
  });

  if (refreshRes.error) throw new Error("Failed refreshing token: " + JSON.stringify(refreshRes));
  s.access_token = refreshRes.access_token;
  s.expires_in = refreshRes.expires_in || s.expires_in;
  s.obtained_at = Date.now();
  req.session.spotify = s;
  return s.access_token;
}

// Logout
router.get("/logout", (req, res) => {
  if (req.session) {
    delete req.session.spotify;
    delete req.session.spotifyAuthState;
  }
  res.json({ success: true });
});

// Me endpoint: basic profile
router.get("/me", async (req, res) => {
  try {
    const token = await ensureAccessToken(req);
    const r = await fetch("https://api.spotify.com/v1/me", { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    res.json(j);
  } catch (err) {
    res.status(401).json({ error: "Not logged in" });
  }
});

// Get user's playlists (paginated - we return first page)
router.get("/playlists", async (req, res) => {
  try {
    const token = await ensureAccessToken(req);
    const r = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    res.json(j);
  } catch (err) {
    res.status(401).json({ error: "Not logged in" });
  }
});

// Get tracks for a playlist (playlistId param)
router.get("/playlists/:id/tracks", async (req, res) => {
  try {
    const token = await ensureAccessToken(req);
    const playlistId = req.params.id;
    // Spotify returns paging. We fetch first 100 items for simplicity.
    const r = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    res.json(j);
  } catch (err) {
    res.status(401).json({ error: "Not logged in" });
  }
});

// Search public playlists (by query)
router.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json({ playlists: [] });
    // Use client credentials flow to search public content if not logged in — but here we will try to use client creds
    // We'll get an app token using client credentials (no user).
    const tokenResp = await postForm("https://accounts.spotify.com/api/token", {
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret
    });
    if (tokenResp.error) return res.status(500).json({ error: "Spotify client token error", detail: tokenResp });

    const token = tokenResp.access_token;
    // Search for playlists
    const r = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=playlist&limit=20`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    res.json(j);
  } catch (err) {
    console.error("Spotify search error:", err);
    res.status(500).json({ error: "Search failed", detail: String(err) });
  }
});

module.exports = router;

