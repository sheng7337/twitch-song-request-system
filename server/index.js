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
  // Forward the query string (e.g. ?lang=zh-TW from the startup scripts) so the
  // wizard opens in the right language even on a redirect from here.
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  if (!isSetupComplete()) return res.redirect('/setup' + qs);
  res.redirect('/dashboard' + qs);
});

// Starts the song queue services (sheets, Twitch connection, history) the
// first time configuration becomes complete — either at boot, or mid-run
// when the setup wizard finishes writing .env. Without this, finishing the
// wizard would leave the dashboard open with no song list until restart.
//
// initHistory() is called every time (it's a cheap no-op once initialized)
// rather than gated behind the one-time flag below: HISTORY_SHEET_ID comes
// from the wizard's *optional* history-sheet step, which the user can
// complete after the required fields already triggered this function — so
// it may not exist yet on the first pass and needs a later retry.
let coreServicesStarted = false;
async function activateServiceIfReady() {
  if (!isSetupComplete()) return;
  if (!coreServicesStarted) {
    coreServicesStarted = true;
    console.log('\n[setup] Configuration complete — starting song queue services...\n');
    await startAutoRefresh();
    connectTwitch();
  }
  await initHistory();
}
setupRouter.setConfigChangeCallback(() => activateServiceIfReady().catch(err => {
  console.error('Error starting services after setup:', err);
}));

// ── Twitch event handler (called by twitch.js on redemption) ──────────────────
setEventHandler(async (event) => {
  const requestText = event?.user_input?.trim();
  const rewardId = event?.reward?.id;
  const requester = event?.user_name;

  console.log(`[event] Redemption from @${requester}: "${requestText}" (reward: ${rewardId})`);

  // Random song reward
  const randomRewardId = process.env.TWITCH_RANDOM_REWARD_ID;
  if (randomRewardId && rewardId === randomRewardId) {
    const { queue, nowPlaying, playedSongs } = getState();
    const excludeTitles = [
      ...(nowPlaying ? [nowPlaying.title] : []),
      ...queue.map(s => s.title),
      ...playedSongs.map(s => s.title),
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
  } else if (result.candidates?.length > 1) {
    addPending({ title: '', artist: '', requester, originalRequest: requestText, confidence: result.confidence, candidates: result.candidates });
    console.log(`[queue] ${result.candidates.length} candidates for "${requestText}" → pending`);
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
  const { index, title, artist, candidateIndex } = req.body;
  const result = acceptPending(index, title, artist, candidateIndex != null ? Number(candidateIndex) : null);
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

// ── Settings (dashboard-adjustable behaviour) ─────────────────────────────────
const RANDOM_COOLDOWN_MAX_DAYS = 60; // ~2 months
const RANDOM_COOLDOWN_DEFAULT_DAYS = 7;

app.get('/api/settings', (req, res) => {
  const raw = process.env.RANDOM_COOLDOWN_DAYS;
  const days = raw == null || raw === '' ? RANDOM_COOLDOWN_DEFAULT_DAYS : parseFloat(raw);
  res.json({ randomCooldownDays: Number.isFinite(days) && days >= 0 ? days : RANDOM_COOLDOWN_DEFAULT_DAYS });
});

app.post('/api/settings', (req, res) => {
  const days = Number(req.body.randomCooldownDays);
  if (!Number.isFinite(days) || days < 0 || days > RANDOM_COOLDOWN_MAX_DAYS) {
    return res.status(400).json({ error: `randomCooldownDays must be between 0 and ${RANDOM_COOLDOWN_MAX_DAYS}` });
  }
  setupRouter.writeEnvValues({ RANDOM_COOLDOWN_DAYS: String(days) });
  res.json({ ok: true, randomCooldownDays: days });
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
    await activateServiceIfReady();
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
