// server/queue.js
// In-memory song queue. Broadcasts state to all connected overlay WebSocket clients.

let queue = [];
let nowPlaying = null;
let playedSongs = [];
let pending = [];
let clients = new Set();

function broadcastState() {
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

function registerClient(ws) {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'state', nowPlaying, queue, playedSongs, pending }));
  ws.on('close', () => clients.delete(ws));
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.cmd === 'skip') skipSong();
      if (msg.cmd === 'clear') clearQueue();
      if (msg.cmd === 'refresh') broadcastState();
    } catch (_) {}
  });
}

function addSong({ title, artist, key, requester }) {
  const entry = { title, artist, key: key != null ? String(key) : '', requester, addedAt: Date.now() };
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
  } else {
    return false;
  }

  broadcastState();
  return true;
}

module.exports = {
  registerClient, addSong, addPending, acceptPending,
  skipSong, clearQueue, getState, deleteSong, moveSong,
  broadcastSettings,
};
