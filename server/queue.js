// server/queue.js
// Song queue state. Broadcasts to all connected overlay WebSocket clients and
// mirrors to queue-state.json so a crash or restart mid-stream loses nothing.

const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, '..', 'queue-state.json');
// Only recent state is restored: a mid-stream restart picks up where it left
// off, but yesterday's leftover queue doesn't reappear at the next stream.
const RESTORE_WINDOW_MS = 6 * 60 * 60 * 1000;

let queue = [];
let nowPlaying = null;
let playedSongs = [];
let pending = [];
let clients = new Set();

function restoreState() {
  let saved;
  try { saved = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch (_) { return; }
  if (!(Date.now() - saved.savedAt < RESTORE_WINDOW_MS)) return;
  nowPlaying = saved.nowPlaying || null;
  queue = saved.queue || [];
  playedSongs = saved.playedSongs || [];
  pending = saved.pending || [];
  for (const p of pending) {
    if (p.found && p.found.state === 'searching') p.found = { state: 'failed', code: 'searchInterrupted', error: 'interrupted by a server restart' };
  }
  console.log(`[queue] Restored from before restart: ${queue.length + (nowPlaying ? 1 : 0)} queued, ${pending.length} pending, ${playedSongs.length} played`);
}
restoreState();

function saveState() {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify({ savedAt: Date.now(), nowPlaying, queue, playedSongs, pending }));
  } catch (err) {
    console.error('[queue] Could not save queue-state.json:', err.message);
  }
}

function broadcastState() {
  saveState();
  const state = JSON.stringify({ type: 'state', nowPlaying, queue, playedSongs, pending });
  for (const client of clients) {
    if (client.readyState === 1) client.send(state);
  }
}

// Push dashboard-adjustable display settings (e.g. overlay panel opacity) to all overlay clients
function broadcastSettings(settings) {
  const msg = JSON.stringify({ type: 'settings', ...settings });
  for (const client of clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

function broadcastRaw(msg) {
  const str = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === 1) client.send(str);
  }
}

function registerClient(ws) {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'state', nowPlaying, queue, playedSongs, pending }));
  ws.on('close', () => clients.delete(ws));
}

// `tabs` is the random reward's tab filter, kept so a redraw stays within it.
function addSong({ title, artist, key, requester, isRandom, tabs }) {
  const entry = { title, artist, key: key != null ? String(key) : '', requester, addedAt: Date.now() };
  if (isRandom) entry.isRandom = true;
  if (isRandom && tabs?.length) entry.tabs = tabs;
  if (!nowPlaying) { nowPlaying = entry; }
  else { queue.push(entry); }
  broadcastState();
  return entry;
}

// Add to pending (weak match, no match, or multiple candidates)
function addPending({ title, artist, requester, originalRequest, confidence, candidates }) {
  const entry = {
    title: title || '',
    artist: artist || '',
    requester,
    originalRequest,
    confidence,     // null = no match at all
    candidates: candidates || null,   // array of songs when multiple confident matches exist
    addedAt: Date.now(),
  };
  pending.push(entry);
  broadcastState();
  return entry;
}

// Merge `patch` into a pending entry, if it's still pending (a search finishing after the
// streamer accepted or dismissed the request changes nothing). Returns true if updated.
function updatePending(entry, patch) {
  if (!pending.includes(entry)) return false;
  Object.assign(entry, patch);
  broadcastState();
  return true;
}

// Accept a pending entry → move to queue.
// When candidateIndex is provided, picks from entry.candidates[]; otherwise uses editedTitle/editedArtist.
function acceptPending(index, editedTitle, editedArtist, candidateIndex) {
  if (index < 0 || index >= pending.length) return false;
  const entry = pending.splice(index, 1)[0];

  let title, artist, key;
  if (candidateIndex != null && entry.candidates?.[candidateIndex]) {
    const c = entry.candidates[candidateIndex];
    title = c.title;
    artist = c.artist;
    key = c.key || '';
  } else {
    title = editedTitle || entry.title || entry.originalRequest;
    artist = editedArtist !== undefined ? editedArtist : entry.artist;
    key = entry.key != null ? String(entry.key) : '';
  }

  addSong({ title, artist, key, requester: entry.requester });
  return true;
}

function skipSong() {
  if (nowPlaying) playedSongs.push({ ...nowPlaying, playedAt: Date.now() });
  nowPlaying = queue.length > 0 ? queue.shift() : null;
  broadcastState();
  return nowPlaying;
}

function clearQueue() {
  queue = [];
  nowPlaying = null;
  broadcastState();
}

function getState() {
  return { nowPlaying, queue, playedSongs, pending };
}

function deleteSong(zone, index) {
  if (zone === 'nowPlaying') {
    if (!nowPlaying) return false;
    nowPlaying = queue.length > 0 ? queue.shift() : null;
  } else if (zone === 'queue') {
    if (index < 0 || index >= queue.length) return false;
    queue.splice(index, 1);
  } else if (zone === 'played') {
    if (index < 0 || index >= playedSongs.length) return false;
    playedSongs.splice(index, 1);
  } else if (zone === 'pending') {
    if (index < 0 || index >= pending.length) return false;
    pending.splice(index, 1);
    broadcastState();
    return true;
  } else {
    return false;
  }
  broadcastState();
  return true;
}

function moveSong(fromZone, fromIndex, toZone, toIndex) {
  let song;

  // Extract from source
  if (fromZone === 'nowPlaying') {
    if (!nowPlaying) return false;
    song = nowPlaying;
    nowPlaying = queue.length > 0 ? queue.shift() : null;
  } else if (fromZone === 'queue') {
    if (fromIndex < 0 || fromIndex >= queue.length) return false;
    song = queue.splice(fromIndex, 1)[0];
  } else if (fromZone === 'played') {
    if (fromIndex < 0 || fromIndex >= playedSongs.length) return false;
    song = playedSongs.splice(fromIndex, 1)[0];
  } else if (fromZone === 'pending') {
    if (fromIndex < 0 || fromIndex >= pending.length) return false;
    const p = pending.splice(fromIndex, 1)[0];
    const chosen = p.candidates?.[0];
    song = {
      title: chosen?.title || p.title || p.originalRequest,
      artist: chosen?.artist || p.artist || '',
      key: chosen?.key || p.key || '',
      requester: p.requester,
      addedAt: p.addedAt,
    };
  } else {
    return false;
  }

  // Insert into destination
  if (toZone === 'nowPlaying') {
    if (nowPlaying) queue.unshift(nowPlaying);
    nowPlaying = song;
  } else if (toZone === 'queue') {
    const i = Math.max(0, Math.min(toIndex, queue.length));
    queue.splice(i, 0, song);
  } else if (toZone === 'played') {
    const i = Math.max(0, Math.min(toIndex, playedSongs.length));
    playedSongs.splice(i, 0, song);
  } else if (toZone === 'pending') {
    // Broadcaster dragged a card to pending for editing
    const entry = {
      title: song.title,
      artist: song.artist || '',
      requester: song.requester,
      originalRequest: null,   // no viewer input — manually dragged
      confidence: null,
      candidates: null,
      addedAt: song.addedAt || Date.now(),
    };
    const i = Math.max(0, Math.min(toIndex, pending.length));
    pending.splice(i, 0, entry);
  } else {
    return false;
  }

  broadcastState();
  return true;
}

// Replace a random-picked song in place (for the redraw feature).
function redrawSong(zone, index, newSong) {
  const entry = {
    title: newSong.title,
    artist: newSong.artist || '',
    key: newSong.key != null ? String(newSong.key) : '',
    requester: newSong.requester,
    addedAt: Date.now(),
    isRandom: true,
  };
  if (newSong.tabs?.length) entry.tabs = newSong.tabs;
  if (zone === 'nowPlaying') {
    if (!nowPlaying) return false;
    nowPlaying = entry;
  } else if (zone === 'queue') {
    if (index < 0 || index >= queue.length) return false;
    queue[index] = entry;
  } else {
    return false;
  }
  broadcastState();
  return true;
}

module.exports = {
  registerClient, addSong, addPending, updatePending, acceptPending,
  skipSong, clearQueue, getState, deleteSong, moveSong, redrawSong,
  broadcastSettings, broadcastRaw,
};
