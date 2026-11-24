// server/index.js
require('dotenv').config();
const appLog = require('./app-log');
appLog.start();   // first: this run's log folder gets everything after (app-log.js)
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { version: APP_VERSION } = require('../package.json');   // YYYY.MM-W, see CHANGELOG.md
const fs = require('fs');
const { isAllowedRequest } = require('./request-guard');

const { startAutoRefresh } = require('./sheets');
const { matchSong } = require('./matcher');
const { registerClient, addSong, addPending, updatePending, acceptPending, skipSong, clearQueue, getState, deleteSong, moveSong, redrawSong, broadcastSettings, broadcastRaw, setRedemptionHook, forgetRedemption } = require('./queue');
const { connect: connectTwitch, setEventHandler, setChatHandler, setModerationHandler, setNoticeHandler, setFollowHandler, setBitsHandler, setRewardHandler, setStreamHandler, setReconnectHandler, replayRedemption, followStatus, bitsStatus } = require('./twitch');
const { registerCommand, handleChatEvent } = require('./chat-router');
const chatLog = require('./chat-log');
const chatBadges = require('./chat-badges');
const songNotes = require('./song-notes');
const look = require('./look');
const songTabs = require('./song-tabs');
const config = require('./config');
const registerShoutout = require('./commands/shoutout');
const registerWatch = require('./commands/watch');
const registerReplay = require('./commands/replay');
const registerStop = require('./commands/stop');
const registerThanks = require('./commands/thanks');
const registerEndingThanks = require('./commands/ending-thanks');
const endingCredits = require('./ending-credits');
const endingRaid = require('./ending-raid');
const redemptions = require('./redemptions');
const firstChat = require('./first-chat');
const chatSend = require('./chat-send');
const chatMod = require('./chat-mod');
const modes = require('./modes');
const singCheck = require('./sing-check');
const outfits = require('./outfits');
const alerts = require('./alerts');
const rewardEffects = require('./reward-effects');
const streamApp = require('./stream-app');
const streamSession = require('./stream-session');
const { generateIfMissing: generateSponsorVoice } = require('./sponsor-voice');
const mediaQueue = require('./media-queue');
const { init: initHistory, recordRequest, getHistory } = require('./history');
const { pickRandom } = require('./random');
const setupRouter = require('./setup-routes');
const leihu = require('./leihu');
const streamWindow = require('./stream-window');
const linkFinder = require('./link-finder');
const { errorBody, message, UserError } = require('./messages');
const { nodeStatus } = require('./node-check');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, verifyClient: ({ req }) => isAllowedRequest(req) });

app.use((req, res, next) => {
  if (isAllowedRequest(req)) return next();
  console.warn(`[guard] Blocked ${req.method} ${req.url} (host=${req.headers.host}, origin=${req.headers.origin})`);
  res.status(403).end();
});

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
app.use('/alert-media', express.static(alerts.MEDIA_DIR));   // the alerts' pictures and sounds (alerts.js)
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));   // language helper + strings
app.use('/docs', express.static(path.join(__dirname, '..', 'docs')));       // starter guide, song list template

// ── Setup detection: redirect to wizard if not configured ─────────────────────
function isSetupComplete() {
  const required = [
    'TWITCH_CLIENT_ID',
    'TWITCH_BROADCASTER_ID',
    'TWITCH_USER_ACCESS_TOKEN',
    'GOOGLE_SHEET_ID',
    'SHEET_SONG_COLUMN',
  ];
  if (!required.every(k => process.env[k] && !process.env[k].includes('your_'))) return false;
  return !!(process.env.TWITCH_REWARD_ID && !process.env.TWITCH_REWARD_ID.includes('your_'));
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
    // EXCLUDED_TABS (before 2026.11-4) → the practice tab and each reward's tabs, once
    const moved = songTabs.migrate(process.env, require('./sheets').getTabs());
    if (Object.keys(moved).length) {
      setupRouter.writeEnvValues(moved);
      console.log(`[tabs] EXCLUDED_TABS moved: the practice tab is now "${moved.PRACTICE_TAB || '(none)'}"`);
    }
    // Live or not, checked now and then too: a go-live / end event can be missed while reconnecting
    setInterval(() => streamSession.refresh(), 10 * 60 * 1000);
  }
  // Called every time setup is complete — handles both first start and
  // re-auth after token expiry. connect() is idempotent: it no-ops when a
  // socket already exists, so this is safe to call on any config change.
  await connectTwitch();
  streamSession.refresh();
  // Twitch's "first message in the channel" flag, for the Chat tab
  firstChat.start(redemptions.channelLogin, chatLog.markFirst)
    .catch(err => console.error('[first-chat] Could not start:', err.message));
  await initHistory();
}
setupRouter.setConfigChangeCallback(() => activateServiceIfReady().catch(err => {
  console.error('Error starting services after setup:', err);
}));

// ── Chat command registration ─────────────────────────────────────────────────
mediaQueue.init(broadcastRaw);
mediaQueue.setWaitingListener(waiting => sendChat({ type: 'media-waiting', waiting }));   // the top bar's "⏸ N waiting"
registerShoutout(registerCommand);
registerWatch(registerCommand);
registerReplay(registerCommand);
registerStop(registerCommand);
registerThanks(registerCommand);
registerEndingThanks(registerCommand);
songNotes.init(broadcastRaw);   // "last sung" notes for songs named in chat go to the song overlay
setChatHandler((event) => {
  try { chatLog.addChat(event, songNotes.check); } catch (err) { console.error('[chat-log] Could not log a message:', err.message); }
  handleChatEvent(event);
});
setModerationHandler(chatLog.onModeration);
// Subs, gifts, raids and follows: shown in the Chat tab, thanked by !endingtk (ending-credits.js)
setNoticeHandler((event) => {
  let rec = null;
  try { rec = chatLog.addNotice(event); } catch (err) { console.error('[chat-log] Could not log a chat notice:', err.message); }
  endingRaid.onRecord(rec);   // a raid coming in stops ours with the ending roll
});
setFollowHandler((event) => {
  try { chatLog.addFollow(event); } catch (err) { console.error('[chat-log] Could not log a follow:', err.message); }
});
// Bits spent on Power-ups / combos: thanked with the cheers by !endingtk
setBitsHandler((event) => {
  try { chatLog.addBitsUse(event); } catch (err) { console.error('[chat-log] Could not log Bits used:', err.message); }
});
// Redemptions done or refunded (Chat tab, Twitch's queue, or songs leaving the queue: redemptions.js)
setRewardHandler((type, event) => {
  if (type === 'channel.channel_points_custom_reward.remove') return redemptions.onRewardRemoved(event);
  if (event.status !== 'unfulfilled') forgetRedemption(event.id);
  try { chatLog.setRedeemStatus(event.id, event.status, event.redeemed_at); } catch (err) { console.error('[chat-log] Could not log a redemption update:', err.message); }
});
setRedemptionHook(redemptions.settle);
// The stream went live / ended: the Chat tab's "to announce" starts a new session
setStreamHandler(streamSession.onEvent);
// Back after the connection to Twitch dropped: EventSub doesn't send what came meanwhile. Live or
// not (a go-live / end may be missed), and the redemptions made during the gap (a little before
// Twitch was last heard from, in case of clock differences; ones that did come in are skipped)
setReconnectHandler(async ({ since }) => {
  streamSession.refresh();
  if (!since) return;
  const missed = await redemptions.missedSince(since - 30000);
  const handed = missed.filter(replayRedemption);
  if (handed.length) console.log(`[event] ${handed.length} redemption(s) made while disconnected, handled now`);
});
streamSession.init(session => sendChat({ type: 'chat-session', ...session }));
singCheck.init(msg => sendChat(msg));   // before modes.init: it tells sing-check the modes
modes.init(msg => sendChat(msg));   // after mediaQueue.init: a mode may hold clips
endingRaid.init(msg => sendChat(msg));
outfits.init({ send: msg => sendChat(msg), saveEnv: values => setupRouter.writeEnvValues(values) });
alerts.init(msg => sendAlerts(msg));
rewardEffects.init({ toOverlays: msg => sendEffects(msg), toDashboards: msg => sendChat(msg) });

// Returns the matching random-reward config object if the given rewardId is
// a configured random reward, or null if it isn't.
function parseRandomReward(rewardId) {
  if (!rewardId) return null;
  const multi = process.env.TWITCH_RANDOM_REWARDS;
  if (!multi) return null;
  try {
    const rewards = JSON.parse(multi);
    return rewards.find(r => r.id === rewardId) || null;
  } catch (_) {
    console.error('[event] TWITCH_RANDOM_REWARDS is not valid JSON — re-run setup to fix it');
    return null;
  }
}

// ── Twitch event handler (called by twitch.js on redemption) ──────────────────
setEventHandler(async (event) => {
  const requestText = event?.user_input?.trim();
  const rewardId = event?.reward?.id;
  const requester = event?.user_name;
  // Sung → done, removed from the queue → refunded (queue.js); only for rewards the app made
  const redemption = event?.id && rewardId ? { id: event.id, rewardId } : null;

  console.log(`[event] Redemption from @${requester}: "${requestText}" (reward: ${rewardId})`);
  try { chatLog.addRedemption(event); } catch (err) { console.error('[chat-log] Could not log a redemption:', err.message); }
  if (outfits.onRedemption(event)) return;   // 👕 waits for the streamer's pick in the dashboard

  // Random song reward(s) — each entry in TWITCH_RANDOM_REWARDS can restrict to specific sheet tabs.
  const matchedRandom = parseRandomReward(rewardId);
  if (matchedRandom) {
    const { queue, nowPlaying, playedSongs } = getState();
    const exclude = [...(nowPlaying ? [nowPlaying] : []), ...queue, ...playedSongs];
    const allowedTabs = matchedRandom.tabs || [];
    const picked = pickRandom(exclude, allowedTabs);
    if (picked) {
      addSong({ title: picked.title, artist: picked.artist, key: picked.key || '', requester, isRandom: true, tabs: allowedTabs, redemption });
      const tabInfo = allowedTabs.length > 0 ? ` [${allowedTabs.join('/')}]` : '';
      console.log(`[random] Added "${picked.title}" for @${requester}${tabInfo}`);
    } else if (redemption) {
      redemptions.settle(redemption, 'refund');   // nothing left to draw
    }
    return;
  }

  // Regular song request — only process if this matches the configured reward ID
  const songRewardId = process.env.TWITCH_REWARD_ID;
  if (!songRewardId || rewardId !== songRewardId) {
    console.log(`[event] Ignored — reward ${rewardId} is not the song request reward (TWITCH_REWARD_ID)`);
    return;
  }
  if (!requestText) {
    console.log(`[event] Ignored — song request reward has no text input`);
    return;
  }

  const result = matchSong(requestText);

  if (result.matched && result.confident) {
    addSong({ title: result.song.title, artist: result.song.artist, key: result.song.key || '', requester, redemption });
    console.log(`[queue] Added "${result.song.title}" for @${requester} (${result.confidence}%)`);
  } else if (result.candidates?.length > 1) {
    addPending({ title: '', artist: '', requester, originalRequest: requestText, confidence: result.confidence, candidates: result.candidates, redemption });
    console.log(`[queue] ${result.candidates.length} candidates for "${requestText}" → pending`);
  } else if (result.matched && !result.confident) {
    addPending({ title: result.song.title, artist: result.song.artist, requester, originalRequest: requestText, confidence: result.confidence, redemption });
    console.log(`[queue] Weak match "${result.song.title}" (${result.confidence}%) → pending`);
  } else {
    addPending({ title: '', artist: '', requester, originalRequest: requestText, confidence: null, redemption });
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
  if (!title) return res.status(400).json(message('titleRequired', {}, 'title required'));
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
  const exclude = [...(state.nowPlaying ? [state.nowPlaying] : []), ...state.queue, ...state.playedSongs];

  const tabs = currentSong.tabs || [];
  const picked = pickRandom(exclude, tabs);
  if (!picked) return res.status(400).json(message('noRedraw', {}, 'no songs available to redraw'));

  const ok = redrawSong(zone, index, { ...picked, requester: currentSong.requester, tabs, redemption: currentSong.redemption });
  if (!ok) return res.status(400).json(message('redrawFailed', {}, 'redraw failed'));

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

// ── Leihu Singsing (backing tracks + lyrics, optional) ───────────────────────
app.get('/api/leihu/status', (req, res) => res.json(leihu.getStatus()));
app.get('/api/leihu/library', (req, res) => res.json(leihu.getLibrary()));
app.get('/api/sing-check', (req, res) => res.json(singCheck.state()));   // Leihu playing outside a 🎤 mode
// The prompter (dashboard/prompter.html): Leihu's lyrics and position for a tablet behind the mic shield
app.get('/api/prompter', async (req, res) => res.json(await leihu.playback(req.query.ver)));
app.get('/api/prompter/addresses', (req, res) => res.json(lanAddresses().map(ip => `http://${ip}:${PORT}/prompter`)));
app.get('/prompter', (req, res) => res.redirect('/dashboard/prompter.html'));

// Manual link for a song imported into Leihu as an audio file. id: null unlinks.
app.post('/api/leihu/link', async (req, res) => {
  const { title, artist, id } = req.body;
  if (!title) return res.status(400).json(message('titleRequired', {}, 'title required'));
  if (id != null && !/^[a-z0-9]{6,16}$/.test(id)) return res.status(400).json({ error: 'invalid id' });
  leihu.setLink(title, artist, id || null);
  res.json({ ok: true });
});

// Import / render the key of one song now, whether or not auto-prepare is on.
app.post('/api/leihu/prepare', async (req, res) => {
  const { title, artist, key } = req.body;
  if (!title) return res.status(400).json(message('titleRequired', {}, 'title required'));
  await leihu.prepare({ title, artist, key }, { retry: true });
  await leihu.refresh();
  res.json({ ok: true });
});

// Open a ready song in Leihu's practice window at its sheet key.
app.post('/api/leihu/open', async (req, res) => {
  const { title, artist, key } = req.body;
  if (!title) return res.status(400).json(message('titleRequired', {}, 'title required'));
  try {
    res.json({ ok: true, key: await leihu.open({ title, artist, key }) });
  } catch (err) {
    res.status(400).json(err.messageCode ? errorBody(err) : { error: err.response?.data?.error || err.message });
  }
});

// Start Leihu without its window (it then shows only in the dashboard's Leihu tab), or close
// it when the song queue started it (leihu-launcher.js)
app.post('/api/leihu/launch', async (req, res) => {
  try {
    if (req.body.action === 'stop') return res.json({ closed: leihu.closeLeihu() });
    res.json(await leihu.launch());
  } catch (err) {
    res.status(400).json(errorBody(err));
  }
});

// The dashboard in a browser window of its own, so OBS can capture the Leihu tab's sound from it
// alone (stream-window.js). The startup scripts open it at the song queue ({ tab: 'queue', lang }); until
// setup is done they open the wizard in the default browser instead.
// From the stream window: setup and Twitch links open in the usual browser, where Twitch is logged in
app.post('/api/open-in-browser', (req, res) => {
  try {
    res.json(streamWindow.openInUsualBrowser(String(req.body.url || ''), PORT));
  } catch (err) {
    res.status(400).json(errorBody(err));
  }
});

app.post('/api/stream-window', (req, res) => {
  if (!isSetupComplete()) return res.status(409).json({ error: 'setup is not complete' });
  const lang = ['en', 'zh-TW'].includes(req.body.lang) ? `&lang=${req.body.lang}` : '';
  const tab = req.body.tab === 'queue' ? '' : '#leihu';
  try {
    res.json(streamWindow.open(`http://localhost:${PORT}/dashboard?window=stream${lang}${tab}`));
  } catch (err) {
    res.status(400).json(errorBody(err));
  }
});

// Prepare every sheet song with a YouTube link in Leihu, a few at a time (leihu.js startBulk)
app.post('/api/leihu/bulk', async (req, res) => {
  try {
    res.json(req.body.action === 'stop' ? leihu.stopBulk() : await leihu.startBulk());
  } catch (err) {
    res.status(400).json(err.messageCode ? errorBody(err) : { error: err.response?.data?.error || err.message });
  }
});

// ── YouTube link finder (fills the YTLink column, see link-finder.js) ────────
app.get('/api/links', (req, res) => res.json(linkFinder.getView()));
app.post('/api/links/start', async (req, res) => res.json(await linkFinder.start({ limit: Number(req.body.limit) || 0 })));
app.post('/api/links/stop', (req, res) => res.json(linkFinder.stop()));
app.post('/api/links/accept-confident', (req, res) => res.json({ ok: true, accepted: linkFinder.acceptConfident() }));

// decision: 'accepted' (with videoId: an ID or any YouTube link), 'skipped', or null to undo
app.post('/api/links/decide', (req, res) => {
  const { key, decision, videoId } = req.body;
  if (![null, 'accepted', 'skipped'].includes(decision ?? null)) return res.status(400).json({ error: 'invalid decision' });
  try {
    linkFinder.decide(key, decision ?? null, videoId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json(errorBody(err));
  }
});

// Can the server edit the song sheet? (a write that changes nothing)
app.post('/api/links/access', async (req, res) => {
  try {
    res.json(await linkFinder.checkAccess());
  } catch (err) {
    res.status(400).json(errorBody(err));
  }
});

app.post('/api/links/save', async (req, res) => {
  try {
    const result = await linkFinder.save();
    if (result.written) require('./sheets').fetchSongs().catch(() => {});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json(errorBody(err));
  }
});


// ── Songs not on the sheet (Pending Review → 🔍 Find) ────────────────────────
// The pending entry at `index`; `addedAt` (when sent) must match, so a list that changed
// since the page drew it never acts on another request.
function pendingAt(index, addedAt) {
  const entry = getState().pending[Number(index)];
  return entry && (addedAt == null || entry.addedAt === Number(addedAt)) ? entry : null;
}

function youtubeId(link) {
  return leihu.videoId(link) || (/^[A-Za-z0-9_-]{11}$/.test(link || '') ? link : null);
}

// Searches the lyric sites and YouTube for what the viewer typed (or `text`, the card's
// edited title + artist). Answers at once; the result lands on the entry as `found`.
app.post('/api/pending/identify', (req, res) => {
  const entry = pendingAt(req.body.index, req.body.addedAt);
  if (!entry) return res.status(400).json(message('pendingGone', {}, 'this request is no longer pending — reload the page'));
  const text = String(req.body.text || entry.originalRequest || '').trim();
  if (!text) return res.status(400).json(message('titleRequired', {}, 'title required'));
  updatePending(entry, { found: { state: 'searching', text, started: Date.now() } });
  linkFinder.identify(text).then(r => {
    updatePending(entry, {
      title: r.title, artist: r.artist,
      found: { state: 'done', text, ...r, practiceTab: linkFinder.practiceTab() },
    });
    console.log(`[pending] "${text}" → ${r.title} / ${r.artist || '?'} (${r.status}, ${r.candidates.length} videos)`);
  }).catch(err => {
    updatePending(entry, { found: { state: 'failed', text, ...errorBody(err) } });
    console.error(`[pending] Search for "${text}" failed:`, err.message);
  });
  res.json({ ok: true });
});

// Queue the request as `title` / `artist` and prepare `videoId` in Leihu. The song is
// queued even when Leihu can't take it; the reply then carries Leihu's error.
app.post('/api/pending/queue-found', async (req, res) => {
  const { index, addedAt, videoId } = req.body;
  const title = String(req.body.title || '').trim();
  const artist = String(req.body.artist || '').trim();
  if (!pendingAt(index, addedAt)) return res.status(400).json(message('pendingGone', {}, 'this request is no longer pending — reload the page'));
  if (!title) return res.status(400).json(message('titleRequired', {}, 'title required'));
  const vid = youtubeId(videoId);
  if (!vid) return res.status(400).json(message('notYouTube', {}, 'not a YouTube video link'));
  acceptPending(Number(index), title, artist);
  try {
    await leihu.importForSong(vid, { title, artist }, linkFinder.guessTab(`${title} ${artist}`));
    res.json({ ok: true, leihu: true });
  } catch (err) {
    res.json({ ok: true, leihu: false, ...errorBody(err) });
  }
});

// Add the request to the practice tab (song-tabs.js) with its YouTube link.
// The request stays pending, marked addedTo, so it can still be queued or dismissed.
app.post('/api/pending/add-to-sheet', async (req, res) => {
  const { index, addedAt, videoId } = req.body;
  const title = String(req.body.title || '').trim();
  const artist = String(req.body.artist || '').trim();
  const entry = pendingAt(index, addedAt);
  if (!entry) return res.status(400).json(message('pendingGone', {}, 'this request is no longer pending — reload the page'));
  if (!title) return res.status(400).json(message('titleRequired', {}, 'title required'));
  const vid = videoId ? youtubeId(videoId) : null;
  if (videoId && !vid) return res.status(400).json(message('notYouTube', {}, 'not a YouTube video link'));
  try {
    const r = await linkFinder.addToSheet({ title, artist, videoId: vid });
    updatePending(entry, { title, artist, addedTo: r.tab });
    res.json({ ok: true, ...r });
  } catch (err) {
    res.status(400).json(errorBody(err));
  }
});

app.get('/api/history', (req, res) => res.json(getHistory()));
app.get('/api/node-status', (req, res) => res.json(nodeStatus()));
app.get('/api/version', (req, res) => res.json({ version: APP_VERSION }));
// This run's log folder (app-log.js): where it is, and open it in File Explorer for a bug report
app.get('/api/logs', (req, res) => res.json({ folder: appLog.current() }));
app.post('/api/logs/open', (req, res) => {
  const folder = appLog.current();
  if (!folder) return res.status(404).json({ error: 'No log folder this run' });
  const opener = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  require('child_process').spawn(opener, [folder], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  res.json({ ok: true, folder });
});
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
const OVERLAY_LANGUAGES = ['en', 'zh-TW'];   // what viewers see on the overlay and clip player

// The on-stream chat (overlay/chat.html): how many messages it shows, text size (%), and what it
// shows besides chat. Each is a .env value; a missing or broken one is its default.
const CHAT_OVERLAY = {
  max: { env: 'CHAT_OVERLAY_MAX', min: 1, max: 50, def: 10 },
  size: { env: 'CHAT_OVERLAY_SIZE', min: 60, max: 200, def: 100 },
  bots: { env: 'CHAT_OVERLAY_BOTS', def: false },
  commands: { env: 'CHAT_OVERLAY_COMMANDS', def: false },
  redeems: { env: 'CHAT_OVERLAY_REDEEMS', def: true },
  events: { env: 'CHAT_OVERLAY_EVENTS', def: true },
};

function chatOverlaySettings() {
  const out = {};
  for (const [key, s] of Object.entries(CHAT_OVERLAY)) {
    const raw = process.env[s.env];
    if (typeof s.def === 'boolean') out[key] = raw === '1' ? true : raw === '0' ? false : s.def;
    else {
      const n = Number(raw);
      out[key] = raw != null && raw !== '' && Number.isInteger(n) && n >= s.min && n <= s.max ? n : s.def;
    }
  }
  return out;
}

function overlayLanguage() {
  return OVERLAY_LANGUAGES.includes(process.env.OVERLAY_LANGUAGE) ? process.env.OVERLAY_LANGUAGE : 'en';
}

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
    leihuAutoPrepare: process.env.LEIHU_AUTO_PREPARE === '1',
    leihuAutoStart: process.env.LEIHU_AUTOSTART === '1',
    songNotes: songNotes.enabled(),
    overlayLanguage: overlayLanguage(),
    chatOverlay: chatOverlaySettings(),
    randomPickMode: songTabs.pickMode(),
    shoutoutClips: require('./newest-clips').clipPool(),
    practiceTab: songTabs.practiceTab(),
    sheetTabs: require('./sheets').getTabs(),
    ...look.read(),   // themes and text sizes (look.js)
  });
});

app.post('/api/settings', async (req, res) => {
  const updates = {};

  if (req.body.randomCooldownDays !== undefined) {
    const days = Number(req.body.randomCooldownDays);
    if (!Number.isFinite(days) || days < 0 || days > RANDOM_COOLDOWN_MAX_DAYS) {
      return res.status(400).json({ error: `randomCooldownDays must be between 0 and ${RANDOM_COOLDOWN_MAX_DAYS}` });
    }
    updates.randomCooldownDays = days;
    setupRouter.writeEnvValues({ RANDOM_COOLDOWN_DAYS: String(days) });
  }

  if (req.body.randomPickMode !== undefined) {
    try { updates.randomPickMode = songTabs.parsePickMode(req.body.randomPickMode); } catch (err) { return res.status(400).json(errorBody(err)); }
    setupRouter.writeEnvValues({ RANDOM_PICK_MODE: updates.randomPickMode });
  }

  // Which clips !so picks from (newest-clips.js)
  if (req.body.shoutoutClips !== undefined) {
    const { CLIP_POOLS } = require('./newest-clips');
    if (!CLIP_POOLS.includes(req.body.shoutoutClips)) return res.status(400).json({ error: `shoutoutClips must be one of ${CLIP_POOLS.join(', ')}` });
    updates.shoutoutClips = req.body.shoutoutClips;
    setupRouter.writeEnvValues({ SHOUTOUT_CLIPS: updates.shoutoutClips });
  }

  // The practice tab (song-tabs.js): where Pending's "＋ Add to" puts songs; never requested or drawn
  if (req.body.practiceTab !== undefined) {
    try { updates.practiceTab = songTabs.parsePracticeTab(req.body.practiceTab, require('./sheets').getTabs()); } catch (err) { return res.status(400).json(errorBody(err)); }
    setupRouter.writeEnvValues({ PRACTICE_TAB: updates.practiceTab });
    sendChat({ type: 'rewards-changed' });   // the 🎟️ tab's tab ticks leave it out
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

  if (req.body.overlayLanguage !== undefined) {
    if (!OVERLAY_LANGUAGES.includes(req.body.overlayLanguage)) {
      return res.status(400).json({ error: `overlayLanguage must be one of ${OVERLAY_LANGUAGES.join(', ')}` });
    }
    updates.overlayLanguage = req.body.overlayLanguage;
    setupRouter.writeEnvValues({ OVERLAY_LANGUAGE: updates.overlayLanguage });
    broadcastSettings({ overlayLanguage: updates.overlayLanguage });
  }

  if (req.body.chatOverlay && typeof req.body.chatOverlay === 'object') {
    const values = {};
    for (const [key, value] of Object.entries(req.body.chatOverlay)) {
      const s = CHAT_OVERLAY[key];
      if (!s) continue;
      if (typeof s.def === 'boolean') values[s.env] = value ? '1' : '0';
      else {
        const n = Number(value);
        if (!Number.isInteger(n) || n < s.min || n > s.max) {
          return res.status(400).json({ error: `chatOverlay.${key} must be a whole number from ${s.min} to ${s.max}` });
        }
        values[s.env] = String(n);
      }
    }
    setupRouter.writeEnvValues(values);
    updates.chatOverlay = chatOverlaySettings();
    broadcastSettings({ chatOverlay: updates.chatOverlay });
  }

  if (req.body.leihuAutoPrepare !== undefined) {
    updates.leihuAutoPrepare = !!req.body.leihuAutoPrepare;
    setupRouter.writeEnvValues({ LEIHU_AUTO_PREPARE: updates.leihuAutoPrepare ? '1' : '0' });
  }

  if (req.body.songNotes !== undefined) {
    updates.songNotes = !!req.body.songNotes;
    setupRouter.writeEnvValues({ SONG_NOTES: updates.songNotes ? '1' : '0' });
  }

  if (req.body.leihuAutoStart !== undefined) {
    updates.leihuAutoStart = !!req.body.leihuAutoStart;
    setupRouter.writeEnvValues({ LEIHU_AUTOSTART: updates.leihuAutoStart ? '1' : '0' });
  }

  // Themes and text sizes: { look: { dashboardTheme?, overlayTheme?, …TextScale? } }; every page follows at once
  if (req.body.look !== undefined) {
    let parsed;
    try { parsed = look.parse(req.body.look); } catch (err) { return res.status(400).json(errorBody(err)); }
    setupRouter.writeEnvValues(parsed.env);
    Object.assign(updates, parsed.values);
    broadcastSettings(parsed.values);
  }

  res.json({ ok: true, ...updates });
});

// ── Chat log (dashboard Chat tab, chat-log.js) ───────────────────────────────
app.get('/api/chat/recent', (req, res) => res.json(chatLog.getRecent()));
app.get('/api/chat/badges', async (req, res) => res.json(await chatBadges.get()));   // the on-stream chat's badge pictures
app.get('/api/chat/days', async (req, res) => res.json(await chatLog.days()));
app.get('/api/chat/log', async (req, res) => res.json(await chatLog.load(String(req.query.day || ''))));
// "To announce" (Chat tab): this stream session's records (stream-session.js; the last 12 hours until
// a go-live has been seen), and ✓ marks { items: [{ id, at }], done }
app.get('/api/chat/session', async (req, res) => {
  const session = streamSession.get();
  const since = session.startedAt || Date.now() - 12 * 3600000;
  res.json({ ...session, since, records: await chatLog.loadSince(since) });
});
app.post('/api/chat/announced', (req, res) => {
  const items = (Array.isArray(req.body.items) ? req.body.items : [])
    .filter(i => i && i.id).map(i => ({ id: String(i.id), at: Number(i.at) || Date.now() }));
  if (!items.length) return res.status(400).json({ error: 'items [{ id, at }] are needed' });
  chatLog.setAnnounced(items, req.body.done !== false);
  res.json({ ok: true });
});
// Posting to chat (chat-send.js): GET → whether the app may (user:write:chat); POST { text, replyTo? }
app.get('/api/chat/send', async (req, res) => res.json({ canSend: await chatSend.canSend(), max: chatSend.MAX_LENGTH }));
app.post('/api/chat/send', async (req, res) => {
  try {
    res.json(await chatSend.send(req.body.text, req.body.replyTo));
  } catch (err) {
    res.status(err.messageCode ? 400 : 500).json(errorBody(err));
  }
});
// Moderation buttons (chat-mod.js): GET → { can: { ban, shoutout, raid, pin }, pinned }. Each POST answers
// what Twitch did, or a translated refusal (400).
function modRoute(fn) {
  return async (req, res) => {
    try {
      res.json(await fn(req.body || {}, req));
    } catch (err) {
      res.status(err.messageCode ? 400 : 500).json(errorBody(err));
    }
  };
}
app.get('/api/chat/mod', async (req, res) => {
  const can = await chatMod.permissions();
  res.json({ can, pinned: can.pin ? await chatMod.pinned() : null, endingRaid: endingRaid.status() });
});
app.get('/api/chat/mod/channel', modRoute((b, req) => chatMod.channel(req.query.login)));
app.post('/api/chat/mod/ban', modRoute(b => chatMod.ban(b.login, { seconds: b.seconds, reason: b.reason })));
app.post('/api/chat/mod/unban', modRoute(b => chatMod.unban(b.login)));
app.post('/api/chat/mod/shoutout', modRoute(b => registerShoutout.shoutout(b.login)));   // Twitch's Shoutout + the !so clip
app.post('/api/chat/mod/raid', modRoute(b => chatMod.raid(b.login)));
app.post('/api/chat/mod/raid/cancel', modRoute(() => endingRaid.active() ? endingRaid.stop('canceled') : chatMod.cancelRaid()));
// Raid with the ending roll (ending-raid.js): GET → the channel and when the roll and the raid would go; POST starts it
app.get('/api/chat/mod/raid/roll', modRoute((b, req) => endingRaid.plan(req.query.login)));
app.post('/api/chat/mod/raid/roll', modRoute(b => endingRaid.start(b.login)));
app.post('/api/chat/mod/pin', modRoute(b => chatMod.pin(b.id, b.seconds)));
app.post('/api/chat/mod/unpin', modRoute(b => chatMod.unpin(b.id)));

// ── Modes (modes.js, stream-app.js) ───────────────────────────────────────────
// GET → { modes, active, held, connection, live, issues }; live = what Streamlabs / OBS shows now.
// ?live=0 leaves the streaming app alone. Refusals come back translated (400).
app.get('/api/modes', async (req, res) => res.json(await modes.view({ live: req.query.live !== '0' })));
// Clips waiting while a mode holds them (top bar): GET the list; ▶ play one now; ✕ drop one
app.get('/api/media/waiting', (req, res) => res.json({ waiting: mediaQueue.waiting() }));
app.post('/api/media/waiting/play', (req, res) => res.json({ ok: mediaQueue.playQueued(Number(req.body.id)) }));
app.post('/api/media/waiting/drop', (req, res) => res.json({ ok: mediaQueue.dropQueued(Number(req.body.id)) }));
app.post('/api/modes/switch', modRoute(b => modes.apply(b.id)));
app.post('/api/modes/new', modRoute(b => modes.create(b)));
app.post('/api/modes/save', modRoute(b => modes.update(b.mode)));
app.post('/api/modes/recapture', modRoute(b => modes.recapture(b.id)));
app.post('/api/modes/delete', modRoute(b => { modes.remove(b.id); return { ok: true }; }));
app.post('/api/modes/order', modRoute(b => { modes.reorder(b.ids); return { ok: true }; }));
// { app: 'streamlabs' | 'obs' | '', port?, secret? } — secret left out keeps the saved one
app.post('/api/modes/connection', modRoute(async (b) => {
  const app = streamApp.APPS[b.app] ? b.app : '';
  const values = { STREAM_APP: app };
  if (app) {
    const port = Number(b.port);
    if (b.port != null && b.port !== '') {
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new UserError('streamAppBadPort', {}, 'The port is a number from 1 to 65535.');
      values[app === 'obs' ? 'OBS_WS_PORT' : 'STREAMLABS_PORT'] = String(port);
    }
    if (typeof b.secret === 'string') values[app === 'obs' ? 'OBS_WS_PASSWORD' : 'STREAMLABS_TOKEN'] = b.secret.trim();
  }
  setupRouter.writeEnvValues(values);
  streamApp.close();
  return modes.view();
}));

// !endingtk: whether new followers come in (needs moderator:read:followers), and who it would thank now
app.get('/api/credits', async (req, res) => {
  const groups = await endingCredits.gather();
  res.json({ follows: followStatus(), bits: bitsStatus(), lastAt: endingCredits.lastRunAt() || null, groups: groups.map(g => ({ key: g.key, count: g.people.length })) });
});

// ── Channel-point redemptions (redemptions.js) ─────────────────────────────────
// Which rewards' redemptions the Chat tab can mark done / refund, and the channel for Twitch's own queue
app.get('/api/redemptions/manageable', async (req, res) => {
  res.json({ ids: [...await redemptions.manageableIds()], channel: await redemptions.channelLogin(), songRewards: [...redemptions.songRewardIds()] });
});
// { id, rewardId, action: 'done' | 'refund' }
app.post('/api/redemptions/status', async (req, res) => {
  const { id, rewardId, action } = req.body;
  if (!id || !rewardId || !['done', 'refund'].includes(action)) return res.status(400).json({ error: 'id, rewardId and action (done | refund) are needed' });
  try {
    const result = await redemptions.setStatus(String(rewardId), String(id), action);
    forgetRedemption(String(id));
    res.json(result);
  } catch (err) {
    res.status(err.messageCode ? 400 : 500).json(errorBody(err));
  }
});
// 👕 Outfits (server/outfits.js): veadotube's avatar states, the redemptions waiting for a pick, the settings
app.get('/api/outfits', (req, res) => res.json(outfits.status()));
app.get('/api/outfits/thumb', async (req, res) => {
  const png = await outfits.thumb(String(req.query.window || ''), String(req.query.state || ''));
  if (!png) return res.status(404).end();
  res.set('Cache-Control', 'max-age=300').type('png').send(png);
});
app.post('/api/outfits/pick', (req, res) => {
  if (!req.body.state) return res.status(400).json({ error: 'state is needed' });
  try {
    outfits.pick(String(req.body.state), req.body.id ? String(req.body.id) : '', req.body.window ? String(req.body.window) : '');
    res.json(outfits.status());
  } catch (err) {
    res.status(err.messageCode ? 400 : 500).json(errorBody(err));
  }
});
app.post('/api/outfits/drop', (req, res) => {
  outfits.drop(String(req.body.id || ''), !!req.body.refund);
  res.json(outfits.status());
});
app.post('/api/outfits/keep', (req, res) => {
  outfits.keep();
  res.json(outfits.status());
});
app.post('/api/outfits/settings', (req, res) => {
  try {
    res.json(outfits.save(req.body || {}));
  } catch (err) {
    res.status(err.messageCode ? 400 : 500).json(errorBody(err));
  }
});

// 🔔 Alerts (server/alerts.js): settings, the alert-media files, the latest alerts; test, replay, skip
app.get('/api/alerts', (req, res) => res.json(alerts.status()));
app.post('/api/alerts/settings', (req, res) => {
  try {
    res.json(alerts.update(req.body || {}));
  } catch (err) {
    res.status(err.messageCode ? 400 : 500).json(errorBody(err));
  }
});
app.post('/api/alerts/test', (req, res) => {
  try {
    res.json({ ok: true, alert: alerts.test(String(req.body.kind || ''), !!req.body.big) });
  } catch (err) {
    res.status(err.messageCode ? 400 : 500).json(errorBody(err));
  }
});
app.post('/api/alerts/replay', (req, res) => res.json({ ok: !!alerts.replay(String(req.body.id || '')) }));
app.post('/api/alerts/skip', (req, res) => { alerts.skip(); res.json({ ok: true }); });

// 🎟 Reward effects (server/reward-effects.js): settings, the queue; test, skip, clear
app.get('/api/reward-effects', (req, res) => res.json(rewardEffects.status()));
app.post('/api/reward-effects/settings', (req, res) => {
  try {
    res.json(rewardEffects.update(req.body || {}));
  } catch (err) {
    res.status(err.messageCode ? 400 : 500).json(errorBody(err));
  }
});
app.post('/api/reward-effects/test', (req, res) => {
  try {
    res.json({ ok: true, effect: rewardEffects.test(String(req.body.rewardId || '')) });
  } catch (err) {
    res.status(err.messageCode ? 400 : 500).json(errorBody(err));
  }
});
app.post('/api/reward-effects/skip', (req, res) => { rewardEffects.skip(); res.json(rewardEffects.status()); });
app.post('/api/reward-effects/clear', (req, res) => { rewardEffects.clear(); res.json(rewardEffects.status()); });

// 🎟️ Rewards tab: every reward (with its main use and whether it has an effect), what each is for
// (reward-uses.js), its effect, and taking over one made on Twitch ({ id, action: 'start' | 'finish' | 'cancel' })
app.get('/api/rewards', async (req, res) => {
  try {
    const list = await redemptions.listRewards();
    res.json({ ...list, rewards: list.rewards.map(r => ({ ...r, effect: rewardEffects.hasEffect(r.id) })) });
  } catch (err) {
    res.status(500).json(errorBody(err));
  }
});
// { id, title, use: '' | 'song' | 'random' | 'outfit', tabs?: [sheet tab] (🎲) }
app.post('/api/rewards/use', (req, res) => {
  try {
    const { id, title, use, tabs } = req.body || {};
    const values = require('./reward-uses').change(String(id || ''), title, String(use ?? ''), tabs);
    if (Object.keys(values).length) setupRouter.writeEnvValues(values);
    sendChat({ type: 'rewards-changed' });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.messageCode ? 400 : 500).json(errorBody(err));
  }
});
// { id, title, on }: the reward gets a 🎟️ effect (set up in the Alerts tab) or loses it
app.post('/api/rewards/effect', (req, res) => {
  try {
    const { id, title, on } = req.body || {};
    res.json(on ? rewardEffects.attach(String(id || ''), title) : rewardEffects.detach(String(id || '')));
  } catch (err) {
    res.status(err.messageCode ? 400 : 500).json(errorBody(err));
  }
});
app.post('/api/rewards/takeover', async (req, res) => {
  const fn = { start: redemptions.startTakeover, finish: redemptions.finishTakeover, cancel: redemptions.cancelTakeover }[req.body.action];
  if (!fn || !req.body.id) return res.status(400).json({ error: 'id and action (start | finish | cancel) are needed' });
  try {
    res.json(await fn(String(req.body.id)));
  } catch (err) {
    res.status(err.messageCode ? 400 : 500).json({ ...errorBody(err), error: err.response?.data?.message || err.message });
  }
});

// New chat goes only to pages that asked for it: dashboards and the on-stream chat (overlay/chat.html)
function sendChat(msg) {
  const str = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.wantsChat && client.readyState === 1) client.send(str);
  }
}

// Alerts go to the alert overlays (overlay/alerts.html) and the dashboards (their list of the latest)
// Reward effects go to the reward-effects overlays (overlay/reward-effects.html)
function sendEffects(msg) {
  const str = JSON.stringify(msg);
  for (const client of wss.clients) if (client.wantsEffects && client.readyState === 1) client.send(str);
}
const countEffectOverlays = () => rewardEffects.setOverlays([...wss.clients].filter(c => c.wantsEffects && c.readyState === 1).length);

function sendAlerts(msg) {
  const str = JSON.stringify(msg);
  for (const client of wss.clients) {
    if ((client.wantsAlerts || client.wantsChat) && client.readyState === 1) client.send(str);
  }
}

// ── WebSocket (overlay + clip-player + dashboard) ────────────────────────────
wss.on('connection', (ws, req) => {
  console.log(`[ws] Client connected from ${req.socket.remoteAddress}`);
  registerClient(ws);
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'media-ended') mediaQueue.onEnded(msg.mediaId);
      if (msg.type === 'chat-subscribe') ws.wantsChat = true;
      if (msg.type === 'alerts-subscribe') ws.wantsAlerts = true;
      if (msg.type === 'reward-effects-subscribe') { ws.wantsEffects = true; countEffectOverlays(); }
      if (msg.type === 'reward-effect-ended') rewardEffects.ended(String(msg.id || ''));
    } catch {}
  });
  ws.on('close', () => { if (ws.wantsEffects) countEffectOverlays(); });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

// This PC's addresses another device on the network can open (IPv4, not loopback or a link-local one)
function lanAddresses() {
  const out = [];
  for (const list of Object.values(require('os').networkInterfaces())) {
    for (const a of list || []) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal && !a.address.startsWith('169.254.')) out.push(a.address);
    }
  }
  return out;
}

async function start() {
  console.log('\n🎵 VTuber Song Queue starting...\n');
  const node = nodeStatus();
  if (node.outdated) console.warn(`[node] Node.js ${node.version} is missing security fixes — install ${node.minimum} or newer from https://nodejs.org\n`);

  if (isSetupComplete()) {
    await activateServiceIfReady();
  } else {
    console.log('[setup] Configuration incomplete.');
    console.log('[setup] Please open http://localhost:' + PORT + '/setup to configure.');
  }

  generateSponsorVoice();
  // Every new chat-log record may be an alert (a follow, sub, gift, cheer, raid, chosen redemption)
  const sendChatAndAlert = (msg) => {
    sendChat(msg);
    if (msg.type !== 'chat') return;
    try { alerts.fromRecord(msg.record); } catch (err) { console.error('[alerts] Could not make an alert:', err.message); }
    try { rewardEffects.fromRecord(msg.record); } catch (err) { console.error('[reward-effects] Could not start an effect:', err.message); }
  };
  await chatLog.init(sendChatAndAlert).catch(err => console.error('[chat-log] Could not read the chat log:', err.message));
  fs.mkdirSync(alerts.MEDIA_DIR, { recursive: true });
  leihu.start();

  server.listen(PORT, () => {
    console.log(`\n✅ Song Queue ${APP_VERSION} running at http://localhost:${PORT}`);
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
