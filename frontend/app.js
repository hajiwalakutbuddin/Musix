const API = "http://localhost:5000/api/music";

let playlists = [];
let active = null;
let tracks = [];
let queue = [];
let currentIndex = -1;

const els = {
  playlistSelect: document.getElementById("playlistSelect"),
  newPlaylist: document.getElementById("newPlaylist"),
  createBtn: document.getElementById("createBtn"),
  importUrl: document.getElementById("importUrl"),
  importName: document.getElementById("importName"),
  importBtn: document.getElementById("importBtn"),
  songUrl: document.getElementById("songUrl"),
  addBtn: document.getElementById("addBtn"),
  downloadPlaylistBtn: document.getElementById("downloadPlaylistBtn"),
  shuffleBtn: document.getElementById("shuffleBtn"),
  nextBtn: document.getElementById("nextBtn"),
  tracks: document.getElementById("tracks"),
  player: document.getElementById("player"),
  nowPlaying: document.getElementById("nowPlaying"),
  activePlaylistName: document.getElementById("activePlaylistName"),
  downloads: document.getElementById("downloads"),
};

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function loadPlaylists() {
  const data = await fetchJSON(`${API}/playlists`);
  playlists = data.names;
  els.playlistSelect.innerHTML = playlists.map(n => `<option value="${n}">${n}</option>`).join("");
  if (playlists.length && !active) {
    active = playlists[0];
    els.playlistSelect.value = active;
    await loadPlaylist(active);
  } else if (!playlists.length) {
    els.tracks.innerHTML = "<p>No playlists yet.</p>";
  }
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
  await loadDownloads();
}

async function importPlaylist() {
  const url = els.importUrl.value.trim();
  const name = els.importName.value.trim();
  if (!url || !name) return alert("Provide URL and name");
  await fetchJSON(`${API}/playlist/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, name })
  });
  els.importUrl.value = "";
  els.importName.value = "";
  await loadPlaylists();
}

async function addSong() {
  const url = els.songUrl.value.trim();
  const name = els.playlistSelect.value;
  if (!url || !name) return alert("Provide URL and choose playlist");
  await fetchJSON(`${API}/playlist/${encodeURIComponent(name)}/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
  els.songUrl.value = "";
  await loadPlaylist(name);
}

async function loadPlaylist(name) {
  active = name;
  const data = await fetchJSON(`${API}/playlist/${encodeURIComponent(name)}`);
  tracks = data.songs;
  queue = [];
  currentIndex = -1;
  els.activePlaylistName.textContent = name;
  renderTracks();
}

function renderTracks() {
  els.tracks.innerHTML = tracks.length
    ? tracks.map((t, i) => `
      <li>
        <span>${t.title}</span>
        <span>
          <button onclick="playIndex(${i})">Play</button>
          <button onclick="addToQueue(${i})">Queue</button>
          <button onclick="downloadSong(${i})">Download</button>
        </span>
      </li>
    `).join("")
    : "<p>No tracks yet.</p>";
}

function playIndex(i) {
  currentIndex = i;
  const song = tracks[i];
  els.player.src = `${API}/stream?url=${encodeURIComponent(song.url)}`;
  els.player.play();
  els.nowPlaying.textContent = `Now playing: ${song.title}`;
}

function addToQueue(i) {
  queue.push(tracks[i]);
  alert("Added to queue");
}

async function downloadSong(index) {
  if (!active) return alert("Select a playlist");
  try {
    const res = await fetchJSON(`${API}/download/song/${encodeURIComponent(active)}/${index}`, { method: "POST" });
    alert(`Saved to server folder: ${res.savedTo}`);
    await loadDownloads();
  } catch (e) {
    alert("Download failed: " + e.message);
  }
}

async function downloadPlaylist() {
  if (!active) return alert("Select a playlist");
  try {
    const res = await fetchJSON(`${API}/playlist/${encodeURIComponent(active)}/download`, { method: "POST" });
    alert(`Downloaded to server folder: ${res.savedTo}`);
    await loadDownloads();
  } catch (e) {
    alert("Download failed: " + e.message);
  }
}

function next() {
  if (queue.length) {
    const song = queue.shift();
    els.player.src = `${API}/stream?url=${encodeURIComponent(song.url)}`;
    els.player.play();
    els.nowPlaying.textContent = `Now playing: ${song.title} (from queue)`;
    return;
  }
  if (!tracks.length) return;
  currentIndex = (currentIndex + 1) % tracks.length;
  playIndex(currentIndex);
}

function shuffle() {
  if (!tracks.length) return;
  const i = Math.floor(Math.random() * tracks.length);
  playIndex(i);
}

async function loadDownloads() {
  const data = await fetchJSON(`${API}/downloads`);
  const base = "http://localhost:5000" + data.base;
  const html = Object.keys(data.downloads).length
    ? Object.entries(data.downloads).map(([pl, files]) => `
        <div class="dl-group">
          <h3>${pl}</h3>
          <ul>
            ${files.map(f => `<li><a href="${base}/${encodeURIComponent(pl)}/${encodeURIComponent(f)}" target="_blank">${f}</a></li>`).join("")}
          </ul>
        </div>
      `).join("")
    : "<p>No downloads yet.</p>";
  els.downloads.innerHTML = html;
}

// events
els.createBtn.onclick = createPlaylist;
els.importBtn.onclick = importPlaylist;
els.addBtn.onclick = addSong;
els.downloadPlaylistBtn.onclick = downloadPlaylist;
els.shuffleBtn.onclick = shuffle;
els.nextBtn.onclick = next;
els.playlistSelect.onchange = e => loadPlaylist(e.target.value);
els.player.onended = next;

// init
loadPlaylists().then(loadDownloads).catch(e => console.error(e));
