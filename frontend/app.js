// frontend/app.js
const API = "http://localhost:3000/api/music";
const API_PROFILES = "http://localhost:3000/api/profiles";

let playlists = [];
let activePlaylist = null;
let tracks = [];
let activeProfile = null;

const els = {
  playlistList: document.getElementById("playlistList"),
  newPlaylist: document.getElementById("newPlaylist"),
  createPlaylistBtn: document.getElementById("createPlaylistBtn"),
  activePlaylistName: document.getElementById("activePlaylistName"),
  trackList: document.getElementById("trackList"),
  deletePlaylistBtn: document.getElementById("deletePlaylistBtn"),
  profilePage: document.getElementById("profilePage"),
  profilesList: document.getElementById("profilesList"),
  newProfileName: document.getElementById("newProfileName"),
  createProfileBtnProfile: document.getElementById("createProfileBtnProfile"),
};

function show(el) { if (el) el.classList.remove("hidden"); }
function hide(el) { if (el) el.classList.add("hidden"); }

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function loadProfiles() {
  const list = await fetchJSON(API_PROFILES);
  els.profilesList.innerHTML = list.map(p =>
    `<button class="profile-tile" onclick="selectProfile('${p.id}')">${p.displayName}</button>`
  ).join("");
}

async function createProfile() {
  const name = els.newProfileName.value.trim();
  if (!name) return alert("Enter name");
  const res = await fetchJSON(API_PROFILES, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: name })
  });
  selectProfile(res.id);
}

async function selectProfile(id) {
  activeProfile = id;
  hide(els.profilePage);
  await loadPlaylists();
}

async function loadPlaylists() {
  const data = await fetchJSON(`${API}/playlists?profileId=${activeProfile}`);
  playlists = data.names;
  els.playlistList.innerHTML = playlists.map(n =>
    `<li><div class="pl-item-title" onclick="setActive('${n}')">${n}</div></li>`
  ).join("");
}

async function setActive(name) {
  activePlaylist = name;
  els.activePlaylistName.textContent = name;
  const data = await fetchJSON(`${API}/playlist/${activeProfile}/${name}`);
  tracks = data.songs;
  renderTracks();
}

function renderTracks() {
  els.trackList.innerHTML = tracks.map((t, i) => `
    <li class="row">
      <div class="row-title">${t.title}</div>
      <div class="track-actions">
        <button class="btn small" onclick="play('${t.fileUrl}')">Play</button>
        <button class="btn small danger" onclick="deleteTrack('${t.filename}')">❌</button>
      </div>
    </li>
  `).join("");
}

function play(url) {
  const audio = document.getElementById("player");
  audio.src = url;
  audio.play();
}

async function createPlaylist() {
  const name = els.newPlaylist.value.trim();
  if (!name) return alert("Enter name");
  await fetchJSON(`${API}/playlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId: activeProfile, name })
  });
  els.newPlaylist.value = "";
  await loadPlaylists();
}

async function deleteTrack(filename) {
  await fetchJSON(`${API}/playlist/${activeProfile}/${activePlaylist}/song`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename })
  });
  await setActive(activePlaylist);
}

window.createProfile = createProfile;
window.selectProfile = selectProfile;
window.createPlaylist = createPlaylist;
window.setActive = setActive;
window.deleteTrack = deleteTrack;

// init
(async function init() {
  await loadProfiles();
  show(els.profilePage);
})();
