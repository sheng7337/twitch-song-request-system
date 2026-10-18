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

const LINKS_PATH = path.join(__dirname, '..', 'song-links.json');
const POLL_MS = 5000;
const OFFLINE_POLL_MS = 30000;

let library = null;          // Leihu's songs, or null while it can't be reached
let activeJobs = new Set();  // Leihu song IDs with a queued/running job
let jobErrors = new Map();   // Leihu song ID → error of its last failed job (Leihu keeps them ~10 min)
let canOpen = false;         // Leihu has the remote-open patch (/api/status reports `remote`)
const requested = new Map(); // import/key-render/lyrics tag → 'sent' | 'failed', for this run
const imported = new Map();  // video ID → sheet { title, artist }, for songs we imported this run
let links = loadLinks();

function baseUrl() {
  return (process.env.LEIHU_URL || 'http://127.0.0.1:8765').replace(/\/+$/, '');
}

function autoPrepareEnabled() {
  return process.env.LEIHU_AUTO_PREPARE === '1';
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
    }));
    canOpen = 'remote' in statusRes.data;
    activeJobs = new Set((statusRes.data.jobs || [])
      .filter(j => j.status === 'queued' || j.status === 'running')
      .map(j => j.song));
    jobErrors = new Map((statusRes.data.jobs || [])
      .filter(j => j.status === 'error' && j.error)
      .map(j => [j.song, j.error]));
    if (!wasOnline) console.log(`[leihu] Connected — ${library.length} songs in Leihu Singsing`);
  } catch (err) {
    library = null;
    activeJobs = new Set();
    jobErrors = new Map();
    canOpen = false;
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

// Why Leihu's last job for this song failed, if Leihu still remembers: { reason, blocked }
function failure(id) {
  const reason = jobErrors.get(id);
  return reason ? { reason, blocked: youtubeBlocked(reason) } : null;
}

function songState(song) {
  if (activeJobs.has(song.id)) return 'processing';
  if (!song.complete) return 'failed';
  return song.hasLyrics ? 'ready' : 'nolyrics';
}

// Leihu's recognition language for a sheet tab (config.LEIHU_TAB_LANGUAGES), or null = automatic.
function tabLanguage(tab) {
  return (config.LEIHU_TAB_LANGUAGES || {})[tab] || null;
}

// Import a YouTube video into Leihu and set its recognition language from the sheet tab.
// Returns Leihu's new song ID. Setting the language needs Leihu 1.4.7+ (older versions ignore it).
// `song` (the sheet's { title, artist }) lets fillMissingLyrics() fill the lyrics if Leihu
// leaves them blank.
async function importVideo(vid, tab, song = null) {
  const res = await axios.post(`${baseUrl()}/api/youtube`, { url: `https://www.youtube.com/watch?v=${vid}` }, { timeout: 10000 });
  const id = res.data && res.data.id;
  if (song) imported.set(vid, { title: song.title, artist: song.artist });
  const lang = tabLanguage(tab);
  if (id && lang) {
    await axios.patch(`${baseUrl()}/api/songs/${id}`, { lyrics_language: lang }, { timeout: 5000 })
      .catch(err => console.error(`[leihu] Could not set language for ${id}:`, err.message));
  }
  return id;
}

// Letters and digits only, lowercase; brackets dropped ("四照花 (Chinese Ver.)" → "四照花").
function plainTitle(s) {
  return (s || '').replace(/[(（[【［].*?[)）\]】］]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

// A Leihu lyric candidate that is surely this song's recording: timed lyrics, the sheet's
// title, the sheet's artist, and within 3 s of the audio (Leihu then uses its timing as-is).
function lyricFits(c, song) {
  const artist = plainTitle(song.artist);
  const cArtist = plainTitle(c.artist);
  return !!c.synced && c.diff != null && c.diff <= 3
    && plainTitle(c.track) === plainTitle(song.title)
    && !!artist && !!cArtist && (cArtist.includes(artist) || artist.includes(cArtist));
}

// Fill blank lyrics with a fitting online lyric: first from the candidates Leihu saved while
// processing, else from Leihu's lyric search by the sheet's title + artist (Leihu's own search
// used the YouTube title, which may be romanized). Returns true when lyrics were applied.
async function fillLyrics(id, song) {
  const pick = list => (list || []).filter(c => lyricFits(c, song)).sort((a, b) => a.diff - b.diff)[0];
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
  console.log(`[leihu] Filled the blank lyrics of "${song.title}" from ${cand.source} (${cand.track} / ${cand.artist})`);
  return true;
}

// Songs we imported that Leihu finished with blank lyrics (its recognition was unreliable)
// get fitting online lyrics. Lyrics Leihu did set are never replaced. Once per song per run.
async function fillMissingLyrics() {
  for (const s of library || []) {
    const song = imported.get(s.videoId);
    if (!song || songState(s) !== 'nolyrics') continue;
    const tag = `lyrics:${s.id}`;
    if (requested.has(tag)) continue;
    requested.set(tag, 'sent');
    try {
      await fillLyrics(s.id, song);
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
// Prepare button) lets a failed import be sent again.
async function prepare(entry, { retry = false } = {}) {
  const vid = videoId(sheetSong(entry.title, entry.artist)?.url);
  if (retry && requested.get(`import:${vid}`) === 'failed') requested.delete(`import:${vid}`);
  const status = statusFor(entry.title, entry.artist);
  if (status.state === 'missing') {
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

async function tick() {
  await refresh();
  await fillMissingLyrics();
  if (library && autoPrepareEnabled()) {
    const { nowPlaying, queue } = getState();
    for (const entry of [nowPlaying, ...queue]) {
      if (entry && entry.title) await prepare(entry);
    }
  }
  setTimeout(() => tick().catch(() => {}), library ? POLL_MS : OFFLINE_POLL_MS);
}

function start() {
  tick().catch(() => {});
}

// Status of every song on screen, keyed by songKey(), for the dashboard badges.
function getStatus() {
  const { nowPlaying, queue } = getState();
  const songs = {};
  for (const entry of [nowPlaying, ...queue]) {
    if (entry && entry.title) songs[songKey(entry.title, entry.artist)] = statusFor(entry.title, entry.artist);
  }
  return { online: !!library, canOpen, autoPrepare: autoPrepareEnabled(), songs };
}

function getLibrary() {
  return (library || []).map(s => ({ id: s.id, title: s.title, state: songState(s) }));
}

// Leihu song (id + state) imported from this YouTube video, or null. Null also while offline.
function findByVideo(vid) {
  const song = (library || []).find(s => s.videoId === vid);
  return song ? { id: song.id, state: songState(song) } : null;
}

// Ask Leihu's practice window to open a ready song at its sheet key (0 if the key
// can't be used). Needs Leihu's remote-open patch. Returns the key used.
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
  start, getStatus, getLibrary, findByVideo, setLink, prepare, open, refresh, importVideo, tabLanguage,
  fillMissingLyrics, failure, youtubeBlocked, baseUrl, videoId, transpose, songKey,
};
