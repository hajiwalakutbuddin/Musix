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
//--------------------------------------------
// --- Spotify helper state ---
let spotifyTracks = [];            // [{ id: spotifyTrackId, title: "Song — Artist" }, ...]
let spotifyCurrentPlaylistId = ""; // spotify playlist id for import
let spotifyCurrentPlaylistName = ""; // playlist name for import

//-----------------------------------
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

  // Failed downloads overlay
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

// ---------- Profiles (server-backed) ----------
let profiles = [];
let activeProfile = null; // { id, displayName, stayLoggedIn }

/* DOM pointers for profile chooser (populated after DOM) */
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

// async function loadProfilesFromServer() {
//   try {
//     const r = await fetch(API_PROFILES);
//     profiles = await r.json();
//   } catch (e) { profiles = []; }
// }
async function loadProfilesFromServer() {
  try {
    const r = await fetch(API_PROFILES);
    profiles = await r.json();
    // normalize: ensure avatarUrl exists (server now provides it)
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

// function selectProfile(id) {
//   // ensure profiles list is current
//   // (if profiles were loaded previously this is quick)
//   const p = profiles.find(x => x.id === id);
//   if (!p) {
//     alert("Profile not found");
//     return;
//   }

//   activeProfile = p;

//   // Update navbar profile circle (outside)
//   if (els.profileBtn) {
//     // make sure it's a button and clickable
//     els.profileBtn.innerHTML = ""; // reset
//     els.profileBtn.style.background = "";
//     els.profileBtn.style.color = "";
//     els.profileBtn.classList.remove("has-avatar");

//     if (p.avatarUrl) {
//       // show image
//       const img = document.createElement("img");
//       img.src = p.avatarUrl;
//       img.style.width = "100%";
//       img.style.height = "100%";
//       img.style.objectFit = "cover";
//       img.style.borderRadius = "50%";
//       els.profileBtn.appendChild(img);
//       els.profileBtn.classList.add("has-avatar");
//     } else {
//       // show initials
//       const initials = (p.displayName || p.id || "?").trim().slice(0, 2).toUpperCase();
//       els.profileBtn.textContent = initials;
//       els.profileBtn.style.background = "purple";
//       els.profileBtn.style.color = "white";
//     }

//     // Ensure clicking the circle opens the overlay
//     els.profileBtn.onclick = openProfileOverlay;
//   }

//   // persist active profile id so page reload keeps selection
//   try { localStorage.setItem("musix_activeProfile", activeProfile.id); } catch (e) {}

//   // Close chooser UI and refresh profile-scoped data
//   closeProfileChooser();
//   (async () => { await loadPlaylists(); await loadDownloads(); })();
// }
  // load playlists and downloads for this profile
  // (async () => { 
  //   await loadPlaylists(); 
  //   await loadDownloads(); 
  // })();
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


/* expose to inline HTML (profile tiles) */
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


function renderTracks() {
  if (!tracks.length) {
    els.trackList.innerHTML = `<li class="row"><div class="row-title">No downloaded tracks yet.</div></li>`;
    return;
  }
  els.trackList.innerHTML = tracks.map((t, i) => `
    <li class="row">
      <div class="row-title">${t.title}</div>
      <div class="track-actions">
        <button class="btn small" onclick="playIndex(${i})">Play</button>
        <button class="btn queue" onclick="queueTrack(${i})">Queue</button>
        <button class="btn small danger" onclick="deleteTrack('${t.filename.replace(/'/g,"\\'")}')">❌</button>
      </div>
    </li>
  `).join("");
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

// async function importDownloadSelected() {
//   if (!active) return alert("Select a playlist first from the left sidebar.");
//   const checks = Array.from(document.querySelectorAll(".import-check"));
//   const ids = checks.filter(c => c.checked).map(c => c.value);
//   if (!ids.length) return alert("Select at least one track.");
//   const url = els.importUrl.value.trim();
//   if (!url) return alert("Missing original import URL.");

//   try {
//     const { jobId } = await fetchJSON(`${API}/import/download`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         profileId: activeProfile?.id,
//         name: active,
//         selectedIds: ids,
//         url   // 👈 send url for title fallback
//       })
//     });
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
//   }
// }
async function importDownloadSelected() {
  if (!active) return alert("Select a playlist first from the left sidebar.");
  const checks = Array.from(document.querySelectorAll(".import-check"));
  const ids = checks.filter(c => c.checked).map(c => c.value);
  if (!ids.length) return alert("Select at least one track.");

  // Helper to test likely YouTube id (11 chars typical)
  const isYouTubeId = (s) => /^[A-Za-z0-9_-]{11}$/.test(s);

  // If ids are youtube ids, just call backend directly
  let videoIds = [];
  if (ids.every(isYouTubeId)) {
    videoIds = ids;
  } else {
    // We assume they are Spotify track ids -> map each to a YouTube video id
    if (!spotifyTracks || !spotifyTracks.length) {
      return alert("No Spotify track data available. Re-open the playlist before importing.");
    }

    // Build a map of spotifyId -> search query (title string we stored earlier)
    const idToQuery = {};
    for (const t of spotifyTracks) idToQuery[t.id] = t.title;

    videoIds = [];
    // sequential mapping (keeps load predictable); can be parallelized if desired
    for (const sid of ids) {
      const q = idToQuery[sid] || sid;
      try {
        const searchRes = await fetchJSON(`${API}/search?q=${encodeURIComponent(q)}`);
        const top = (searchRes.results || [])[0];
        if (top && top.id) {
          videoIds.push(top.id);
        } else {
          // push a placeholder so import knows one failed; we'll remove later
          console.warn("No search result for", q);
        }
        // small pause to avoid hammering
        await new Promise(r => setTimeout(r, 250));
      } catch (e) {
        console.warn("Search failed for", q, e);
      }
    }

    if (!videoIds.length) return alert("Could not find any YouTube matches for the selected tracks.");
  }

  // finally call import/download backend
  try {
    // use spotify playlist url as "url" param so backend can prefetch titles if needed
    const playlistUrl = spotifyCurrentPlaylistId ? `spotify:playlist:${spotifyCurrentPlaylistId}` : (els.importUrl?.value || "");
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

    const jobResult = await trackJob(jobId);
    await loadPlaylistTracks(active);
    await loadDownloads();
    if (jobResult && jobResult.failed && jobResult.failed.length) {
      setUndownloaded(jobResult.failed);
      showUndownloadedPage();
    }
    // close import UI
    closeImport();
  } catch (e) {
    console.error("Import download failed:", e);
    alert("Import download failed: " + (e.message || e));
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
//-----------New undownloaded page-----------
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

function renderUndownloaded() {
  const container = document.getElementById("undownloadedResults");
  if (!container) return;
  if (!lastUndownloaded.length) {
    container.innerHTML = "<p>No undownloaded songs from last import.</p>";
    return;
  }
  container.innerHTML = lastUndownloaded.map((s, idx) => `
    <div class="undl-row" id="undl-row-${idx}">
      <div class="undl-title">${s.title || s.id}</div>
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


window.searchUndlSong = async function(idx) {
  const song = lastUndownloaded[idx];
  const resultsDiv = document.getElementById(`undl-search-results-${idx}`);
  if (!song || !resultsDiv) return;
  resultsDiv.classList.remove("hidden");
  resultsDiv.innerHTML = "<p>Searching...</p>";
  try {
    const data = await fetchJSON(`${API}/search?q=${encodeURIComponent(song.title || song.id)}`);
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

// ----------- Events binding ------------
function safeAssign(el, fn) { if (el) el.onclick = fn; }

safeAssign(els.createPlaylistBtn, createPlaylist);

safeAssign(els.deletePlaylistBtn, () => { if (active) deletePlaylist(active); });

safeAssign(els.openSearch, openSearch);
safeAssign(els.backFromSearch, closeSearch);
//---------------------------------------------------------------
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
      <button class="btn small" onclick="selectSpotifyPlaylist('${pl.id}','${pl.name.replace(/'/g,"\\'")}')">Select</button>
    </div>
  `).join("");
});

//---------------------------------------------------------------
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
// Make navbar profile button open the overlay
safeAssign(document.getElementById("profileButton"), () => {
  show(document.getElementById("profileOverlay"));
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
// function openProfileOverlay() {
//   if (!activeProfile) return alert("No active profile selected.");
//   els.profileOverlayName.textContent = activeProfile.displayName || activeProfile.id;

//   // Avatar: use picture if available (todo: backend support), else initials
//   if (activeProfile.avatarUrl) {
//     els.profileAvatar.innerHTML = `<img src="${activeProfile.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
//   } else {
//     const initials = (activeProfile.displayName || activeProfile.id || "?")
//       .trim()
//       .slice(0, 2)
//       .toUpperCase();
//     els.profileAvatar.textContent = initials;
//     els.profileAvatar.style.background = "purple";
//     els.profileAvatar.style.color = "white";
//   }


//   show(els.profileOverlay);
// }

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

// async function uploadProfilePic() {
//   if (!activeProfile) return alert("Select a profile first.");
//   const fileInput = document.createElement("input");
//   fileInput.type = "file";
//   fileInput.accept = "image/*";
//   fileInput.onchange = async () => {
//     const file = fileInput.files[0];
//     if (!file) return;
//     const fd = new FormData();
//     fd.append("avatar", file);
//     try {
//       const res = await fetch(`${API_PROFILES}/${activeProfile.id}/avatar`, {
//         method: "POST",
//         body: fd
//       });
//       if (!res.ok) throw new Error(await res.text());
//       const j = await res.json();
//       // update activeProfile and both UI places
//       activeProfile.avatarUrl = j.avatarUrl;
//       // update overlay avatar
//       els.profileAvatar.innerHTML = `<img src="${activeProfile.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
//       // update navbar avatar
//       if (els.profileBtn) {
//         els.profileBtn.innerHTML = `<img src="${activeProfile.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
//         els.profileBtn.style.background = "";
//         els.profileBtn.style.color = "";
//       }
//       alert("Avatar uploaded!");
//       openProfileOverlay();
//     } catch (e) {
//       alert("Failed to upload avatar: " + String(e));
//     }
//   };
//   fileInput.click();
// }
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
    alert("Failed to upload avatar: " + err.message);
  }
}


//-------------------------------------------------------------------------
// Tab switching
const tabYoutube = document.getElementById("tabYoutube");
const tabSpotify = document.getElementById("tabSpotify");
const youtubeImportSection = document.getElementById("youtubeImportSection");
const spotifyImportSection = document.getElementById("spotifyImportSection");

function showYoutubeImport() {
  tabYoutube.classList.add("active");
  tabSpotify.classList.remove("active");
  youtubeImportSection.classList.remove("hidden");
  spotifyImportSection.classList.add("hidden");
}

function showSpotifyImport() {
  tabSpotify.classList.add("active");
  tabYoutube.classList.remove("active");
  spotifyImportSection.classList.remove("hidden");
  youtubeImportSection.classList.add("hidden");
}

tabYoutube.addEventListener("click", showYoutubeImport);
tabSpotify.addEventListener("click", showSpotifyImport);

// Spotify login
document.getElementById("spotifyLoginBtn").addEventListener("click", () => {
  window.location.href = "/api/spotify/login";
});
//--------------------------------------------------------------------------
// --- Import overlay logic ---
const elsImport = {
  page: document.getElementById("importPage"),
  importBtn: document.getElementById("importBtn"),
  backBtn: document.getElementById("backFromImport"),
  youtubeSection: document.getElementById("youtubeImportSection"),
  spotifySection: document.getElementById("spotifyImportSection"),
  tabYoutube: document.getElementById("tabYoutube"),
  tabSpotify: document.getElementById("tabSpotify"),
  spotifyLoginBtn: document.getElementById("spotifyLoginBtn"),
  spotifyPlaylistsSection: document.getElementById("spotifyPlaylistsSection"),
  spotifyPublicSection: document.getElementById("spotifyPublicSection"),
  spotifyPlaylists: document.getElementById("spotifyPlaylists"),
  spotifySearchInput: document.getElementById("spotifySearchInput"),
  spotifySearchBtn: document.getElementById("spotifySearchBtn"),
  spotifySearchResults: document.getElementById("spotifySearchResults"),
};

// Open Import overlay
elsImport.importBtn.addEventListener("click", () => {
  elsImport.page.classList.remove("hidden");
  // Default to YouTube tab
  setActiveImportTab("youtube");
});

// Back button
if (elsImport.backBtn) {
  elsImport.backBtn.addEventListener("click", () => {
    elsImport.page.classList.add("hidden");
  });
}

// Switch tabs
function setActiveImportTab(source) {
  if (source === "youtube") {
    elsImport.tabYoutube.classList.add("active");
    elsImport.tabSpotify.classList.remove("active");
    elsImport.youtubeSection.classList.remove("hidden");
    elsImport.spotifySection.classList.add("hidden");
  } else if (source === "spotify") {
    elsImport.tabYoutube.classList.remove("active");
    elsImport.tabSpotify.classList.add("active");
    elsImport.youtubeSection.classList.add("hidden");
    elsImport.spotifySection.classList.remove("hidden");
  }
}
elsImport.tabYoutube.addEventListener("click", () => setActiveImportTab("youtube"));
elsImport.tabSpotify.addEventListener("click", () => setActiveImportTab("spotify"));

// Spotify login
elsImport.spotifyLoginBtn.addEventListener("click", () => {
  window.location.href = "/api/spotify/login";
});
//--------------------------------------------------------------------------
// place near other safeAssign(...) lines where you wire UI buttons
const spotifyLoginBtn = document.getElementById("spotifyLoginBtn");
if (spotifyLoginBtn) {
  spotifyLoginBtn.onclick = () => {
    // navigate in the same tab so Spotify auth returns to the same tab
    window.location = "/api/spotify/login";
  };
}
//--------------------------------------------------------------------------
// After page load, check for spotify login redirect token
// Detect Spotify login redirect
// On load: check if user is already logged in to Spotify
(async function checkSpotifyLoggedInOnLoad() {
  try {
    const r = await fetch("/api/spotify/me", { credentials: "include" });
    if (!r.ok) return; // not logged in
    const user = await r.json();
    if (!user || user.error) return;
    // update UI & load playlists
    onSpotifyLoggedIn(user);
    // fetch first page of playlists (server endpoint will paginate if needed)
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



//--------------------------------------------------------------------
function onSpotifyLoggedIn(user) {
  hide(document.getElementById("spotifyAuthSection"));
  show(document.getElementById("spotifyPlaylistsSection"));

  const btn = document.getElementById("spotifyLoginBtn");
  if (btn) {
    btn.textContent = `Logged in: ${user.display_name || user.id || "Spotify"}`;
    btn.classList.add("connected");
    // optionally disable clicking to avoid re-login
    btn.onclick = null;
  }

  // fetch playlists (defensive)
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

window.selectSpotifyPlaylist = async function(id, name) {
  try {
    spotifyCurrentPlaylistId = id;
    spotifyCurrentPlaylistName = name;
    const res = await fetchJSON(`/api/spotify/playlists/${encodeURIComponent(id)}/tracks`, { credentials: "include" });
    const items = res.items || [];
    // create friendly titles "Song — Artist1, Artist2"
    spotifyTracks = items.map(it => {
      const t = it.track || it; // defensive depending on API shape
      const title = `${t.name} — ${(t.artists||[]).map(a=>a.name).join(", ")}`;
      return { id: t.id, title };
    });

    // render checkboxes for import selection
    const box = document.getElementById("importResults");
    if (!box) return;
    box.innerHTML = spotifyTracks.map(r => `
      <div class="import-row">
        <label style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" class="import-check" value="${r.id}" checked />
          <span>${r.title}</span>
        </label>
      </div>
    `).join("");

    show(document.getElementById("importResults"));
    // ensure import panel shows Spotify section
    setActiveImportTab("spotify");
    // scroll to importResults so user sees checkboxes
    document.getElementById("importResults").scrollIntoView({ behavior: "smooth", block: "start" });

  } catch (e) {
    console.error("Failed to fetch Spotify playlist tracks:", e);
    alert("Failed to load playlist tracks: " + (e.message || e));
  }
};


//-------------------------------------------------------------------------

// ----------- Init ------------
(async function init(){
  try { hide(els.progressOverlay); setProgress(0, ""); } catch (e) {}
  // load previously saved profiles & active
  await loadProfilesFromServer();
  // if one profile exists and user didn't explicitly want chooser, auto-select first
  const stored = null; // we don't auto persist server-side; keep in-memory selection
  if (profiles && profiles.length === 1) {
    selectProfile(profiles[0].id);
  } else {
    // Force profile selection before loading playlists
    showProfileChooser();
  }
})();

