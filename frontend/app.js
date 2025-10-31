// frontend/app.js
const API = (window.location.origin || "http://localhost:5000") + "/api/music";
const API_PROFILES = (window.location.origin || "http://localhost:5000") + "/api/profiles";

let playlists = [];
let active = null;
let tracks = []; // downloaded tracks of current playlist
let queue = [];  // queued { fileUrl, title }
let currentIndex = -1;
let isLoop = false;
let isShuffle = false;

// Spotify helper state
let spotifyTracks = [];            // [{ id: spotifyTrackId, title: "Song — Artist" }, ...]
let spotifyCurrentPlaylistId = ""; // spotify playlist id for import
let spotifyCurrentPlaylistName = ""; // playlist name for import

// Elements
const els = {
  playlistList: document.getElementById("playlistList"),
  newPlaylist: document.getElementById("newPlaylist"),
  createPlaylistBtn: document.getElementById("createPlaylistBtn"),

  activePlaylistName: document.getElementById("activePlaylistName"),
  bottomLoopBtn: document.getElementById("bottomLoopBtn"),
  bottomShuffleBtn: document.getElementById("bottomShuffleBtn"),
  bottomPrevBtn: document.getElementById("bottomPrevBtn"),
  bottomPlayBtn: document.getElementById("bottomPlayBtn"),
  bottomNextBtn: document.getElementById("bottomNextBtn"),
  bottomSongName: document.getElementById("bottomSongName"),
  musicProgressBar: document.getElementById("musicProgressBar"),
  deletePlaylistBtn: document.getElementById("deletePlaylistBtn"),

  trackList: document.getElementById("trackList"),

  downloads: document.getElementById("downloads"),
  player: document.getElementById("player"),
  nowPlaying: document.getElementById("nowPlaying"),

  // Seekable progress bar
  nowPlayingBar: document.getElementById("nowPlayingBar"),
  nowPlayingProgress: document.getElementById("nowPlayingProgress"),

  // Failed downloads overlay (might be unused but kept)
  failedPage: document.getElementById("failedPage"),
  failedResults: document.getElementById("failedResults"),
  backFromFailed: document.getElementById("backFromFailed"),

  // Repair
  repairBtn: document.getElementById("repairBtn"),

  // Navbar overlays
  openSearch: document.getElementById("searchBtn"),
  openImport: document.getElementById("importBtn"),
  searchPage: document.getElementById("searchPage"),
  backFromSearch: document.getElementById("backFromSearch"),
  searchQuery: document.getElementById("searchQuery"),
  searchDoBtn: document.getElementById("searchDoBtn"),
  searchResults: document.getElementById("searchResults"),

  importPage: document.getElementById("importPage"),
  backFromImport: document.getElementById("backFromImport"),
  importUrl: document.getElementById("importUrl"),
  importPreviewBtn: document.getElementById("importPreviewBtn"),
  importResults: document.getElementById("importResults"),
  importDownloadSelected: document.getElementById("importDownloadSelected"),

  // Progress overlay
  progressOverlay: document.getElementById("progressOverlay"),
  progressBar: document.getElementById("progressBar"),
  progressText: document.getElementById("progressText"),
};

// Profiles UI pointers
els.profilePage = document.getElementById("profilePage");
els.profilesList = document.getElementById("profilesList");
els.newProfileName = document.getElementById("newProfileName");
els.createProfileBtnProfile = document.getElementById("createProfileBtnProfile");
els.stayLoggedIn = document.getElementById("stayLoggedIn");
els.profileBtn = document.getElementById("profileBtn");
els.profileOverlay = document.getElementById("profileOverlay");
els.backFromProfile = document.getElementById("backFromProfile");
els.profileOverlayName = document.getElementById("profileOverlayName");
els.profileAvatar = document.getElementById("profileAvatar");
els.editProfileBtn = document.getElementById("editProfileBtn");
els.uploadPicBtn = document.getElementById("uploadPicBtn");
els.logoutBtn = document.getElementById("logoutBtn");
els.deleteProfileBtn = document.getElementById("deleteProfileBtn");


// ----------- Profiles (server-backed) ----------
let profiles = [];
let activeProfile = null; // { id, displayName, stayLoggedIn }

async function loadProfilesFromServer() {
  try {
    const r = await fetch(API_PROFILES);
    profiles = await r.json();
    profiles = (profiles || []).map(p => ({ id: p.id, displayName: p.displayName || p.id, avatarUrl: p.avatarUrl || null }));
  } catch (e) {
    profiles = [];
  }
}

function renderProfilesList() {
  const el = els.profilesList;
  if (!el) return;
  if (!profiles.length) {
    el.innerHTML = `<p style="color:var(--muted);">No profiles yet. Create one below.</p>`;
    return;
  }
  el.innerHTML = profiles.map(p => `<button class="profile-tile" onclick="selectProfile('${p.id}')">${p.displayName || p.id}</button>`).join("");
}

async function showProfileChooser() {
  await loadProfilesFromServer();
  renderProfilesList();
  show(els.profilePage);
}
function closeProfileChooser() { hide(els.profilePage); }

async function createProfileFromInput() {
  const name = (els.newProfileName?.value || "").trim();
  const stay = !!(els.stayLoggedIn?.checked);
  if (!name) return alert("Enter a profile name");
  try {
    const res = await fetch(API_PROFILES, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: name }) });
    const j = await res.json();
    await loadProfilesFromServer();
    selectProfile(j.id);
  } catch (e) { alert("Failed to create profile: " + e); }
}

function selectProfile(id) {
  const p = profiles.find(x => x.id === id);
  if (!p) {
    alert("Profile not found");
    return;
  }

  activeProfile = p;

  // Reset state when switching profiles
  active = null;
  tracks = [];
  if (els.activePlaylistName) els.activePlaylistName.textContent = "No Playlist";
  if (els.trackList) els.trackList.innerHTML = "";
  const songsSection = document.getElementById("songs");
  if (songsSection) hide(songsSection);

  // Update navbar profile circle (outside)
  if (els.profileBtn) {
    els.profileBtn.innerHTML = "";
    els.profileBtn.style.background = "";
    els.profileBtn.style.color = "";
    els.profileBtn.classList.remove("has-avatar");

    if (p.avatarUrl) {
      const img = document.createElement("img");
      img.src = p.avatarUrl;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      img.style.borderRadius = "50%";
      els.profileBtn.appendChild(img);
      els.profileBtn.classList.add("has-avatar");
    } else {
      const initials = (p.displayName || p.id || "?").trim().slice(0, 2).toUpperCase();
      els.profileBtn.textContent = initials;
      els.profileBtn.style.background = "purple";
      els.profileBtn.style.color = "white";
    }

    els.profileBtn.onclick = openProfileOverlay;
  }

  // Persist selection
  try { localStorage.setItem("musix_activeProfile", activeProfile.id); } catch (e) {}

  // Close chooser and load profile-scoped data
  closeProfileChooser();
  (async () => {
    await loadPlaylists();
    await loadDownloads();
  })();
}

// expose to inline HTML (profile tiles)
window.selectProfile = selectProfile;

// helper DOM interactions
if (els.musicProgressBar && els.musicProgressBar.parentElement) {
  els.musicProgressBar.parentElement.addEventListener("click", (ev) => {
    const rect = els.musicProgressBar.parentElement.getBoundingClientRect();
    const x = ev.clientX - rect.left; // Where user clicked
    const pct = Math.min(1, Math.max(0, x / rect.width)); // Percentage of bar
    if (els.player.duration) {
      els.player.currentTime = pct * els.player.duration; // Jump to that time
      updateNowPlayingProgress();
    }
  });
}

function show(el) { if (el) el.classList.remove("hidden"); }
function hide(el) { if (el) el.classList.add("hidden"); }

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    const txt = await r.text();
    try { const j = JSON.parse(txt); throw new Error(JSON.stringify(j)); } catch (e) { throw new Error(txt); }
  }
  return r.json();
}

// ----------- Playlists ------------
async function loadPlaylists() {
  try {
    if (!activeProfile) {
      playlists = [];
      renderPlaylists();
      return;
    }
    const data = await fetchJSON(`${API}/playlists?profileId=${encodeURIComponent(activeProfile.id)}`);
    const all = data.names || [];
    playlists = all;
    renderPlaylists();
    if (!active && playlists.length) {
      await setActive(playlists[0]);
    }
  } catch (e) {
    console.error("Failed to load playlists:", e);
  }
}

async function setActive(name) {
  active = name;
  els.activePlaylistName.textContent = name || "No Playlist";
  show(document.getElementById("songs"));
  await loadPlaylistTracks(name);
}

function renderPlaylists() {
  els.playlistList.innerHTML = playlists.map(n => `
    <li>
      <div class="pl-item-title" onclick="setActive('${n.replace(/'/g,"\\'")}')">${n}</div>
    </li>
  `).join("");
}

async function createPlaylist() {
  if (!activeProfile) return alert("Select a profile first.");
  const name = els.newPlaylist.value.trim();
  if (!name) return alert("Enter name");
  await fetchJSON(`${API}/playlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId: activeProfile.id, name })
  });
  els.newPlaylist.value = "";
  await loadPlaylists();
}

async function deletePlaylist(name) {
  if (!name) return;
  if (!confirm(`Delete playlist "${name}"?`)) return;
  await fetchJSON(`${API}/playlist/${encodeURIComponent(activeProfile.id)}/${encodeURIComponent(name)}`, { method: "DELETE" });
  active = null;
  hide(document.getElementById("songs"));
  els.trackList.innerHTML = "";
  els.activePlaylistName.textContent = "No Playlist";
  await loadPlaylists();
}

// ----------- Playlist tracks ------------
async function loadPlaylistTracks(name) {
  try {
    const data = await fetchJSON(`${API}/playlist/${encodeURIComponent(activeProfile.id)}/${encodeURIComponent(name)}`);
    tracks = data.songs || [];
    queue = [];
    currentIndex = -1;
    renderTracks();
  } catch (e) {
    console.error("Failed to load playlist tracks:", e);
    tracks = [];
    renderTracks();
  }
}

// function renderTracks() {
//   if (!tracks.length) {
//     els.trackList.innerHTML = `<li class="row"><div class="row-title">No downloaded tracks yet.</div></li>`;
//     return;
//   }
//   els.trackList.innerHTML = tracks.map((t, i) => `
//     <li class="row">
//       <div class="row-title">${t.title}</div>
//       <div class="track-actions">
//         <button class="btn small" onclick="playIndex(${i})">Play</button>
//         <button class="btn queue" onclick="queueTrack(${i})">Queue</button>
//         <button class="btn small danger" onclick="deleteTrack('${t.filename.replace(/'/g,"\\'")}')">❌</button>
//       </div>
//     </li>
//   `).join("");
// }
// REPLACE existing renderTracks() with this function
function renderTracks() {
  if (!tracks.length) {
    els.trackList.innerHTML = `<li class="row"><div class="row-title">No downloaded tracks yet.</div></li>`;
    return;
  }

  els.trackList.innerHTML = tracks.map((t, i) => {
    // Debug log: shows whether frontend received the thumbnail and the first 30 chars
    console.log("Track:", t.title, "Thumb starts with:", t.thumbnail ? t.thumbnail.slice(0, 30) : "undefined");

    // keep filename safe for inline handlers (same as before)
    const safeFilename = (t.filename || "").replace(/'/g, "\\'");

    // thumbnail HTML: show <img> if thumbnail present else a placeholder div
    const thumbHTML = t.thumbnail
      ? `<img class="track-thumb" src="${t.thumbnail}" alt="cover">`
      : `<div class="track-thumb placeholder"></div>`;

    return `
      <li class="row">
        <div class="row-title" style="display:flex;align-items:center;gap:8px;">
          ${thumbHTML}
          <div style="display:flex;flex-direction:column;">
            <div class="title-text">${t.title}</div>
            <div class="meta muted small">${t.filename || ""}</div>
          </div>
        </div>

        <div class="track-actions">
          <button class="btn small" onclick="playIndex(${i})">Play</button>
          <button class="btn queue" onclick="queueTrack(${i})">Queue</button>
          <button class="btn small danger" onclick="deleteTrack('${safeFilename}')">❌</button>
        </div>
      </li>
    `;
  }).join("");
}



async function deleteTrack(filename) {
  if (!active) return;
  if (!confirm(`Delete "${filename}"?`)) return;
  await fetchJSON(`${API}/playlist/${encodeURIComponent(activeProfile.id)}/${encodeURIComponent(active)}/song`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename })
  });
  await loadPlaylistTracks(active);
  await loadDownloads();
}

// ----------- Player & controls ------------
function setNowPlayingText(title) {
  els.nowPlaying.textContent = "Now playing: " + title;
  if (els.bottomSongName) els.bottomSongName.textContent = title;
}

function playFile(url, title) {
  if (!url) return;
  els.player.src = url;
  els.player.play().catch(() => {});
  setNowPlayingText(title, "Now playing");
}

function playIndex(i) {
  if (!tracks.length || i < 0 || i >= tracks.length) return;
  currentIndex = i;
  const s = tracks[i];
  playFile(s.fileUrl, s.title);
}

function prev() {
  if (!tracks.length) return;
  if (queue.length) {
    const item = queue.pop();
    playFile(item.fileUrl, item.title);
    return;
  }
  if (isShuffle) {
    const i = Math.floor(Math.random() * tracks.length);
    playIndex(i);
    return;
  }
  currentIndex = (currentIndex - 1 + tracks.length) % tracks.length;
  playIndex(currentIndex);
}

function next() {
  if (queue.length) {
    const item = queue.shift();
    playFile(item.fileUrl, item.title);
    return;
  }
  if (isLoop) {
    if (currentIndex >= 0 && tracks[currentIndex]) {
      playIndex(currentIndex);
      return;
    }
  }
  if (!tracks.length) return;
  if (isShuffle) {
    const i = Math.floor(Math.random() * tracks.length);
    playIndex(i);
    return;
  }
  currentIndex = (currentIndex + 1) % tracks.length;
  playIndex(currentIndex);
}

function toggleLoop() {
  isLoop = !isLoop;
  if (els.bottomLoopBtn) els.bottomLoopBtn.classList.toggle("active", isLoop);
}
function toggleShuffle() {
  isShuffle = !isShuffle;
  if (els.bottomShuffleBtn) els.bottomShuffleBtn.classList.toggle("active", isShuffle);
}
function togglePlayPause() {
  if (els.player.paused) {
    els.player.play().catch(()=>{});
    els.bottomPlayBtn.textContent = "⏸";
  } else {
    els.player.pause();
    els.bottomPlayBtn.textContent = "▶";
  }
}

function playAllTracks() {
  if (!tracks.length) return;
  currentIndex = 0;
  playIndex(0);
}
function queueTrack(index) {
  if (!tracks[index]) return;
  queue.push({ fileUrl: tracks[index].fileUrl, title: tracks[index].title });
  alert(`Queued: ${tracks[index].title}`);
}

if (els.player) {
  els.player.onended = () => { next(); };
  els.player.onplay = () => { els.bottomPlayBtn.textContent = "⏸"; };
  els.player.onpause = () => { els.bottomPlayBtn.textContent = "▶"; };
}

// ---- Seekable progress bar ----
function updateNowPlayingProgress() {
  try {
    const d = els.player.duration || 0;
    const t = els.player.currentTime || 0;
    const pct = d ? Math.min(100, Math.max(0, (t / d) * 100)) : 0;
    if (els.nowPlayingProgress) els.nowPlayingProgress.style.width = `${pct}%`;
    if (els.musicProgressBar) els.musicProgressBar.style.width = `${pct}%`;
  } catch (e) {}
}
if (els.player) {
  els.player.addEventListener("timeupdate", updateNowPlayingProgress);
  els.player.addEventListener("loadedmetadata", updateNowPlayingProgress);
}
if (els.nowPlayingBar) {
  els.nowPlayingBar.addEventListener("click", (ev) => {
    const rect = els.nowPlayingBar.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const pct = Math.min(1, Math.max(0, x / rect.width));
    if (els.player.duration) {
      els.player.currentTime = pct * els.player.duration;
      updateNowPlayingProgress();
    }
  });
}

// ----------- Downloads pane ------------
async function loadDownloads() {
  try {
    const data = await fetchJSON(`${API}/downloads?profileId=${encodeURIComponent(activeProfile?.id||'')}`);
    const base = (window.location.origin || "http://localhost:5000");
    let html = "<p>No downloads yet.</p>";
    if (data && Object.keys(data.downloads || {}).length) {
      const groups = Object.entries(data.downloads)
        .map(([pl, files]) => {
          const displayName = pl;
          return `<div class="dl-group"><h3>${displayName}</h3><ul>${files.map(f => {
            const url = f.fileUrl ? (base + f.fileUrl) : `${base}/downloads/${encodeURIComponent(activeProfile?.id||'')}/playlists/${encodeURIComponent(pl)}/${encodeURIComponent(f.filename)}`;
            return `<li><button class="link-btn" onclick="playFile('${url}','${(f.filename||"").replace(/'/g,"\\'")}')">${f.filename || f}</button></li>`;
          }).join("")}</ul></div>`;
        });
      if (groups.length) html = groups.join("");
    }
    const downloadsEl = document.getElementById("downloads");
    if (downloadsEl) downloadsEl.innerHTML = html;
  } catch (e) {
    console.warn("Failed to load downloads:", e);
  }
}

// ----------- Search & Import ------------
function openSearch() { show(els.searchPage); }
function closeSearch() { hide(els.searchPage); els.searchResults.innerHTML=""; if (els.searchQuery) els.searchQuery.value=""; }

async function doSearch() {
  const q = els.searchQuery.value.trim();
  if (!q) return;
  try {
    const data = await fetchJSON(`${API}/search?q=${encodeURIComponent(q)}`);
    if (!data.results?.length) { els.searchResults.innerHTML = "<p>No results</p>"; return; }
    els.searchResults.innerHTML = data.results.map(r => `
      <div class="result-row">
        <div class="row-title">${r.title}</div>
        <div>
          <button class="btn small" onclick="downloadSongFromSearch('${r.id}')">Download</button>
        </div>
      </div>
    `).join("");
  } catch (e) {
    console.error("Search failed:", e);
    els.searchResults.innerHTML = `<p>Error searching: ${String(e)}</p>`;
  }
}

async function downloadSongFromSearch(videoId) {
  if (!active) return alert("Select a playlist first from the left sidebar.");
  try {
    const { jobId } = await fetchJSON(`${API}/download/song`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ profileId: activeProfile?.id, playlist: active, videoId })
    });
    await trackJob(jobId);
    await loadPlaylistTracks(active);
    await loadDownloads();
  } catch (e) {
    console.error("Download from search failed:", e);
    alert("Download failed: " + (e.message || e));
  }
}

// Import preview & download
function openImport() { show(els.importPage); }
function closeImport() { hide(els.importPage); els.importResults.innerHTML=""; if (els.importUrl) els.importUrl.value=""; }

let importPreview = [];

async function importPreviewFetch() {
  const url = els.importUrl.value.trim();
  if (!url) return;
  try {
    const data = await fetchJSON(`${API}/import/preview`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ url })
    });
    importPreview = data.results || [];
    if (!importPreview.length) {
      els.importResults.innerHTML = "<p>No items found in this playlist.</p>";
      return;
    }
    els.importResults.innerHTML = importPreview.map(r => `
      <div class="import-row">
        <label style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" class="import-check" value="${r.id}" checked />
          <span>${r.title}</span>
        </label>
      </div>
    `).join("");
  } catch (e) {
    console.error("Import preview failed:", e);
    els.importResults.innerHTML = `<p>Error: ${String(e)}</p>`;
  }
}

// Select Spotify playlist & render checkboxes (single consolidated implementation)
window.selectSpotifyPlaylist = async function(id, name) {
  try {
    spotifyCurrentPlaylistId = id;
    spotifyCurrentPlaylistName = name;

    // fetch tracks for this playlist
    const res = await fetchJSON(`/api/spotify/playlists/${encodeURIComponent(id)}/tracks`, { credentials: "include" });
    const items = res.items || [];

    spotifyTracks = items.map(it => {
      const t = it.track || it; // defensive
      const title = `${t.name} — ${(t.artists||[]).map(a => a.name).join(", ")}`;
      return { id: t.id, title };
    });

    if (!spotifyTracks.length) {
      // ensure the import overlay is visible and show message
      setActiveImportTab("spotify");
      show(els.importPage);
      if (els.importResults) els.importResults.innerHTML = "<p>No tracks found in this playlist.</p>";
      return;
    }

    // Ensure Spotify tab is active and the import overlay is visible
    setActiveImportTab("spotify");
    show(els.importPage);

    // Populate the single shared import results container
    if (!els.importResults) els.importResults = document.getElementById("importResults");
    els.importResults.innerHTML = spotifyTracks.map(t => `
      <div class="import-row">
        <label style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" class="import-check" value="${t.id}" checked />
          <span>${t.title}</span>
        </label>
      </div>
    `).join("");

    // Scroll the results into view so the user sees the checkboxes immediately
    els.importResults.scrollIntoView({ behavior: "smooth", block: "start" });

    // Also set the import source so importDownloadSelected can use it (keeps existing logic intact)
    spotifyCurrentPlaylistId = id;
    spotifyCurrentPlaylistName = name;

  } catch (e) {
    console.error("Failed to fetch Spotify playlist tracks:", e);
    alert("Failed to load playlist tracks: " + (e.message || e));
  }
};

// async function importDownloadSelected() {
//   if (!active) return alert("Select a playlist first from the left sidebar.");
//   const checks = Array.from(document.querySelectorAll(".import-check"));
//   const ids = checks.filter(c => c.checked).map(c => c.value);
//   if (!ids.length) return alert("Select at least one track.");

//   // ✅ show progress overlay immediately
//   show(els.progressOverlay);
//   setProgress(0, "Preparing downloads...");

//   // Helper to test likely YouTube id (11 chars typical)
//   const isYouTubeId = (s) => /^[A-Za-z0-9_-]{11}$/.test(s);

//   let videoIds = [];
//   if (ids.every(isYouTubeId)) {
//     videoIds = ids;
//   } else {
//     if (!spotifyTracks || !spotifyTracks.length) {
//       hide(els.progressOverlay);
//       return alert("No Spotify track data available. Re-open the playlist before importing.");
//     }

//     const idToQuery = {};
//     for (const t of spotifyTracks) idToQuery[t.id] = t.title;

//     videoIds = [];
//     for (const sid of ids) {
//       const q = idToQuery[sid] || sid;
//       try {
//         const searchRes = await fetchJSON(`${API}/search?q=${encodeURIComponent(q)}`);
//         const top = (searchRes.results || [])[0];
//         if (top && top.id) videoIds.push(top.id);
//         await new Promise(r => setTimeout(r, 250));
//       } catch (e) {
//         console.warn("Search failed for", q, e);
//       }
//     }

//     if (!videoIds.length) {
//       hide(els.progressOverlay);
//       return alert("Could not find any YouTube matches for the selected tracks.");
//     }
//   }

//   try {
//     const playlistUrl = spotifyCurrentPlaylistId
//       ? `spotify:playlist:${spotifyCurrentPlaylistId}`
//       : (els.importUrl?.value || "");

//     const { jobId } = await fetchJSON(`${API}/import/download`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         profileId: activeProfile?.id,
//         name: active,
//         selectedIds: videoIds,
//         url: playlistUrl
//       })
//     });

//     // continue with normal tracking
//     const jobResult = await trackJob(jobId);
//     await loadPlaylistTracks(active);
//     await loadDownloads();

//     if (jobResult && jobResult.failed && jobResult.failed.length) {
//       setUndownloaded(jobResult.failed);
//       showUndownloadedPage();
//     }

//     closeImport();
//   } catch (e) {
//     console.error("Import download failed:", e);
//     alert("Import download failed: " + (e.message || e));
//     hide(els.progressOverlay);
//   }
// }
async function importDownloadSelected() {
  if (!active) return alert("Select a playlist first from the left sidebar.");
  const checks = Array.from(document.querySelectorAll(".import-check"));
  const ids = checks.filter(c => c.checked).map(c => c.value);
  if (!ids.length) return alert("Select at least one track.");

  // ✅ show progress overlay immediately
  show(els.progressOverlay);
  setProgress(0, "Preparing downloads...");

  // Helper to test likely YouTube id (11 chars typical)
  const isYouTubeId = (s) => /^[A-Za-z0-9_-]{11}$/.test(s);

  let videoIds = [];
  // collect failed Spotify matches here
  let failedSpotifyTracks = [];

  if (ids.every(isYouTubeId)) {
    videoIds = ids;
  } else {
    if (!spotifyTracks || !spotifyTracks.length) {
      hide(els.progressOverlay);
      return alert("No Spotify track data available. Re-open the playlist before importing.");
    }

    const idToQuery = {};
    for (const t of spotifyTracks) idToQuery[t.id] = t.title;

    videoIds = [];
    for (const sid of ids) {
      const q = idToQuery[sid] || sid;
      try {
        const searchRes = await fetchJSON(`${API}/search?q=${encodeURIComponent(q)}`);
        const top = (searchRes.results || [])[0];
        if (top && top.id) {
          videoIds.push(top.id);
        } else {
          console.warn("No search result for", q);
          failedSpotifyTracks.push({ id: sid, title: q });
        }
        await new Promise(r => setTimeout(r, 250));
      } catch (e) {
        console.warn("Search failed for", q, e);
        failedSpotifyTracks.push({ id: sid, title: q });
      }
    }

    if (!videoIds.length) {
      hide(els.progressOverlay);
      return alert("Could not find any YouTube matches for the selected tracks.");
    }
  }

  try {
    const playlistUrl = spotifyCurrentPlaylistId
      ? `spotify:playlist:${spotifyCurrentPlaylistId}`
      : (els.importUrl?.value || "");

    const { jobId } = await fetchJSON(`${API}/import/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: activeProfile?.id,
        name: active,
        selectedIds: videoIds,
        url: playlistUrl
      })
    });

    // continue with normal tracking
    const jobResult = await trackJob(jobId);
    await loadPlaylistTracks(active);
    await loadDownloads();

    if (
      (jobResult && jobResult.failed && jobResult.failed.length) ||
      failedSpotifyTracks.length
    ) {
      // merge backend failures + Spotify mapping failures
      const combinedFails = [
        ...(jobResult.failed || []),
        ...failedSpotifyTracks
      ];
      setUndownloaded(combinedFails);
      showUndownloadedPage();
    }

    closeImport();
  } catch (e) {
    console.error("Import download failed:", e);
    alert("Import download failed: " + (e.message || e));
    hide(els.progressOverlay);
  }
}


// ----------- Progress overlay ------------
function setProgress(pct, text) {
  try {
    if (els.progressBar) els.progressBar.style.width = `${Math.max(0, Math.min(100, pct || 0))}%`;
    if (els.progressText && text !== undefined) els.progressText.textContent = text;
  } catch (e) {}
}

async function trackJob(jobId) {
  if (!jobId) return;
  let shown = false;
  let jobResult = null;
  try {
    while (true) {
      let j;
      try { j = await fetchJSON(`${API}/progress/${jobId}`); }
      catch (err) { hide(els.progressOverlay); setProgress(0, ""); return; }

      if (!shown) { show(els.progressOverlay); shown = true; }
      setProgress(j.percent || 1, j.message || "");

      if (j.status === "done") {
        jobResult = j;
        break;
      }
      if (j.status === "error") {
        jobResult = j;
        throw new Error(j.message || "Job failed");
      }

      await new Promise(r => setTimeout(r, 700));
    }
  } finally {
    hide(els.progressOverlay);
    setProgress(0, "");
  }
  return jobResult;
}

//----------- Undownloaded page -----------
let lastUndownloaded = [];

function showUndownloadedPage() {
  show(document.getElementById("undownloadedPage"));
  renderUndownloaded();
}

function hideUndownloadedPage() {
  hide(document.getElementById("undownloadedPage"));
}

function setUndownloaded(list) {
  lastUndownloaded = list || [];
}

// function renderUndownloaded() {
//   const container = document.getElementById("undownloadedResults");
//   if (!container) return;
//   if (!lastUndownloaded.length) {
//     container.innerHTML = "<p>No undownloaded songs from last import.</p>";
//     return;
//   }
//   container.innerHTML = lastUndownloaded.map((s, idx) => `
//     <div class="undl-row" id="undl-row-${idx}">
//       <div class="undl-title">${s.title || s.id}</div>
//       <button class="btn small" onclick="toggleUndlSearch(${idx})">Search</button>
    
//       <div class="undl-search-panel hidden" id="undl-search-panel-${idx}">
//         <input type="text" id="undl-search-input-${idx}" value="${s.title || s.id}" />
//         <button class="btn small" onclick="searchUndlSong(${idx}, true)">Go</button>
//         <div class="undl-search-results" id="undl-search-results-${idx}"></div>
//       </div>
//     </div>
//   `).join("");
// }
function renderUndownloaded() {
  const container = document.getElementById("undownloadedResults");
  if (!container) return;

  if (!lastUndownloaded || !lastUndownloaded.length) {
    container.innerHTML = "<p>No undownloaded songs from last import.</p>";
    return;
  }

  container.innerHTML = lastUndownloaded.map((s, idx) => `
    <div class="undl-row" id="undl-row-${idx}">
      <div class="undl-title">${s.title || s.id}</div>
      <div class="undl-note">Not available — change name slightly and search again</div>
      <button class="btn small" onclick="toggleUndlSearch(${idx})">Search</button>
    
      <div class="undl-search-panel hidden" id="undl-search-panel-${idx}">
        <input type="text" id="undl-search-input-${idx}" value="${s.title || s.id}" />
        <button class="btn small" onclick="searchUndlSong(${idx}, true)">Go</button>
        <div class="undl-search-results" id="undl-search-results-${idx}"></div>
      </div>
    </div>
  `).join("");
}


window.toggleUndlSearch = function(idx) {
  const panel = document.getElementById(`undl-search-panel-${idx}`);
  if (!panel) return;
  panel.classList.toggle("hidden");
};

window.searchUndlSong = async function(idx, manual = false) {
  const song = lastUndownloaded[idx];
  const resultsDiv = document.getElementById(`undl-search-results-${idx}`);
  const input = document.getElementById(`undl-search-input-${idx}`);
  if (!song || !resultsDiv) return;
  
  let query = song.title || song.id;
  if (manual && input) query = input.value.trim() || query;

  resultsDiv.innerHTML = "<p>Searching...</p>";
  try {
    const data = await fetchJSON(`${API}/search?q=${encodeURIComponent(query)}`);
    if (!data.results?.length) {
      resultsDiv.innerHTML = "<p>No results found.</p>";
      return;
    }
    resultsDiv.innerHTML = data.results.map(r => `
      <div class="result-row">
        <div class="row-title">${r.title}</div>
        <button class="btn small" onclick="downloadUndlSong('${r.id}', ${idx})">Download</button>
      </div>
    `).join("");
  } catch (e) {
    resultsDiv.innerHTML = `<p>Error: ${String(e)}</p>`;
  }
};

window.downloadUndlSong = async function(videoId, idx) {
  if (!active) return alert("Select a playlist first from the left sidebar.");
  try {
      const { jobId } = await fetchJSON(`${API}/download/song`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ profileId: activeProfile?.id, playlist: active, videoId })
      });

    await trackJob(jobId);
    await loadPlaylistTracks(active);
    await loadDownloads();
    // Remove from undownloaded list after successful download
    lastUndownloaded.splice(idx, 1);
    renderUndownloaded();
  } catch (e) {
    alert("Download failed: " + (e.message || e));
  }
};

// ----------- Repair button ------------
async function repairActive() {
  if (!active) return alert("Select a playlist first.");
  try {
    const res = await fetchJSON(`${API}/repair/${encodeURIComponent(activeProfile.id)}/${encodeURIComponent(active)}`, { method: "POST" });
    alert(`Repair complete.\nFixed: ${res.fixed}\nAdded: ${res.added}`);
    await loadPlaylistTracks(active);
    await loadDownloads();
  } catch (e) {
    console.error("Repair failed:", e);
    alert("Repair failed: " + (e.message || e));
  }
}

// ----------- Utility: safeAssign ------------
function safeAssign(el, fn) { if (el) el.onclick = fn; }

// ---------- Event wiring (single assignments) ----------
safeAssign(els.createPlaylistBtn, createPlaylist);
safeAssign(els.deletePlaylistBtn, () => { if (active) deletePlaylist(active); });

safeAssign(els.openSearch, openSearch);
safeAssign(els.backFromSearch, closeSearch);

safeAssign(els.searchDoBtn, doSearch);
if (els.searchQuery) els.searchQuery.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });

safeAssign(document.getElementById("spotifyLoginBtn"), () => {
  window.location = "/api/spotify/login";
});

safeAssign(document.getElementById("spotifySearchBtn"), async () => {
  const q = document.getElementById("spotifySearchInput").value.trim();
  if (!q) return;
  const res = await fetchJSON(`/api/spotify/search?q=${encodeURIComponent(q)}`);
  const container = document.getElementById("spotifySearchResults");
  const items = (res.playlists && res.playlists.items) || [];
  container.innerHTML = items.map(pl => `
    <div class="result-row">
      <div class="row-title">${pl.name}</div>
      <button type="button" class="btn small" onclick="selectSpotifyPlaylist('${pl.id}','${pl.name.replace(/'/g,"\\'")}')">Select</button>
    </div>
  `).join("");
});

safeAssign(els.openImport, openImport);
safeAssign(els.backFromImport, closeImport);
safeAssign(els.importPreviewBtn, importPreviewFetch);
safeAssign(els.importDownloadSelected, importDownloadSelected);
safeAssign(document.getElementById("undownloadedBtn"), showUndownloadedPage);
safeAssign(document.getElementById("backFromUndownloaded"), hideUndownloadedPage);
safeAssign(els.repairBtn, repairActive);
safeAssign(els.profileBtn, openProfileOverlay);
safeAssign(els.backFromProfile, closeProfileOverlay);
safeAssign(els.logoutBtn, logoutProfile);
safeAssign(els.editProfileBtn, editProfile);
safeAssign(els.uploadPicBtn, uploadProfilePic);
safeAssign(els.bottomPrevBtn, prev); // Previous song
safeAssign(els.bottomNextBtn, next); // Next song

safeAssign(els.bottomPlayBtn, () => {
  if (!els.player.src) {
    if (tracks.length) playIndex(0); // Play first track if nothing loaded
    else alert("No track loaded.");
    return;
  }
  togglePlayPause(); // Play or pause
});

safeAssign(document.getElementById("playAllBtn"), playAllTracks);
safeAssign(els.deleteProfileBtn, deleteProfile);

safeAssign(els.bottomLoopBtn, () => {
  isLoop = !isLoop;
  els.bottomLoopBtn.classList.toggle("active", isLoop);
  els.bottomLoopBtn.classList.toggle("inactive", !isLoop);
});
safeAssign(els.bottomShuffleBtn, () => {
  isShuffle = !isShuffle;
  els.bottomShuffleBtn.classList.toggle("active", isShuffle);
  els.bottomShuffleBtn.classList.toggle("inactive", !isShuffle);
});

// Back to playlists
const backBtn = document.getElementById("backToPlaylists");
if (backBtn) backBtn.onclick = () => {
  hide(document.getElementById("songs"));
  els.trackList.innerHTML = "";
  active = null;
  els.activePlaylistName.textContent = "No Playlist";
};
safeAssign(els.createProfileBtnProfile, createProfileFromInput);

// Expose safe functions globally for inline HTML
window.playIndex = playIndex;
window.queueTrack = queueTrack;
window.setActive = setActive;
window.playFile = playFile;
window.selectProfile = selectProfile;

// ----------- Profile overlay ------------
function openProfileOverlay() {
  if (!activeProfile) return alert("No active profile selected.");
  els.profileOverlayName.textContent = activeProfile.displayName || activeProfile.id;

  // Avatar inside overlay: image or initials
  if (activeProfile.avatarUrl) {
    els.profileAvatar.innerHTML = `<img src="${activeProfile.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    els.profileAvatar.style.background = "";
    els.profileAvatar.style.color = "";
  } else {
    const initials = (activeProfile.displayName || activeProfile.id || "?").trim().slice(0, 2).toUpperCase();
    els.profileAvatar.innerHTML = "";
    els.profileAvatar.textContent = initials;
    els.profileAvatar.style.background = "purple";
    els.profileAvatar.style.color = "white";
  }

  show(els.profileOverlay);
}

function closeProfileOverlay() { hide(els.profileOverlay); }

// Placeholder handlers
async function logoutProfile() {
  activeProfile = null;
  if (els.profileBtn) els.profileBtn.textContent = ""; // clear initials
  showProfileChooser();
  closeProfileOverlay();
}

// async function deleteProfile() {
//   if (!activeProfile) {
//     alert("No profile selected.");
//     return;
//   }

//   const ok = confirm(`Are you sure you want to delete profile "${activeProfile.displayName}"? This cannot be undone.`);
//   if (!ok) return;

//   try {
//     // Call backend to delete profile
//     const res = await fetch(`${API_PROFILES}/${activeProfile.id}`, {
//       method: "DELETE"
//     });
//     if (!res.ok) throw new Error(await res.text());

//     // Refresh profile list
//     activeProfile = null;
//     hide(els.profileOverlay);
//     show(els.profilePage);
//     await loadProfiles();
//   } catch (e) {
//     console.error("Failed to delete profile:", e);
//     alert("Failed to delete profile.");
//   }
// }
async function deleteProfile() {
  if (!activeProfile) {
    alert("No profile selected.");
    return;
  }

  const ok = confirm(`Are you sure you want to delete profile "${activeProfile.displayName}"? This cannot be undone.`);
  if (!ok) return;

  try {
    const res = await fetch(`${API_PROFILES}/${encodeURIComponent(activeProfile.id)}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) {
      const body = await res.text().catch(()=>"");
      throw new Error(body || res.statusText);
    }

    // Clear client state for deleted profile
    const deletedId = activeProfile.id;
    activeProfile = null;
    try { localStorage.removeItem("musix_activeProfile"); } catch (_) {}

    // Refresh server list and UI
    await loadProfilesFromServer();
    renderProfilesList();

    hide(els.profileOverlay);
    show(els.profilePage);

    alert(`Profile "${deletedId}" deleted.`);
  } catch (e) {
    console.error("Failed to delete profile:", e);
    alert("Failed to delete profile: " + (e.message || e));
  }
}

async function editProfile() {
  if (!activeProfile) return;
  const newName = prompt("Enter new profile name", activeProfile.displayName);
  if (!newName) return;
  try {
    const res = await fetch(API_PROFILES, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeProfile.id, displayName: newName })
    });
    const j = await res.json();
    activeProfile.displayName = j.displayName;
    alert("Profile updated!");
    openProfileOverlay();
  } catch (e) {
    alert("Failed to edit profile: " + e);
  }
}

async function uploadProfilePic() {
  if (!activeProfile) return alert("No active profile selected.");
  try {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";

    fileInput.onchange = async () => {
      const file = fileInput.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("avatar", file);

      await fetch(`/api/profiles/${encodeURIComponent(activeProfile.id)}/avatar`, {
        method: "POST",
        body: formData,
      });

      // Re-fetch profile list and reselect to refresh avatar everywhere
      await loadProfilesFromServer();
      selectProfile(activeProfile.id);
    };

    fileInput.click();
  } catch (err) {
    alert("Failed to upload avatar: " + (err && err.message ? err.message : err));
  }
}

//-------------------------------------------------------------------------
// Tab switching (single implementation)
const tabYoutube = document.getElementById("tabYoutube");
const tabSpotify = document.getElementById("tabSpotify");
const youtubeImportSection = document.getElementById("youtubeImportSection");
const spotifyImportSection = document.getElementById("spotifyImportSection");

function setActiveImportTab(source) {
  if (!tabYoutube || !tabSpotify || !youtubeImportSection || !spotifyImportSection) return;
  if (source === "youtube") {
    tabYoutube.classList.add("active");
    tabSpotify.classList.remove("active");
    youtubeImportSection.classList.remove("hidden");
    spotifyImportSection.classList.add("hidden");
  } else if (source === "spotify") {
    tabYoutube.classList.remove("active");
    tabSpotify.classList.add("active");
    youtubeImportSection.classList.add("hidden");
    spotifyImportSection.classList.remove("hidden");
  }
}
if (tabYoutube) tabYoutube.addEventListener("click", () => setActiveImportTab("youtube"));
if (tabSpotify) tabSpotify.addEventListener("click", () => setActiveImportTab("spotify"));

// Spotify login button (single binding above via safeAssign)
// After page load, check for spotify login redirect / logged-in state
(async function checkSpotifyLoggedInOnLoad() {
  try {
    const r = await fetch("/api/spotify/me", { credentials: "include" });
    if (!r.ok) return; // not logged in
    const user = await r.json();
    if (!user || user.error) return;
    // update UI & load playlists
    onSpotifyLoggedIn(user);
    try {
      const pl = await fetch(`/api/spotify/playlists`, { credentials: "include" }).then(x => x.json());
      renderSpotifyPlaylists(pl);
    } catch (e) {
      console.warn("Failed to fetch spotify playlists on load:", e);
    }
  } catch (e) {
    // not logged in or network error - ignore
  }
})();

function onSpotifyLoggedIn(user) {
  hide(document.getElementById("spotifyAuthSection"));
  show(document.getElementById("spotifyPlaylistsSection"));

  const btn = document.getElementById("spotifyLoginBtn");
  if (btn) {
    btn.textContent = `Logged in: ${user.display_name || user.id || "Spotify"}`;
    btn.classList.add("connected");
    btn.onclick = null;
  }

  // fetch playlists defensively
  fetch("/api/spotify/playlists", { credentials: "include" })
    .then(r => r.json())
    .then(pl => renderSpotifyPlaylists(pl))
    .catch(e => console.warn("Failed to fetch spotify playlists:", e));
}

function renderSpotifyPlaylists(data) {
  const container = document.getElementById("spotifyPlaylists");
  if (!container) return;
  const items = data.items || [];
  if (!items.length) {
    container.innerHTML = "<p>No playlists found.</p>";
    return;
  }
  container.innerHTML = items.map(pl => `
    <div class="result-row">
      <div class="row-title">${pl.name}</div>
      <button class="btn small" onclick="selectSpotifyPlaylist('${pl.id}','${pl.name.replace(/'/g,"\\'")}')">Select</button>
    </div>
  `).join("");
}

// ----------- Init ------------
(async function init(){
  try { hide(els.progressOverlay); setProgress(0, ""); } catch (e) {}
  await loadProfilesFromServer();
  // If a single profile exists, auto-select. Else show chooser.
  if (profiles && profiles.length === 1) {
    selectProfile(profiles[0].id);
  } else {
    showProfileChooser();
  }
})();
