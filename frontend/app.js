// frontend/app.js
const API = "http://localhost:5000/api";

let playlists = [];
let active = null;
let tracks = []; // downloaded, filtered from backend
let queue = [];
let currentIndex = -1;

// Elements
const els = {
  playlistList: document.getElementById("playlistList"),
  newPlaylist: document.getElementById("newPlaylist"),
  createPlaylistBtn: document.getElementById("createPlaylistBtn"),

  activePlaylistName: document.getElementById("activePlaylistName"),
  playBtn: document.getElementById("playBtn"),
  shuffleBtn: document.getElementById("shuffleBtn"),
  nextBtn: document.getElementById("nextBtn"),
  deletePlaylistBtn: document.getElementById("deletePlaylistBtn"),

  trackList: document.getElementById("trackList"),

  downloads: document.getElementById("downloads"),
  player: document.getElementById("player"),
  nowPlaying: document.getElementById("nowPlaying"),

  // Navbar overlays
  openSearch: document.getElementById("openSearch"),
  openImport: document.getElementById("openImport"),
  searchPage: document.getElementById("searchPage"),
  backFromSearch: document.getElementById("backFromSearch"),
  searchQuery: document.getElementById("searchQuery"),
  searchBtn: document.getElementById("searchBtn"),
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

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ----------- Playlists ------------

async function loadPlaylists() {
  const data = await fetchJSON(`${API}/playlists`);
  playlists = data.names;
  renderPlaylists();
  if (!active && playlists.length) {
    await setActive(playlists[0]);
  }
}

async function setActive(name) {
  active = name;
  els.activePlaylistName.textContent = name || "No Playlist";
  await loadPlaylistTracks(name);
}

function renderPlaylists() {
  els.playlistList.innerHTML = playlists.map(n => `
    <li>
      <div class="pl-item-title">${n}</div>
      <div class="pl-item-actions">
        <button class="btn small" onclick="setActive('${n.replace(/'/g,"\\'")}')">Open</button>
        <button class="btn small danger" onclick="deletePlaylist('${n.replace(/'/g,"\\'")}')">Delete</button>
      </div>
    </li>
  `).join("");
}

async function createPlaylist() {
  const name = els.newPlaylist.value.trim();
  if (!name) return alert("Enter name");
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
  await loadDownloads();
  els.trackList.innerHTML = "";
  els.activePlaylistName.textContent = "No Playlist";
}

async function loadPlaylistTracks(name) {
  const data = await fetchJSON(`${API}/playlist/${encodeURIComponent(name)}`);
  tracks = data.songs || [];
  queue = [];
  currentIndex = -1;
  renderTracks();
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
        <button class="btn small" onclick="playIndex(${i})">Play</button>
        <button class="btn small danger" onclick="deleteTrack('${t.filename.replace(/'/g,"\\'")}')">❌</button>
      </div>
    </li>
  `).join("");
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
  await loadDownloads();
}

// ----------- Player (downloaded files only) ------------

function playFile(url, title) {
  els.player.src = url;
  els.player.play().catch(() => {});
  els.nowPlaying.textContent = `Now playing: ${title}`;
}

function playIndex(i) {
  currentIndex = i;
  const s = tracks[i];
  playFile(s.fileUrl, s.title);
}

function next() {
  if (!tracks.length) return;
  currentIndex = (currentIndex + 1) % tracks.length;
  playIndex(currentIndex);
}

function shuffle() {
  if (!tracks.length) return;
  const i = Math.floor(Math.random() * tracks.length);
  playIndex(i);
}

// ----------- Downloads pane (right) ------------

async function loadDownloads() {
  const data = await fetchJSON(`${API}/downloads`);
  const base = "http://localhost:5000" + data.base;

  const html = Object.keys(data.downloads).length
    ? Object.entries(data.downloads).map(([pl, files]) => `
        <div class="dl-group">
          <h3>${pl}</h3>
          <ul>
            ${files.map(f => `
              <li>
                <button class="link-btn" onclick="playFile('${base}/${encodeURIComponent(pl)}/${encodeURIComponent(f.filename)}','${(f.filename || "").replace(/'/g,"\\'")}')">
                  ${f.filename}
                </button>
              </li>
            `).join("")}
          </ul>
        </div>
      `).join("")
    : "<p>No downloads yet.</p>";

  els.downloads.innerHTML = html;
}

// ----------- Search & Download flow ------------

function openSearch() { show(els.searchPage); }
function closeSearch() { hide(els.searchPage); els.searchResults.innerHTML=""; els.searchQuery.value=""; }

async function doSearch() {
  const q = els.searchQuery.value.trim();
  if (!q) return;
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
}

async function downloadSongFromSearch(videoId) {
  if (!active) return alert("Select a playlist first from the left sidebar.");
  const { jobId } = await fetchJSON(`${API}/download/song`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ playlist: active, videoId })
  });
  await trackJob(jobId);
  await loadPlaylistTracks(active);
  await loadDownloads();
}

// ----------- Import playlist (preview -> choose -> download selected) -----

function openImport() { show(els.importPage); }
function closeImport() { hide(els.importPage); els.importResults.innerHTML=""; els.importUrl.value=""; }

let importPreview = []; // cache to know selected ids

async function importPreviewFetch() {
  const url = els.importUrl.value.trim();
  if (!url) return;
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
}

async function importDownloadSelected() {
  if (!active) return alert("Select a playlist first from the left sidebar.");
  const checks = Array.from(document.querySelectorAll(".import-check"));
  const ids = checks.filter(c => c.checked).map(c => c.value);
  if (!ids.length) return alert("Select at least one track.");

  const { jobId } = await fetchJSON(`${API}/import/download`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ name: active, selectedIds: ids })
  });
  await trackJob(jobId);
  await loadPlaylistTracks(active);
  await loadDownloads();
}

// ----------- Progress overlay ------------

// Set bar & text safely
function setProgress(pct, text) {
  try {
    if (els.progressBar) els.progressBar.style.width = `${Math.max(0, Math.min(100, pct || 0))}%`;
    if (els.progressText && text !== undefined) els.progressText.textContent = text;
  } catch (e) { /* ignore DOM errors */ }
}

// Poll progress — only show overlay after first successful poll to avoid showing at startup
async function trackJob(jobId) {
  if (!jobId) return;
  let shown = false;
  try {
    while (true) {
      // Fetch progress
      let j;
      try {
        j = await fetchJSON(`${API}/progress/${jobId}`);
      } catch (err) {
        // if backend returns 404 or error, stop and ensure overlay hidden
        hide(els.progressOverlay);
        setProgress(0, "");
        return;
      }

      // On first successful fetch, show overlay
      if (!shown) {
        show(els.progressOverlay);
        shown = true;
      }

      setProgress(j.percent || 1, j.message || "");

      if (j.status === "done") break;
      if (j.status === "error") throw new Error(j.message || "Job failed");

      // wait
      await new Promise(r => setTimeout(r, 700));
    }
  } catch (e) {
    console.error("Job tracking error:", e);
    alert("Download failed: " + (e.message || e));
  } finally {
    hide(els.progressOverlay);
    setProgress(0, "");
  }
}

// ----------- Events ------------

els.createPlaylistBtn.onclick = createPlaylist;

els.playBtn.onclick = () => { if (tracks.length) playIndex(0); };
els.shuffleBtn.onclick = shuffle;
els.nextBtn.onclick = next;
els.deletePlaylistBtn.onclick = () => { if (active) deletePlaylist(active); };

els.player.onended = next;

// Search
els.openSearch.onclick = openSearch;
els.backFromSearch.onclick = closeSearch;
els.searchBtn.onclick = doSearch;
if (els.searchQuery) els.searchQuery.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });

// Import
els.openImport.onclick = openImport;
els.backFromImport.onclick = closeImport;
els.importPreviewBtn.onclick = importPreviewFetch;
els.importDownloadSelected.onclick = importDownloadSelected;

// ----------- Init ------------
(async function init(){
  // Ensure overlay is hidden at startup and progress reset
  try { hide(els.progressOverlay); setProgress(0, ""); } catch(e){}

  await loadPlaylists();
  await loadDownloads();
})();
