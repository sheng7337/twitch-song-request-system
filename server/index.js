// server/index.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const { startAutoRefresh } = require('./sheets');
const { matchSong } = require('./matcher');
const { registerClient, addSong, addPending, acceptPending, skipSong, clearQueue, getState, deleteSong, moveSong } = require('./queue');
const { connect: connectTwitch, setEventHandler } = require('./twitch');
const { init: initHistory, recordRequest, getHistory } = require('./history');
const { pickRandom } = require('./random');
const setupRouter = require('./setup-routes');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ── Body parser ───────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const buf = Buffer.concat(chunks);
    req.rawBody = buf.toString('utf8');
    try { req.body = JSON.parse(buf.toString('utf8')); } catch (_) { req.body = {}; }
    next();
  });
});

// ── Setup API routes (must be before static middleware) ───────────────────────
app.use('/setup/api', setupRouter);

// ── Static files ──────────────────────────────────────────────────────────────
app.use('/overlay', express.static(path.join(__dirname, '..', 'overlay')));
app.use('/dashboard', express.static(path.join(__dirname, '..', 'dashboard')));
app.use('/setup', express.static(path.join(__dirname, '..', 'setup')));

// ── Setup detection: redirect to wizard if not configured ─────────────────────
function isSetupComplete() {
  const required = [
    'TWITCH_CLIENT_ID',
    'TWITCH_BROADCASTER_ID',
    'TWITCH_USER_ACCESS_TOKEN',
    'TWITCH_REWARD_ID',
    'GOOGLE_SHEET_ID',
    'SHEET_SONG_COLUMN',
  ];
  return required.every(k => process.env[k] && !process.env[k].includes('your_'));
}

app.get('/', (req, res) => {
  if (!isSetupComplete()) return res.redirect('/setup');
  res.redirect('/dashboard');
});

// ── Twitch event handler (called by twitch.js on redemption) ──────────────────
setEventHandler(async (event) => {
  const requestText = event?.user_input?.trim();
  const rewardId = event?.reward?.id;
  const requester = event?.user_name;

  console.log(`[event] Redemption from @${requester}: "${requestText}" (reward: ${rewardId})`);

  // Random song reward
  const randomRewardId = process.env.TWITCH_RANDOM_REWARD_ID;
  if (randomRewardId && rewardId === randomRewardId) {
    const { queue, nowPlaying } = getState();
    const excludeTitles = [
      ...(nowPlaying ? [nowPlaying.title] : []),
      ...queue.map(s => s.title),
    ];
    const picked = pickRandom(excludeTitles);
    if (picked) {
      addSong({ title: picked.title, artist: picked.artist, key: picked.key || '', requester });
      recordRequest({ title: picked.title, artist: picked.artist, requester });
      console.log(`[random] Added "${picked.title}" for @${requester}`);
    }
    return;
  }

  // Regular song request
  if (!requestText) return;

  const result = matchSong(requestText);

  if (result.matched && result.confident) {
    addSong({ title: result.song.title, artist: result.song.artist, key: result.song.key || '', requester });
    recordRequest({ title: result.song.title, artist: result.song.artist, requester });
    console.log(`[queue] Added "${result.song.title}" for @${requester} (${result.confidence}%)`);
  } else if (result.matched && !result.confident) {
    addPending({ title: result.song.title, artist: result.song.artist, requester, originalRequest: requestText, confidence: result.confidence });
    console.log(`[queue] Weak match "${result.song.title}" (${result.confidence}%) → pending`);
  } else {
    addPending({ title: '', artist: '', requester, originalRequest: requestText, confidence: null });
    console.log(`[queue] No match for "${requestText}" → pending`);
  }
});

// ── REST API ──────────────────────────────────────────────────────────────────
app.get('/api/queue', (req, res) => res.json(getState()));
app.post('/api/skip', (req, res) => res.json({ nowPlaying: skipSong() }));
app.post('/api/clear', (req, res) => { clearQueue(); res.json({ ok: true }); });

app.post('/api/add', (req, res) => {
  const { title, artist, key, requester } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const entry = addSong({ title: title.trim(), artist: artist || '', key: key || '', requester: requester || 'manual' });
  recordRequest({ title: title.trim(), artist: artist || '', requester: requester || 'manual' });
  res.json({ ok: true, entry });
});

app.post('/api/delete', (req, res) => {
  const { zone, index } = req.body;
  const result = deleteSong(zone, index);
  if (!result) return res.status(400).json({ error: 'invalid zone or index' });
  res.json({ ok: true });
});

app.post('/api/move', (req, res) => {
  const { fromZone, fromIndex, toZone, toIndex } = req.body;
  const result = moveSong(fromZone, fromIndex, toZone, toIndex);
  if (!result) return res.status(400).json({ error: 'invalid move' });
  res.json({ ok: true });
});

app.post('/api/accept-pending', (req, res) => {
  const { index, title, artist } = req.body;
  const result = acceptPending(index, title, artist);
  if (!result) return res.status(400).json({ error: 'invalid index' });
  res.json({ ok: true });
});

app.post('/api/refresh-songs', async (req, res) => {
  const { fetchSongs } = require('./sheets');
  const songs = await fetchSongs();
  res.json({ ok: true, count: songs.length });
});

app.get('/api/history', (req, res) => res.json(getHistory()));
app.get('/api/songs', (req, res) => {
  const { getSongs } = require('./sheets');
  res.json(getSongs());
});

// ── WebSocket (overlay) ───────────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  console.log(`[ws] Overlay connected from ${req.socket.remoteAddress}`);
  registerClient(ws);
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

async function start() {
  console.log('\n🎵 VTuber Song Queue starting...\n');

  if (isSetupComplete()) {
    await startAutoRefresh();
    await initHistory();
    connectTwitch();
  } else {
    console.log('[setup] Configuration incomplete.');
    console.log('[setup] Please open http://localhost:' + PORT + '/setup to configure.');
  }

  server.listen(PORT, () => {
    console.log(`\n✅ Server running at http://localhost:${PORT}`);
    if (isSetupComplete()) {
      console.log(`   Dashboard:  http://localhost:${PORT}/dashboard`);
      console.log(`   Overlay:    http://localhost:${PORT}/overlay/index.html`);
    } else {
      console.log(`   Setup:      http://localhost:${PORT}/setup`);
    }
    console.log('');
  });
}

start().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
