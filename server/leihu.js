// server/leihu.js
// Optional link to Leihu Singsing (雷虎練唱台), a separate app on the same PC that
// splits songs into backing tracks, transposes them and shows timed lyrics.
// We only call its existing local API. While it isn't running, every song shows
// as "offline" and the song queue works exactly as without it.
//
// A queue entry is linked to a Leihu song in one of two ways:
//   1. The sheet's YouTube link column (config.YT_LINK_HEADER, filled by the
//      link finder) has the same video
//      as the Leihu song's source_url — compared by video ID.
//   2. A manual link picked on the dashboard, saved in song-links.json
//      (for songs imported into Leihu as audio files).

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getSongs } = require('./sheets');
const { getState } = require('./queue');
const config = require('./config');
const { UserError } = require('./messages');
const launcher = require('./leihu-launcher');

const LINKS_PATH = process.env.LEIHU_LINKS_FILE || path.join(__dirname, '..', 'song-links.json');   // tests use a temp file
const POLL_MS = 5000;
const OFFLINE_POLL_MS = 30000;
const BULK_GAP_MS = Number(process.env.LEIHU_BULK_GAP_MS || 30000);   // pause between bulk downloads
const BULK_AHEAD = Number(process.env.LEIHU_BULK_AHEAD || 3);   // Leihu 1.6.1 processes one song and downloads the next two

let library = null;          // Leihu's songs, or null while it can't be reached
let activeJobs = new Set();  // Leihu song IDs with a queued/running job
let runningJobs = new Set(); // Leihu song IDs with a running job
let ytJobs = 0;              // Leihu's queued/running YouTube imports, from any source
let jobErrors = new Map();   // Leihu song ID → error of its last failed job (Leihu keeps them ~10 min)
let canOpen = false;         // Leihu supports remote open, 1.5.2+ (/api/status reports `remote`)
let ytPause = null;          // Leihu 1.6+: { on, reason } while it has paused YouTube downloads
const requested = new Map(); // import/key-render/lyrics tag → 'sent' | 'failed', for this run
const imported = new Map();  // video ID → sheet { title, artist }, for songs we imported this run
let links = loadLinks();

function baseUrl() {
  return (process.env.LEIHU_URL || 'http://127.0.0.1:8765').replace(/\/+$/, '');
}

function autoPrepareEnabled() {
  return process.env.LEIHU_AUTO_PREPARE === '1';
}

// Start Leihu (without its window) together with the song queue
function autoStartEnabled() {
  return process.env.LEIHU_AUTOSTART === '1';
}

// Starts Leihu without its window (unless it runs) and reads its library right away.
async function launch() {
  const result = await launcher.start(baseUrl());
  await refresh();
  return result;
}

function closeLeihu() {
  const closed = launcher.stop();
  if (closed) library = null;   // shows offline at once; the next poll confirms
  return closed;
}

// Title + artist identify a song (same rule as the sheet dedupe in sheets.js).
function songKey(title, artist) {
  return `${(title || '').trim().toLowerCase()}|${(artist || '').trim().toLowerCase()}`;
}

// 11-character YouTube video ID from any common link form, or null.
function videoId(url) {
  if (!url) return null;
  let u;
  try { u = new URL(url.includes('://') ? url : 'https://' + url); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1];
  else if (host === 'youtube.com') {
    const m = u.pathname.match(/^\/(shorts|live|embed)\/([^/]+)/);
    id = m ? m[2] : u.searchParams.get('v');
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null;
}

// Sheet key as a Leihu transpose amount: whole semitones within ±6, else null.
function transpose(key) {
  if (key == null || !/^-?\d+$/.test(String(key).trim())) return null;
  const k = Number(key);
  return Math.abs(k) <= 6 ? k : null;
}

function loadLinks() {
  try { return JSON.parse(fs.readFileSync(LINKS_PATH, 'utf8')); } catch { return {}; }
}

function setLink(title, artist, leihuId) {
  const k = songKey(title, artist);
  if (leihuId) links[k] = leihuId;
  else delete links[k];
  fs.writeFileSync(LINKS_PATH, JSON.stringify(links, null, 2));
}

async function refresh() {
  const wasOnline = library !== null;
  try {
    const [songsRes, statusRes] = await Promise.all([
      axios.get(`${baseUrl()}/api/songs`, { timeout: 3000 }),
      axios.get(`${baseUrl()}/api/status`, { timeout: 3000 }),
    ]);
    library = songsRes.data.map(m => ({
      id: m.id,
      title: m.title,
      videoId: videoId(m.source_url),
      complete: !!(m.steps && m.steps.import && m.steps.separate && m.steps.pitch && m.steps.lyrics),
      // Leihu 1.4.7+ finishes the lyrics step with blank lyrics when its recognition is unreliable
      hasLyrics: !!(m.lyrics_text && m.lyrics_text.trim()),
      lyricsSource: m.lyrics_source || null,
      lyricsPending: !!m.lyrics_pending,   // Leihu's "online lyrics available" chip
      // Leihu 1.6+: YouTube download not finished — queued | paused | failed | cancelled
      dlState: (m.steps && m.steps.import) ? null : (m.dl_state || null),
    }));
    ytPause = statusRes.data.yt_pause || null;
    canOpen = 'remote' in statusRes.data;
    launcher.remember(statusRes.data.root);   // so the dashboard can start Leihu next time
    activeJobs = new Set((statusRes.data.jobs || [])
      .filter(j => j.status === 'queued' || j.status === 'running')
      .map(j => j.song));
    runningJobs = new Set((statusRes.data.jobs || []).filter(j => j.status === 'running').map(j => j.song));
    ytJobs = (statusRes.data.jobs || [])
      .filter(j => j.label === 'youtube' && (j.status === 'queued' || j.status === 'running')).length;
    jobErrors = new Map((statusRes.data.jobs || [])
      .filter(j => j.status === 'error' && j.error)
      .map(j => [j.song, j.error]));
    if (!wasOnline) console.log(`[leihu] Connected — ${library.length} songs in Leihu Singsing`);
  } catch (err) {
    library = null;
    activeJobs = new Set();
    runningJobs = new Set();
    ytJobs = 0;
    jobErrors = new Map();
    canOpen = false;
    ytPause = null;
    if (wasOnline) console.log(`[leihu] Leihu Singsing not reachable (${err.message})`);
  }
}

// For a failed song: { failure: { reason, blocked } } to spread into its status
function failureOf(song) {
  const f = songState(song) === 'failed' && failure(song.id);
  return f ? { failure: f } : {};
}

function sheetSong(title, artist) {
  const k = songKey(title, artist);
  return getSongs().find(s => songKey(s.title, s.artist) === k) || null;
}

// YouTube refusing yt-dlp ("Sign in to confirm you're not a bot … --cookies"): a block on this
// PC's connection, not a problem with the video. Leihu cuts its message, so match any part.
function youtubeBlocked(text) {
  return /not a bot|confirm you.re not|cookies-from-browser|pass-cookies|exporting-youtube-cookies/i.test(text || '');
}

// Why Leihu's last job for this song failed, if Leihu still remembers: { reason, blocked }.
// A download Leihu paused because YouTube is limiting this PC adds `paused: true`.
function failure(id) {
  const song = (library || []).find(s => s.id === id);
  if (song && song.dlState === 'paused') {
    const reason = (ytPause && ytPause.reason) || jobErrors.get(id) || '';
    return { reason, blocked: youtubeBlocked(reason), paused: true };
  }
  const reason = jobErrors.get(id);
  return reason ? { reason, blocked: youtubeBlocked(reason) } : null;
}

function songState(song) {
  // A finished song can be sung while Leihu still works on it: a key render, or Leihu 1.6.1's
  // clean-up pass for songs with heavy backing vocals (lyrics stay as they are)
  if (song.complete) return song.hasLyrics ? 'ready' : 'nolyrics';
  return activeJobs.has(song.id) || song.dlState === 'queued' ? 'processing' : 'failed';
}

// Leihu's recognition language for a sheet tab (config.LEIHU_TAB_LANGUAGES), or null = automatic.
function tabLanguage(tab) {
  return (config.LEIHU_TAB_LANGUAGES || {})[tab] || null;
}

// Import a YouTube video into Leihu and set its recognition language from the sheet tab.
// Returns Leihu's new song ID. Setting the language needs Leihu 1.4.7+ (older versions ignore it).
// `song` (the sheet's { title, artist }) lets fillMissingLyrics() fill the lyrics if Leihu
// leaves them blank. Imports for the stream move ahead of the sheet songs "Prepare all" queued;
// `bulk` (from bulkStep) leaves the song at the back.
async function importVideo(vid, tab, song = null, { bulk: fromBulk = false } = {}) {
  const res = await axios.post(`${baseUrl()}/api/youtube`, { url: `https://www.youtube.com/watch?v=${vid}` }, { timeout: 10000 });
  const id = res.data && res.data.id;
  if (song) imported.set(vid, { title: song.title, artist: song.artist });
  if (!fromBulk) await toFront(res.data && res.data.job);
  const lang = tabLanguage(tab);
  if (id && lang) {
    await axios.patch(`${baseUrl()}/api/songs/${id}`, { lyrics_language: lang }, { timeout: 5000 })
      .catch(err => console.error(`[leihu] Could not set language for ${id}:`, err.message));
  }
  return id;
}

// Leihu works through its queue in order. A job for the stream moves ahead of everything else
// waiting there — the sheet songs "Prepare all" queued, songs the streamer queued in Leihu
// (its sheet import takes up to 1000), clean-up passes — but stays behind earlier stream songs,
// which are all at the front. Leihu's download-ahead takes the first queued YouTube jobs, so
// it downloads this one next. Leihu 1.6.3+ lists only the first 30 queued jobs in /api/status,
// so the distance comes from the job itself (`ahead`).
const streamJobs = new Set();   // Leihu job IDs of songs sent for the stream

async function toFront(jid) {
  if (!jid) return;
  streamJobs.add(jid);
  try {
    const [{ data: job }, { data: st }] = await Promise.all([
      axios.get(`${baseUrl()}/api/jobs/${jid}`, { timeout: 3000 }),
      axios.get(`${baseUrl()}/api/status`, { timeout: 3000 }),
    ]);
    const streamAhead = (st.jobs || []).filter(j => j.id !== jid && j.status === 'queued' && streamJobs.has(j.id)).length;
    for (let n = (job.ahead || 0) - streamAhead; n > 0; n--) {
      await axios.post(`${baseUrl()}/api/jobs/${jid}/move`, { delta: -1 }, { timeout: 5000 });
    }
  } catch (err) {
    console.error('[leihu] Could not move a stream song ahead in Leihu:', err.response?.data?.error || err.message);
  }
}

// Letters and digits only, lowercase; brackets dropped ("四照花 (Chinese Ver.)" → "四照花").
function plainTitle(s) {
  return (s || '').replace(/[(（[【［].*?[)）\]】］]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

// Same name, allowing one character written in another form (松任谷由實 / 松任谷由実)
function sameName(a, b) {
  if (a.includes(b) || b.includes(a)) return true;
  const x = [...a], y = [...b];
  return x.length >= 3 && x.length === y.length && x.filter((ch, i) => ch !== y[i]).length <= 1;
}

// A Leihu lyric candidate that is surely this song's recording: timed lyrics, the sheet's
// title, the sheet's artist, and within 3 s of the audio (Leihu then uses its timing as-is).
// Leihu converts lyrics to Taiwan characters (来 → 來), so its own title_match — every
// character of the lyric's title found in the YouTube title, compared in one form — also counts.
// Replacing lyrics Leihu recognized also needs the words to agree with that recognition.
function lyricFits(c, song, replace = false) {
  const artist = plainTitle(song.artist);
  const cArtist = plainTitle(c.artist);
  return !!c.synced && c.diff != null && c.diff <= 3
    && (plainTitle(c.track) === plainTitle(song.title) || (c.title_match >= 1 && [...plainTitle(c.track)].length >= 2))
    && !!artist && !!cArtist && sameName(artist, cArtist)
    && (!replace || c.similarity >= 0.5);
}

// Fill lyrics with a fitting online lyric: first from the candidates Leihu saved while
// processing, else from Leihu's lyric search by the sheet's title + artist (Leihu's own search
// used the YouTube title, which may be romanized). Returns true when lyrics were applied.
async function fillLyrics(id, song, replace = false) {
  const pick = list => (list || []).filter(c => lyricFits(c, song, replace)).sort((a, b) => a.diff - b.diff)[0];
  let cand = pick((await axios.get(`${baseUrl()}/api/songs/${id}/lyrics/candidates`, { timeout: 60000 })).data.results);
  if (!cand) {
    const q = `${song.title} ${song.artist || ''}`.trim();
    cand = pick((await axios.get(`${baseUrl()}/api/songs/${id}/lyrics/search`, { params: { q }, timeout: 60000 })).data.results);
  }
  if (!cand) {
    console.log(`[leihu] No fitting online lyrics for "${song.title}" — pick them in Leihu`);
    return false;
  }
  await axios.post(`${baseUrl()}/api/songs/${id}/lyrics/apply`, { candidate: cand }, { timeout: 60000 });
  console.log(`[leihu] ${replace ? 'Replaced the recognized' : 'Filled the blank'} lyrics of "${song.title}" from ${cand.source} (${cand.track} / ${cand.artist})`);
  return true;
}

// Songs we imported, or whose video is the sheet's link, get fitting online lyrics when
// Leihu finished with blank lyrics (its recognition was unreliable), or kept its own
// recognition while flagging that online lyrics fit (its "有線上歌詞可選" chip). Lyrics picked
// in Leihu — online, by hand, or "keep the recognized ones" — are never replaced. Once per song per run.
async function fillMissingLyrics() {
  for (const s of library || []) {
    const state = songState(s);
    const replace = state === 'ready' && s.lyricsPending && s.lyricsSource === 'whisper';
    if (state !== 'nolyrics' && !replace) continue;
    const sheetRow = s.videoId && getSongs().find(r => videoId(r.url) === s.videoId);
    const song = imported.get(s.videoId) || (sheetRow && { title: sheetRow.title, artist: sheetRow.artist });
    if (!song) continue;
    const tag = `lyrics:${s.id}`;
    if (requested.has(tag)) continue;
    requested.set(tag, 'sent');
    try {
      await fillLyrics(s.id, song, replace);
    } catch (err) {
      requested.set(tag, 'failed');
      console.error(`[leihu] Filling lyrics of "${song.title}" failed:`, err.response?.data?.error || err.message);
    }
  }
}

// Where a queue entry stands in Leihu:
//   offline     — Leihu isn't running
//   ready       — linked and fully processed
//   nolyrics    — processed, but Leihu left the lyrics blank (pick them in Leihu)
//   processing  — linked, Leihu is working on it
//   failed      — linked, but processing stopped before finishing
//   missing     — sheet has a YouTube link that isn't in Leihu yet (can import)
//   broken      — manual link to a song that's no longer in Leihu
//   unlinked    — no YouTube link and no manual link
function statusFor(title, artist) {
  if (!library) return { state: 'offline' };
  const linkedId = links[songKey(title, artist)];
  if (linkedId) {
    const song = library.find(s => s.id === linkedId);
    if (!song) return { state: 'broken', manual: true };
    return { state: songState(song), id: song.id, leihuTitle: song.title, manual: true, ...failureOf(song) };
  }
  const vid = videoId(sheetSong(title, artist)?.url);
  if (!vid) return { state: 'unlinked' };
  const song = library.find(s => s.videoId === vid);
  if (!song) {
    const sent = requested.get(`import:${vid}`);
    return { state: sent === 'sent' ? 'processing' : sent === 'failed' ? 'failed' : 'missing' };
  }
  return { state: songState(song), id: song.id, leihuTitle: song.title, ...failureOf(song) };
}

// Import a missing song, or render its sheet key once it's ready.
// Each request is sent at most once per server run; `retry` (the dashboard's
// Prepare button) lets a failed import be sent again, and asks Leihu 1.6+ to download
// again a song whose YouTube download failed, was cancelled or was paused.
async function prepare(entry, { retry = false } = {}) {
  const vid = videoId(sheetSong(entry.title, entry.artist)?.url);
  if (retry && requested.get(`import:${vid}`) === 'failed') requested.delete(`import:${vid}`);
  const status = statusFor(entry.title, entry.artist);
  const song = status.id && library.find(s => s.id === status.id);
  if (retry && status.state === 'failed' && song && song.dlState) {
    try {
      const res = await axios.post(`${baseUrl()}/api/songs/${song.id}/redownload`, {}, { timeout: 10000 });
      await toFront(res.data && res.data.job);
      console.log(`[leihu] Downloading "${entry.title}" again`);
    } catch (err) {
      console.error(`[leihu] Download retry of "${entry.title}" failed:`, err.response?.data?.error || err.message);
    }
  } else if (status.state === 'missing') {
    const tag = `import:${vid}`;
    if (requested.has(tag)) return;
    requested.set(tag, 'sent');
    try {
      await importVideo(vid, sheetSong(entry.title, entry.artist)?.tab, entry);
      console.log(`[leihu] Importing "${entry.title}" from YouTube`);
    } catch (err) {
      requested.set(tag, 'failed');
      console.error(`[leihu] Import of "${entry.title}" failed:`, err.response?.data?.error || err.message);
    }
  } else if (status.state === 'ready' || status.state === 'nolyrics') {
    const k = transpose(entry.key);
    if (!k) return;
    const tag = `key:${status.id}:${k}`;
    if (requested.has(tag)) return;
    requested.set(tag, 'sent');
    try {
      await axios.post(`${baseUrl()}/api/songs/${status.id}/variant`, { key: k, speed: 1 }, { timeout: 10000 });
      console.log(`[leihu] Rendering "${entry.title}" at key ${k > 0 ? '+' : ''}${k}`);
    } catch (err) {
      console.error(`[leihu] Key render of "${entry.title}" failed:`, err.response?.data?.error || err.message);
    }
  }
}

// ── Prepare the whole sheet ("Prepare all" in the dashboard's Leihu settings) ──
// Keeps up to BULK_AHEAD of the sheet's songs in Leihu's queue, so Leihu 1.6.1 downloads the
// next ones while the GPU works on the current one. A new one goes in at most every BULK_GAP_MS,
// so YouTube sees a slow, steady trickle, and none while Leihu already has BULK_AHEAD YouTube
// imports waiting. Songs for the stream move ahead of them (toFront). Stops when Leihu pauses
// its downloads for a YouTube limit.
const bulk = { state: 'idle', total: 0, done: 0, failed: 0, todo: [], inFlight: [], reason: '', nextAt: 0 };

// Sheet songs with a YouTube link that Leihu hasn't finished: { vid, title, artist, tab, retryId }.
// `todo` still needs sending; `waiting` is already queued in Leihu, with its Leihu `id`.
function bulkScan() {
  const seen = new Set();
  const todo = [], waiting = [];
  for (const s of getSongs()) {
    const vid = videoId(s.url);
    if (!vid || seen.has(vid) || links[songKey(s.title, s.artist)]) continue;
    seen.add(vid);
    const song = (library || []).find(m => m.videoId === vid);
    const item = { vid, title: s.title, artist: s.artist, tab: s.tab, retryId: song ? song.id : null };
    if (song && !song.dlState) continue;                                   // imported (or being processed)
    if (song && (song.dlState === 'queued' || activeJobs.has(song.id))) waiting.push({ ...item, id: song.id });
    else todo.push(item);
  }
  return { todo, waiting };
}

function bulkTodo() {
  return bulkScan().todo;
}

// For the dashboard's two "get your song list ready" steps: sheet songs, how many have a
// YouTube link, and how many of those Leihu still needs (null while Leihu is offline).
function sheetCounts() {
  const songs = getSongs();
  const linked = songs.filter(s => videoId(s.url)).length;
  return { songs: songs.length, linked, todo: library ? bulkTodo().length : null };
}

async function startBulk() {
  await refresh();
  if (!library) throw new UserError('leihuOffline', {}, 'Leihu Singsing is not running');
  if (bulk.state === 'running') return bulkStatus();
  // Starting again after a YouTube pause is the streamer saying the limit has cleared
  if (ytPause && ytPause.on) {
    await axios.post(`${baseUrl()}/api/youtube/resume`, {}, { timeout: 10000 })
      .catch(err => console.error('[leihu] Could not resume YouTube downloads:', err.message));
    await refresh();   // Leihu queued its paused songs again: they count as sent, not to send
  }
  // Sheet songs already waiting in Leihu (resumed just now, or sent before a restart) are part of the run
  const { todo, waiting } = bulkScan();
  const total = todo.length + waiting.length;
  Object.assign(bulk, { state: total ? 'running' : 'done', total, done: 0, failed: 0,
    todo, inFlight: waiting.map(w => ({ ...w, sentAt: Date.now() })), reason: '', nextAt: 0 });
  console.log(`[leihu] Preparing ${total} sheet songs in Leihu, up to ${BULK_AHEAD} queued at a time`);
  return bulkStatus();
}

// Songs already sent stay in Leihu's queue and finish there.
function stopBulk() {
  if (bulk.state === 'running' || bulk.state === 'paused') {
    bulk.state = 'stopped';
    bulk.todo = [];
    bulk.inFlight = [];
    console.log('[leihu] Stopped preparing the sheet');
  }
  return bulkStatus();
}

// `current` is the sheet song Leihu is working on now, null while it works on something else.
function bulkStatus() {
  const { state, total, done, failed, reason } = bulk;
  const cur = bulk.inFlight.find(f => runningJobs.has(f.id));
  return { state, total, done, failed, left: bulk.todo.length + bulk.inFlight.length, reason,
    current: cur ? cur.title : null };
}

async function bulkStep() {
  if (bulk.state !== 'running' || !library) return;
  for (const cur of [...bulk.inFlight]) {
    const song = library.find(m => m.videoId === cur.vid);
    const st = song ? songState(song) : (Date.now() - cur.sentAt > 60000 ? 'failed' : 'processing');
    if (st === 'processing') continue;
    bulk.inFlight.splice(bulk.inFlight.indexOf(cur), 1);
    if (song && song.dlState === 'paused') {
      bulk.todo.unshift({ ...cur, retryId: song.id });   // Leihu keeps it paused; try it first next time
    } else if (st === 'failed') {
      bulk.failed++;
      console.log(`[leihu] Preparing "${cur.title}" failed — moving on`);
    } else {
      bulk.done++;
    }
  }
  if (ytPause && ytPause.on) {
    bulk.state = 'paused';
    bulk.reason = ytPause.reason || '';
    console.log('[leihu] YouTube is limiting downloads — stopped preparing the sheet');
    return;
  }
  if (!bulk.todo.length) {
    if (!bulk.inFlight.length) {
      bulk.state = 'done';
      console.log(`[leihu] Finished preparing the sheet: ${bulk.done} ready, ${bulk.failed} failed`);
    }
    return;
  }
  // Enough waiting in Leihu to keep it busy, or resting between downloads
  if (bulk.inFlight.length >= BULK_AHEAD || ytJobs >= BULK_AHEAD || Date.now() < bulk.nextAt) return;
  const next = bulk.todo.shift();
  bulk.nextAt = Date.now() + BULK_GAP_MS;
  try {
    let id = next.retryId;
    if (id) {
      // Leihu's redownload also lifts its YouTube pause: make sure there is none right now
      const { data } = await axios.get(`${baseUrl()}/api/status`, { timeout: 3000 });
      if (data.yt_pause && data.yt_pause.on) {
        ytPause = data.yt_pause;
        bulk.todo.unshift(next);
        return;   // the next step stops the run as paused
      }
      await axios.post(`${baseUrl()}/api/songs/${id}/redownload`, {}, { timeout: 10000 });
    } else {
      id = await importVideo(next.vid, next.tab, next, { bulk: true });
    }
    bulk.inFlight.push({ ...next, id, sentAt: Date.now() });
    console.log(`[leihu] Preparing "${next.title}" (${bulk.total - bulk.todo.length}/${bulk.total})`);
  } catch (err) {
    console.error(`[leihu] Could not send "${next.title}" to Leihu:`, err.response?.data?.error || err.message);
    bulk.failed++;
  }
}

async function tick() {
  await refresh();
  await fillMissingLyrics();
  await bulkStep().catch(err => console.error('[leihu] Preparing the sheet:', err.message));
  if (library && autoPrepareEnabled()) {
    const { nowPlaying, queue } = getState();
    for (const entry of [nowPlaying, ...queue]) {
      if (entry && entry.title) await prepare(entry);
    }
  }
  setTimeout(() => tick().catch(() => {}), library ? POLL_MS : OFFLINE_POLL_MS);
}

function start() {
  if (autoStartEnabled()) {
    launch().catch(err => console.error('[leihu] Could not start Leihu Singsing:', err.message));
  }
  tick().catch(() => {});
}

// Status of every song on screen, keyed by songKey(), for the dashboard badges.
function getStatus() {
  const { nowPlaying, queue } = getState();
  const songs = {};
  for (const entry of [nowPlaying, ...queue]) {
    if (entry && entry.title) songs[songKey(entry.title, entry.artist)] = statusFor(entry.title, entry.artist);
  }
  // `url`: Leihu's own screen, shown in the dashboard's Leihu tab; `launched`/`starting`: the
  // song queue started Leihu without its window (leihu-launcher.js)
  return { online: !!library, url: baseUrl(), ...launcher.status(), autoStart: autoStartEnabled(), canOpen,
    autoPrepare: autoPrepareEnabled(), songs, bulk: bulkStatus(), sheet: sheetCounts() };
}

function getLibrary() {
  return (library || []).map(s => ({ id: s.id, title: s.title, state: songState(s) }));
}

// Leihu song (id + state) imported from this YouTube video, or null. Null also while offline.
function findByVideo(vid) {
  const song = (library || []).find(s => s.videoId === vid);
  return song ? { id: song.id, state: songState(song) } : null;
}

// A song that isn't on the sheet (a viewer's off-list request): imports its video unless
// Leihu already has it, and links it by title + artist (song-links.json), so badges, key
// renders, Sing and the lyric fill work as for sheet songs. `tab` only picks Leihu's
// recognition language (tabLanguage). Returns Leihu's song ID.
async function importForSong(vid, song, tab) {
  await refresh();
  if (!library) throw new UserError('leihuOffline', {}, 'Leihu Singsing is not running');
  let id = findByVideo(vid)?.id;
  if (!id) {
    const tag = `import:${vid}`;
    if (requested.get(tag) === 'sent') throw new UserError('alreadyImporting', {}, 'this video is already being imported');
    requested.set(tag, 'sent');
    try {
      id = await importVideo(vid, tab, song);
    } catch (err) {
      requested.set(tag, 'failed');
      throw err;
    }
    console.log(`[leihu] Importing "${song.title}" (not on the sheet) from YouTube`);
  } else {
    imported.set(vid, { title: song.title, artist: song.artist });
  }
  setLink(song.title, song.artist, id);
  return id;
}

// Ask Leihu's practice window to open a ready song at its sheet key (0 if the key
// can't be used). Needs Leihu 1.5.2+. Returns the key used.
async function open(entry) {
  if (!canOpen) throw new UserError('noRemoteOpen', {}, 'Leihu Singsing does not support remote open');
  const status = statusFor(entry.title, entry.artist);
  if (status.state !== 'ready' && status.state !== 'nolyrics') {
    throw new UserError('notReady', { state: status.state }, `song is not ready in Leihu (${status.state})`);
  }
  const key = transpose(entry.key) ?? 0;
  await axios.post(`${baseUrl()}/api/remote/open`, { id: status.id, key }, { timeout: 5000 });
  console.log(`[leihu] Opening "${entry.title}" at key ${key > 0 ? '+' : ''}${key}`);
  return key;
}

module.exports = {
  start, getStatus, getLibrary, findByVideo, setLink, prepare, open, refresh, importVideo, importForSong, tabLanguage,
  fillMissingLyrics, failure, youtubeBlocked, baseUrl, videoId, transpose, songKey,
  startBulk, stopBulk, bulkStatus, bulkStep, sheetCounts, launch, closeLeihu,
};
