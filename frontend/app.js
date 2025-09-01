// frontend/app.js
const API = (location.protocol + "//" + location.host) + "/api";

let playlists = [];
let active = null;
let tracks = [];
let queue = [];
let currentIndex = -1;

// Elements - note IDs match index.html
const els = {
  playlistList: document.getElementById("playlistList"),
  newPlaylist: document.getElementById("newPlaylist"),
  createPlaylistBtn: document.getElementById("createPlaylistBtn"),

  songsSection: document.getElementById("songs"),
  trackList: document.getElementById("trackList"),
  backToPlaylists: document.getElementById("backToPlaylists"),
  songsTitle: document.getElementById("songsTitle"),

  // search/import overlays
  searchBtn: document.getElementById("searchBtn"),
  importBtn: document.getElementById("importBtn"),
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

  // progress
  progressOverlay: document.getElementById("progressOverlay"),
  progressBar: document.getElementById("progressBar"),
  progressText: document.getElementById("progressText"),
};

function show(el){ if(el) el.classList.remove("hidden"); }
function hide(el){ if(el) el.classList.add("hidden"); }

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    const text = await r.text();
    // try parse JSON for nice message
    try {
      const j = JSON.parse(text);
      throw new Error(JSON.stringify(j));
    } catch (_) {
      throw new Error(text || `${r.status} ${r.statusText}`);
    }
  }
  return r.json();
}

// Playlists
async function loadPlaylists() {
  const data = await fetchJSON(`${API}/playlists`);
  playlists = data.names || [];
  renderPlaylists();
  if (!active && playlists.length) {
    await setActive(playlists[0]);
  } else {
    // hide songs view
    hide(els.songsSection);
  }
}

async function setActive(name) {
  active = name;
  els.songsTitle.textContent = `Songs — ${name}`;
  await loadPlaylistTracks(name);
  show(els.songsSection);
}

function renderPlaylists() {
  els.playlistList.innerHTML = playlists.map(n => `
    <li>
      <div class="pl-item-title">${n}</div>
      <div class="pl-item-actions">
        <button class="btn small" data-open="${n}">Open</button>
        <button class="btn small danger" data-delete="${n}">Delete</button>
      </div>
    </li>
  `).join("");

  // attach handlers (avoid inline onclick)
  Array.from(els.playlistList.querySelectorAll("[data-open]")).forEach(btn => {
    btn.onclick = () => setActive(btn.getAttribute("data-open"));
  });
  Array.from(els.playlistList.querySelectorAll("[data-delete]")).forEach(btn => {
    btn.onclick = () => deletePlaylist(btn.getAttribute("data-delete"));
  });
}

async function createPlaylist() {
  const name = (els.newPlaylist.value || "").trim();
  if (!name) return alert("Enter a playlist name");
  await fetchJSON(`${API}/playlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  els.newPlaylist.value = "";
  await loadPlaylists();
}

async function deletePlaylist(name) {
  if (!confirm(`Delete playlist "${name}"?`)) return;
  await fetchJSON(`${API}/playlist/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (active === name) active = null;
  await loadPlaylists();
  hide(els.songsSection);
}

// playlist tracks
async function loadPlaylistTracks(name) {
  try {
    const data = await fetchJSON(`${API}/playlist/${encodeURIComponent(name)}`);
    tracks = data.songs || [];
    renderTracks();
  } catch (e) {
    console.error(e);
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
      <div class="pl-item-actions">
        <button class="btn small" data-play="${i}">Play</button>
        <button class="btn small danger" data-delete="${t.filename}">Delete</button>
      </div>
    </li>
  `).join("");

  Array.from(els.trackList.querySelectorAll("[data-play]")).forEach(b => {
    b.onclick = () => playIndex(Number(b.getAttribute("data-play")));
  });
  Array.from(els.trackList.querySelectorAll("[data-delete]")).forEach(b => {
    b.onclick = () => deleteTrack(b.getAttribute("data-delete"));
  });
}

async function deleteTrack(filename) {
  if (!active) return;
  if (!confirm(`Delete "${filename}"?`)) return;
  await fetchJSON(`${API}/playlist/${encodeURIComponent(active)}/song`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename })
  });
  await loadPlaylistTracks(active);
}

// minimal player behavior: open audio in new tab (simple)
function playIndex(i) {
  const s = tracks[i];
  if (!s) return;
  // open the file URL in a new tab or play with HTMLAudio if you add a player
  window.open(s.fileUrl, "_blank");
}

// -------- Search & Import --------
function openSearch() { show(els.searchPage); }
function closeSearch() { hide(els.searchPage); els.searchResults.innerHTML = ""; if(els.searchQuery) els.searchQuery.value=""; }

async function doSearch() {
  const q = (els.searchQuery?.value || "").trim();
  if (!q) return;
  try {
    const data = await fetchJSON(`${API}/search?q=${encodeURIComponent(q)}`);
    if (!data.results?.length) { els.searchResults.innerHTML = "<p>No results</p>"; return; }
    els.searchResults.innerHTML = data.results.map(r => `
      <div class="result-row">
        <div class="row-title">${r.title}</div>
        <div><button class="btn small" data-download="${r.id}">Download</button></div>
      </div>
    `).join("");
    Array.from(els.searchResults.querySelectorAll("[data-download]")).forEach(b => {
      b.onclick = () => downloadSongFromSearch(b.getAttribute("data-download"));
    });
  } catch (e) {
    alert("Search failed: " + e.message);
  }
}

async function downloadSongFromSearch(videoId) {
  if (!active) return alert("Select a playlist first.");
  try {
    const { jobId } = await fetchJSON(`${API}/download/song`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ playlist: active, videoId })
    });
    await trackJob(jobId);
    await loadPlaylistTracks(active);
  } catch (e) {
    alert("Download failed: " + e.message);
  }
}

// Import preview & download
function openImport() { show(els.importPage); }
function closeImport() { hide(els.importPage); els.importResults.innerHTML = ""; if(els.importUrl) els.importUrl.value=""; }

let importPreview = [];

async function importPreviewFetch() {
  const url = (els.importUrl?.value || "").trim();
  if (!url) return alert("Enter playlist URL");
  try {
    const data = await fetchJSON(`${API}/import/preview`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url })
    });
    importPreview = data.results || [];
    if (!importPreview.length) { els.importResults.innerHTML = "<p>No items found</p>"; return; }
    els.importResults.innerHTML = importPreview.map(r => `
      <div class="import-row">
        <label style="display:flex; gap:8px; align-items:center;">
          <input type="checkbox" class="import-check" value="${r.id}" checked />
          <span>${r.title}</span>
        </label>
      </div>
    `).join("");
  } catch (e) {
    alert("Preview failed: " + e.message);
  }
}

async function importDownloadSelected() {
  if (!active) return alert("Select a playlist first.");
  const checks = Array.from(document.querySelectorAll(".import-check") || []);
  const ids = checks.filter(c => c.checked).map(c => c.value);
  if (!ids.length) return alert("Select at least one track.");
  try {
    const { jobId } = await fetchJSON(`${API}/import/download`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ name: active, selectedIds: ids })
    });
    await trackJob(jobId);
    await loadPlaylistTracks(active);
  } catch (e) {
    alert("Import download failed: " + e.message);
  }
}

// ---------- progress overlay ----------
function setProgress(pct, text) {
  try { if (els.progressBar) els.progressBar.style.width = `${Math.max(0, Math.min(100, pct||0))}%`; if (els.progressText && text !== undefined) els.progressText.textContent = text; } catch (e){}
}

async function trackJob(jobId) {
  if (!jobId) return;
  show(els.progressOverlay);
  try {
    while (true) {
      const j = await fetchJSON(`${API}/progress/${jobId}`);
      setProgress(j.percent || 1, j.message || "");
      if (j.status === "done") break;
      if (j.status === "error") throw new Error(j.message || "Job error");
      await new Promise(r => setTimeout(r, 700));
    }
  } catch (e) {
    alert("Job error: " + (e.message || e));
  } finally {
    hide(els.progressOverlay);
    setProgress(0, "");
  }
}

// events binding
if (els.createPlaylistBtn) els.createPlaylistBtn.onclick = createPlaylist;
if (els.backToPlaylists) els.backToPlaylists.onclick = () => { hide(els.songsSection); };
if (els.searchBtn) els.searchBtn.onclick = openSearch;
if (els.importBtn) els.importBtn.onclick = openImport;
if (els.backFromSearch) els.backFromSearch.onclick = closeSearch;
if (els.searchDoBtn) els.searchDoBtn.onclick = doSearch;
if (els.searchQuery) els.searchQuery.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });
if (els.importPreviewBtn) els.importPreviewBtn.onclick = importPreviewFetch;
if (els.importDownloadSelected) els.importDownloadSelected.onclick = importDownloadSelected;
if (els.backFromImport) els.backFromImport.onclick = closeImport;

// init
(async function init(){
  hide(els.progressOverlay);
  await loadPlaylists();
})();
