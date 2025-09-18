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
// prefer global fetch if available, fallback to node-fetch
const fetch = globalThis.fetch || require("node-fetch"); // npm i node-fetch@2
require("dotenv").config();

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
const querystring = require("querystring");

// helper: random state
function makeState(len = 16) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// helper: token exchange
async function exchangeCodeForTokens(code) {
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
    }).toString()
  });
  return tokenRes.json();
}

async function refreshAccessToken(refresh_token) {
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token
    }).toString()
  });
  return tokenRes.json();
}

function saveTokensToSession(sess, tokenData) {
  const now = Date.now();
  // tokenData contains access_token, token_type, expires_in, refresh_token maybe
  sess.spotify = sess.spotify || {};
  sess.spotify.access_token = tokenData.access_token;
  if (tokenData.refresh_token) sess.spotify.refresh_token = tokenData.refresh_token;
  // expires_at (ms)
  sess.spotify.expires_at = now + (tokenData.expires_in || 3600) * 1000;
}

// ensure access token valid and refresh if needed
async function ensureValidAccessToken(req) {
  if (!req.session || !req.session.spotify) throw new Error("Not authenticated with Spotify");
  const s = req.session.spotify;
  const now = Date.now();
  if (!s.access_token) throw new Error("No access token");
  if (s.expires_at && s.expires_at > now + 5000) return s.access_token; // still valid
  if (!s.refresh_token) throw new Error("No refresh token available");
  // refresh
  const fresh = await refreshAccessToken(s.refresh_token);
  if (fresh.error) throw new Error(JSON.stringify(fresh));
  saveTokensToSession(req.session, fresh);
  return req.session.spotify.access_token;
}

// Step 1: redirect to Spotify authorize URL
router.get("/login", (req, res) => {
  // Generate and save state for CSRF protection
  const state = makeState(24);
  req.session.spotifyState = state;
  console.log("[/login] Generated state =", state);
  console.log("[/login] Session ID =", req.sessionID);
  console.log("[/login] Session object =", req.session);
  console.log("[/login] Set-Cookie header will be:", res.getHeader("Set-Cookie"));

  const scope = [
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-read-email",
    "user-read-private",
  ].join(" ");

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  // use configured redirectUri (must match Spotify app setting)
  authUrl.searchParams.set("redirect_uri", redirectUri || "http://127.0.0.1:5000/api/spotify/callback");
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("state", state);

  // Optional: force Spotify to ask user every time
  // authUrl.searchParams.set("show_dialog", "true");

  res.redirect(authUrl.toString());
});

// Step 2: callback — validate state and exchange code
router.get("/callback", async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;

  if (!code) {
    return res.status(400).send("No code found");
  }
  console.log("[/callback] query.state =", state);
  console.log("[/callback] session.spotifyState =", req.session && req.session.spotifyState);
  console.log("[/callback] Session ID =", req.sessionID);
  console.log("[/callback] Session object =", req.session);
  console.log("[/callback] Raw cookies sent by browser =", req.headers.cookie);
  console.log("[callback] Cookies received =", req.headers.cookie);
  console.log("[callback] Session ID (server) =", req.sessionID);


  // validate state
  if (!state || !req.session || req.session.spotifyState !== state) {
    return res.status(400).send("Invalid or missing Spotify state (CSRF check failed)");
  }
  // clear stored state once used
  delete req.session.spotifyState;
  console.log("[/callback] State validated and cleared.");

  try {
    const body = querystring.stringify({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirectUri || "http://127.0.0.1:5000/api/spotify/callback",
    });

    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
      },
      body: body,
    });

    const data = await tokenResponse.json();

    console.log("Spotify token response:", data);

    if (data.error) {
      console.error("Spotify token error:", data);
      return res.status(400).send("Failed to get tokens: " + (data.error_description || data.error));
    }

    // ✅ Save tokens correctly
    saveTokensToSession(req.session, data);

    // Redirect back to frontend import page. Use configured FRONTEND_URL or default
    const frontendBase = process.env.FRONTEND_URL || `http://127.0.0.1:${process.env.PORT || 5000}`;
    return res.redirect(`${frontendBase}/import?connected=spotify`);

  } catch (err) {
    console.error("Error during token exchange:", err);
    res.status(500).send("Internal Server Error");
  }
});

// (Helper) current user profile
router.get("/me", async (req, res) => {
  try {
    const token = await ensureValidAccessToken(req);
    const response = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(401).json({ error: "Not logged in", detail: String(err) });
  }
});

// Get current user's playlists (paginated)
router.get("/playlists", async (req, res) => {
  try {
    const token = await ensureValidAccessToken(req);
    const response = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(401).json({ error: "Not logged in", detail: String(err) });
  }
});

// Get tracks for a playlist id (playlist owned/public)
router.get("/playlists/:id/tracks", async (req, res) => {
  try {
    const token = await ensureValidAccessToken(req);
    const id = req.params.id;
    const response = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(id)}/tracks?limit=100`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(401).json({ error: "Not logged in", detail: String(err) });
  }
});

// Search public playlists (by q) or accept playlist url
router.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "q required" });

    // If a Spotify playlist URL/URI is pasted, extract ID and return that playlist
    const playlistIdMatch = q.match(/playlist[\/:]([a-zA-Z0-9]+)|spotify:playlist:([a-zA-Z0-9]+)/);
    if (playlistIdMatch) {
      const id = (playlistIdMatch[1] || playlistIdMatch[2]);
      const response = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${await ensureValidAccessToken(req)}` }
      });
      const playlist = await response.json();
      return res.json({ playlists: { items: [playlist] } });
    }

    // Otherwise search for playlists by query
    const token = await ensureValidAccessToken(req);
    const response = await fetch(`https://api.spotify.com/v1/search?type=playlist&q=${encodeURIComponent(q)}&limit=20`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(401).json({ error: "Not logged in", detail: String(err) });
  }
});

module.exports = router;


