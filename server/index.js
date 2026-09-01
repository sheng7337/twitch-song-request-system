// server/index.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const { startAutoRefresh } = require('./sheets');
const { matchSong } = require('./matcher');
const { registerClient, addSong, addPending, acceptPending, skipSong, clearQueue, getState, deleteSong, moveSong, redrawSong, broadcastSettings, broadcastRaw } = require('./queue');
const { connect: connectTwitch, setEventHandler, setChatHandler } = require('./twitch');
const { registerCommand, handleChatEvent } = require('./chat-router');
const registerShoutout = require('./commands/shoutout');
const registerWatch = require('./commands/watch');
const registerReplay = require('./commands/replay');
const registerStop = require('./commands/stop');
const mediaQueue = require('./media-queue');
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
app.use('/clip-player', express.static(path.join(__dirname, '..', 'clip-player')));

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
  }
  // Called every time setup is complete — handles both first start and
  // re-auth after token expiry. connect() is idempotent: it no-ops when a
  // socket already exists, so this is safe to call on any config change.
  await connectTwitch();
  await initHistory();
}
setupRouter.setConfigChangeCallback(() => activateServiceIfReady().catch(err => {
  console.error('Error starting services after setup:', err);
}));

// ── Chat command registration ─────────────────────────────────────────────────
mediaQueue.init(broadcastRaw);
registerShoutout(registerCommand);
registerWatch(registerCommand);
registerReplay(registerCommand);
registerStop(registerCommand);
setChatHandler(handleChatEvent);

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
      addSong({ title: picked.title, artist: picked.artist, key: picked.key || '', requester, isRandom: true });
      console.log(`[random] Added "${picked.title}" for @${requester}`);
    }
    return;
  }

  // Regular song request
  if (!requestText) return;

  const result = matchSong(requestText);

  if (result.matched && result.confident) {
    addSong({ title: result.song.title, artist: result.song.artist, key: result.song.key || '', requester });
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
app.post('/api/skip', (req, res) => {
  const { nowPlaying } = getState();
  if (nowPlaying) recordRequest({ title: nowPlaying.title, artist: nowPlaying.artist, requester: nowPlaying.requester });
  res.json({ nowPlaying: skipSong() });
});
app.post('/api/clear', (req, res) => { clearQueue(); res.json({ ok: true }); });

app.post('/api/add', (req, res) => {
  const { title, artist, key, requester } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const entry = addSong({ title: title.trim(), artist: artist || '', key: key || '', requester: requester || 'manual' });
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

  // Record history only when nowPlaying is moved to played (song was actually performed)
  let toRecord = null;
  if (fromZone === 'nowPlaying' && toZone === 'played') {
    const { nowPlaying } = getState();
    if (nowPlaying) toRecord = { title: nowPlaying.title, artist: nowPlaying.artist, requester: nowPlaying.requester };
  }

  const result = moveSong(fromZone, fromIndex, toZone, toIndex);
  if (!result) return res.status(400).json({ error: 'invalid move' });
  if (toRecord) recordRequest(toRecord);
  res.json({ ok: true });
});

app.post('/api/accept-pending', (req, res) => {
  const { index, title, artist, candidateIndex } = req.body;
  const ci = candidateIndex != null ? Number(candidateIndex) : null;
  const result = acceptPending(index, title, artist, ci);
  if (!result) return res.status(400).json({ error: 'invalid index' });
  res.json({ ok: true });
});

app.post('/api/redraw', (req, res) => {
  const { zone, index } = req.body;
  const state = getState();

  // Get the song being replaced (to preserve its requester)
  let currentSong;
  if (zone === 'nowPlaying') currentSong = state.nowPlaying;
  else if (zone === 'queue') currentSong = state.queue[index];
  else return res.status(400).json({ error: 'invalid zone' });
  if (!currentSong) return res.status(400).json({ error: 'no song at that position' });

  // Exclude everything currently in the queue (including the song being replaced,
  // so it won't be re-drawn on the next pick)
  const excludeTitles = [
    ...(state.nowPlaying ? [state.nowPlaying.title] : []),
    ...state.queue.map(s => s.title),
    ...state.playedSongs.map(s => s.title),
  ];

  const picked = pickRandom(excludeTitles);
  if (!picked) return res.status(400).json({ error: 'no songs available to redraw' });

  const ok = redrawSong(zone, index, { ...picked, requester: currentSong.requester });
  if (!ok) return res.status(400).json({ error: 'redraw failed' });

  console.log(`[random] Redrawn to "${picked.title}" for @${currentSong.requester}`);
  res.json({ ok: true });
});

app.post('/api/refresh-songs', async (req, res) => {
  const { fetchSongs } = require('./sheets');
  const songs = await fetchSongs();
  res.json({ ok: true, count: songs.length });
});

// ── HLS proxy ─────────────────────────────────────────────────────────────────
// HLS.js fetches m3u8 playlists and .ts segments via XHR. When the page is on
// localhost:3000 and the CDN is Twitch's servers, the browser enforces CORS and
// blocks the requests. This proxy makes all HLS traffic go through localhost so
// HLS.js sees only same-origin requests with no CORS issues.
//
// For m3u8 files: rewrites every non-comment URL (segment, key, sub-playlist)
// to point back through this proxy so the chain works recursively.
// For segments (.ts): streams the bytes through as-is.

const axios = require('axios');

function isTwitchHlsUrl(urlStr) {
  try {
    const { protocol, hostname } = new URL(urlStr);
    if (protocol !== 'https:') return false;
    return hostname.endsWith('.twitch.tv')
      || hostname.endsWith('.twitchsvc.net')
      || hostname.endsWith('.twitch.com')
      || hostname.endsWith('.cloudfront.net')   // Twitch uses AWS CloudFront for clip segments
      || hostname === 'clips.twitch.tv';
  } catch { return false; }
}

function hlsProxyUrl(absoluteUrl) {
  return `/api/hls?url=${encodeURIComponent(absoluteUrl)}`;
}

function rewriteM3u8(text, baseUrl) {
  const base = new URL(baseUrl);
  // Rewrite any non-comment, non-empty line that is a URI
  return text.replace(/^(?!#)(\S+)$/gm, (match) => {
    try {
      return hlsProxyUrl(new URL(match, base).toString());
    } catch { return match; }
  });
}

app.get('/api/hls', async (req, res) => {
  const { url } = req.query;
  if (!url || !isTwitchHlsUrl(url)) {
    console.warn('[hls-proxy] Blocked:', url?.slice(0, 120));
    return res.status(403).end();
  }
  try {
    const upstream = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: { 'Accept': '*/*', 'User-Agent': 'Mozilla/5.0' },
    });
    const ct = upstream.headers['content-type'] || '';
    const isPlaylist = ct.includes('mpegurl') || url.split('?')[0].endsWith('.m3u8');
    console.log(`[hls-proxy] ${upstream.status} ${isPlaylist ? 'm3u8' : 'segment'} ${url.slice(0, 80)}`);
    if (isPlaylist) {
      const text = Buffer.from(upstream.data).toString('utf8');
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.set('Access-Control-Allow-Origin', '*');
      res.send(rewriteM3u8(text, url));
    } else {
      res.set('Content-Type', ct || 'video/mp2t');
      res.set('Access-Control-Allow-Origin', '*');
      res.send(Buffer.from(upstream.data));
    }
  } catch (err) {
    const status = err.response?.status;
    console.error(`[hls-proxy] ${status ?? 'ERR'} ${err.message} — ${url?.slice(0, 100)}`);
    if (!res.headersSent) res.status(502).end();
  }
});

// GET /api/clip-stream?url=<encoded-signed-m3u8-url>
// Downloads all HLS segments server-side and streams them as a single
// concatenated MPEG-TS blob. The clip player uses a plain <video src> tag —
// no HLS.js or MSE needed, works in any Chromium 106+ (OBS/Streamlabs CEF).
app.get('/api/clip-stream', async (req, res) => {
  const { url } = req.query;
  if (!url || !isTwitchHlsUrl(url)) return res.status(403).end();

  try {
    const fetchOpts = { responseType: 'text', headers: { 'Accept': '*/*', 'User-Agent': 'Mozilla/5.0' } };

    // Direct MP4 (newer Twitch clips) — proxy the file through as-is
    if (url.split('?')[0].endsWith('.mp4')) {
      const r = await axios.get(url, { responseType: 'arraybuffer', headers: { 'Accept': '*/*', 'User-Agent': 'Mozilla/5.0' } });
      const body = Buffer.from(r.data);
      console.log(`[clip-stream] MP4 ${(body.length / 1024 / 1024).toFixed(1)} MB`);
      res.set('Content-Type', 'video/mp4');
      res.set('Content-Length', body.length);
      res.set('Access-Control-Allow-Origin', '*');
      return res.send(body);
    }

    // HLS playlist — fetch segments and concatenate as MPEG-TS
    let playlistText = (await axios.get(url, fetchOpts)).data;
    let playlistBase = url;

    // If variant playlist (no #EXTINF lines), follow the first quality entry
    if (!playlistText.includes('#EXTINF')) {
      const firstEntry = playlistText.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#'));
      if (!firstEntry) return res.status(502).send('Empty variant playlist');
      const subUrl = new URL(firstEntry, url).toString();
      if (!isTwitchHlsUrl(subUrl)) return res.status(403).end();
      playlistText = (await axios.get(subUrl, fetchOpts)).data;
      playlistBase = subUrl;
    }

    // Parse segment URLs (non-comment, non-empty lines)
    const segmentUrls = [];
    for (const line of playlistText.split('\n')) {
      const t = line.trim();
      if (t && !t.startsWith('#')) {
        try {
          const abs = new URL(t, playlistBase).toString();
          if (isTwitchHlsUrl(abs)) segmentUrls.push(abs);
        } catch {}
      }
    }
    if (!segmentUrls.length) return res.status(502).send('No segments in playlist');

    // Download and concatenate all segments
    const chunks = [];
    for (const seg of segmentUrls) {
      const r = await axios.get(seg, { responseType: 'arraybuffer', headers: { 'Accept': '*/*', 'User-Agent': 'Mozilla/5.0' } });
      chunks.push(Buffer.from(r.data));
    }
    const body = Buffer.concat(chunks);
    console.log(`[clip-stream] ${segmentUrls.length} segments → ${(body.length / 1024 / 1024).toFixed(1)} MB`);

    res.set('Content-Type', 'video/mp2t');
    res.set('Content-Length', body.length);
    res.set('Access-Control-Allow-Origin', '*');
    res.send(body);
  } catch (err) {
    console.error('[clip-stream]', err.response?.status ?? 'ERR', err.message);
    if (!res.headersSent) res.status(502).end();
  }
});

app.get('/api/history', (req, res) => res.json(getHistory()));
app.get('/api/songs', (req, res) => {
  const { getSongs } = require('./sheets');
  res.json(getSongs());
});

// ── Settings (dashboard-adjustable behaviour) ─────────────────────────────────
const RANDOM_COOLDOWN_MAX_DAYS = 60; // ~2 months
const RANDOM_COOLDOWN_DEFAULT_DAYS = 7;
const PANEL_BG_ALPHA_DEFAULT = 0.92;
const TEXT_BRIGHTNESS_DEFAULT = 1;
const TEXT_BRIGHTNESS_MIN = 0.5;
const TEXT_BRIGHTNESS_MAX = 2;

app.get('/api/settings', (req, res) => {
  const rawDays = process.env.RANDOM_COOLDOWN_DAYS;
  const days = rawDays == null || rawDays === '' ? RANDOM_COOLDOWN_DEFAULT_DAYS : parseFloat(rawDays);

  const rawAlpha = process.env.OVERLAY_PANEL_BG_ALPHA;
  const alpha = rawAlpha == null || rawAlpha === '' ? PANEL_BG_ALPHA_DEFAULT : parseFloat(rawAlpha);

  const rawBrightness = process.env.OVERLAY_TEXT_BRIGHTNESS;
  const brightness = rawBrightness == null || rawBrightness === '' ? TEXT_BRIGHTNESS_DEFAULT : parseFloat(rawBrightness);

  res.json({
    randomCooldownDays: Number.isFinite(days) && days >= 0 ? days : RANDOM_COOLDOWN_DEFAULT_DAYS,
    panelBgAlpha: Number.isFinite(alpha) && alpha >= 0 && alpha <= 1 ? alpha : PANEL_BG_ALPHA_DEFAULT,
    textBrightness: Number.isFinite(brightness) && brightness >= TEXT_BRIGHTNESS_MIN && brightness <= TEXT_BRIGHTNESS_MAX ? brightness : TEXT_BRIGHTNESS_DEFAULT,
  });
});

app.post('/api/settings', (req, res) => {
  const updates = {};

  if (req.body.randomCooldownDays !== undefined) {
    const days = Number(req.body.randomCooldownDays);
    if (!Number.isFinite(days) || days < 0 || days > RANDOM_COOLDOWN_MAX_DAYS) {
      return res.status(400).json({ error: `randomCooldownDays must be between 0 and ${RANDOM_COOLDOWN_MAX_DAYS}` });
    }
    updates.randomCooldownDays = days;
    setupRouter.writeEnvValues({ RANDOM_COOLDOWN_DAYS: String(days) });
  }

  if (req.body.panelBgAlpha !== undefined) {
    const alpha = Number(req.body.panelBgAlpha);
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
      return res.status(400).json({ error: 'panelBgAlpha must be between 0 and 1' });
    }
    updates.panelBgAlpha = alpha;
    setupRouter.writeEnvValues({ OVERLAY_PANEL_BG_ALPHA: String(alpha) });
    broadcastSettings({ panelBgAlpha: alpha });
  }

  if (req.body.textBrightness !== undefined) {
    const brightness = Number(req.body.textBrightness);
    if (!Number.isFinite(brightness) || brightness < TEXT_BRIGHTNESS_MIN || brightness > TEXT_BRIGHTNESS_MAX) {
      return res.status(400).json({ error: `textBrightness must be between ${TEXT_BRIGHTNESS_MIN} and ${TEXT_BRIGHTNESS_MAX}` });
    }
    updates.textBrightness = brightness;
    setupRouter.writeEnvValues({ OVERLAY_TEXT_BRIGHTNESS: String(brightness) });
    broadcastSettings({ textBrightness: brightness });
  }

  res.json({ ok: true, ...updates });
});

// ── WebSocket (overlay + clip-player) ────────────────────────────────────────
wss.on('connection', (ws, req) => {
  console.log(`[ws] Client connected from ${req.socket.remoteAddress}`);
  registerClient(ws);
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'media-ended') mediaQueue.onEnded();
    } catch {}
  });
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
