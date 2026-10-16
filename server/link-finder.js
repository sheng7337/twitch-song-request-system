// server/link-finder.js
// Fills the sheet's YouTube link column (SHEET_URL_COLUMN): finds, for each song
// without a link, the video that matches its lyric version, lets the streamer
// review the picks on /dashboard/links.html, then writes the accepted links into
// the sheet — only into empty cells.
//
// Searching runs tools/find-videos.py with Leihu Singsing's bundled Python, so it
// uses Leihu's own lyric sites and yt-dlp; Leihu must be running so we can find its
// install folder. Everything found is kept in link-search.json (gitignored): a
// restart resumes where it stopped, and scoring is redone from the saved results.

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');   // called as childProcess.spawn so tests can replace it
const axios = require('axios');
const { google } = require('googleapis');
const config = require('./config');
const leihu = require('./leihu');
const { scoreSong } = require('./link-score');

const ROOT = path.join(__dirname, '..');
const STATE_PATH = process.env.LINK_SEARCH_STATE || path.join(ROOT, 'link-search.json');   // tests use a temp file
const CREDS_PATH = path.join(ROOT, 'google-credentials.json');
const HELPER = path.join(ROOT, 'tools', 'find-videos.py');
const CHECK_POLL_MS = 5000;
const CHECK_TIMEOUT_MS = 20 * 60 * 1000;

// songs: rowKey → { tab, row, title, artist, raw, decision, videoId, written, note, check }
//   decision: null | 'accepted' | 'skipped';  written: true once the link is in the sheet
let state = loadState();
const job = { running: false, total: 0, done: 0, current: '', error: '', skippedTabs: [] };
let child = null;

function loadState() {
  let s;
  try { s = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return { songs: {} }; }
  for (const song of Object.values(s.songs || {})) {
    if (song.check && song.check.state === 'running') song.check = { ...song.check, state: 'failed', note: 'interrupted by a server restart' };
  }
  return s;
}

function saveState() {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state));
}

function rowKey(tab, title, artist) {
  return `${tab}|${(title || '').trim()}|${(artist || '').trim()}`;
}

// ── Google Sheets ────────────────────────────────────────────────────────────

async function sheetsApi(write) {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDS_PATH,
    scopes: [write ? 'https://www.googleapis.com/auth/spreadsheets' : 'https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

function quoteTab(tab) {
  return `'${tab.replace(/'/g, "''")}'`;
}

// 0 → A, 25 → Z, 26 → AA
function columnLetter(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function findColumns(headerRow) {
  const headers = (headerRow || []).map(h => String(h).toLowerCase().trim());
  const col = name => (name ? headers.indexOf(name.toLowerCase().trim()) : -1);
  return {
    title: col(process.env.SHEET_SONG_COLUMN || 'title'),
    artist: col(process.env.SHEET_ARTIST_COLUMN || 'artist'),
    url: col(process.env.SHEET_URL_COLUMN),
  };
}

// Every tab's values, A:Z like sheets.js, excluding config.EXCLUDED_TABS.
async function readTabs(api) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const meta = await api.spreadsheets.get({ spreadsheetId: sheetId });
  const tabs = meta.data.sheets.map(s => s.properties.title).filter(t => !config.EXCLUDED_TABS.includes(t));
  const res = await api.spreadsheets.values.batchGet({ spreadsheetId: sheetId, ranges: tabs.map(t => `${quoteTab(t)}!A:Z`) });
  return tabs.map((tab, i) => ({ tab, rows: res.data.valueRanges[i].values || [] }));
}

// Sheet rows that have a title but an empty YouTube link cell.
async function rowsMissingLinks() {
  if (!process.env.SHEET_URL_COLUMN) throw new Error('No YouTube link column chosen yet — pick it in Setup → song sheet step.');
  const tabs = await readTabs(await sheetsApi(false));
  const rows = [];
  const skippedTabs = [];
  for (const { tab, rows: values } of tabs) {
    const c = findColumns(values[0]);
    if (c.title === -1 || c.url === -1) { skippedTabs.push(tab); continue; }
    values.slice(1).forEach((r, i) => {
      const title = String(r[c.title] ?? '').trim();
      if (!title || String(r[c.url] ?? '').trim()) return;
      rows.push({ tab, row: i + 2, title, artist: c.artist !== -1 ? String(r[c.artist] ?? '').trim() : '' });
    });
  }
  return { rows, skippedTabs };
}

// ── Search job ───────────────────────────────────────────────────────────────

async function leihuPython() {
  let root;
  try {
    root = (await axios.get(`${leihu.baseUrl()}/api/status`, { timeout: 3000 })).data.root;
  } catch {
    throw new Error('Leihu Singsing is not running — start it first, the search uses its lyric sites and YouTube tools.');
  }
  const python = path.join(root || '', 'python', 'python.exe');
  if (!root || !fs.existsSync(python)) throw new Error(`Leihu Singsing's Python was not found in ${root}`);
  return { root, python };
}

// limit: search only this many new songs (a trial run); the rest stay for the next start.
async function start({ limit } = {}) {
  if (job.running) return getJob();
  Object.assign(job, { running: true, total: 0, done: 0, current: '', error: '', skippedTabs: [] });
  try {
    const { root, python } = await leihuPython();
    const { rows, skippedTabs } = await rowsMissingLinks();
    job.skippedTabs = skippedTabs;
    // Songs that got a link some other way (or left the sheet) drop out of the review
    const missing = new Set(rows.map(r => rowKey(r.tab, r.title, r.artist)));
    for (const [k, s] of Object.entries(state.songs)) if (!s.written && !missing.has(k)) delete state.songs[k];
    for (const r of rows) {
      const k = rowKey(r.tab, r.title, r.artist);
      state.songs[k] = { ...(state.songs[k] || { decision: null, written: false }), ...r };
    }
    const todo = rows.filter(r => !state.songs[rowKey(r.tab, r.title, r.artist)].raw)
      .slice(0, limit > 0 ? limit : undefined);
    job.total = todo.length;
    saveState();
    if (!todo.length) { job.running = false; return getJob(); }
    runHelper(python, root, todo);
  } catch (err) {
    job.running = false;
    job.error = err.message;
  }
  return getJob();
}

function runHelper(python, root, todo) {
  child = childProcess.spawn(python, [HELPER, root], { cwd: ROOT, windowsHide: true });
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onHelperLine(line, todo);
    }
  });
  let stderr = '';
  child.stderr.on('data', d => { stderr = (stderr + d).slice(-2000); });
  child.on('close', code => {
    child = null;
    job.running = false;
    job.current = '';
    if (code && !job.error && job.done < job.total) job.error = `search stopped (exit ${code}) ${stderr.trim().split('\n').pop() || ''}`;
    console.log(`[links] Search finished: ${job.done}/${job.total} songs`);
  });
  child.on('error', err => { job.error = err.message; });
}

function onHelperLine(line, todo) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.fatal) { job.error = msg.fatal; return; }
  if (msg.ready) {
    child.stdin.write(todo.map(r => JSON.stringify({ key: rowKey(r.tab, r.title, r.artist), title: r.title, artist: r.artist })).join('\n') + '\n');
    child.stdin.end();
    job.current = todo[0] ? todo[0].title : '';
    return;
  }
  const song = msg.key && state.songs[msg.key];
  if (!song) return;
  const { key, ...raw } = msg;
  song.raw = raw;
  job.done++;
  job.current = todo[job.done] ? todo[job.done].title : '';
  saveState();
}

function stop() {
  if (child) child.kill();
  return getJob();
}

function getJob() {
  return { ...job };
}

// ── Review ───────────────────────────────────────────────────────────────────

// Everything the review page shows: one entry per searched song not yet written.
function getView() {
  const songs = Object.entries(state.songs)
    .filter(([, s]) => s.raw && !s.written)
    .map(([key, s]) => ({
      key, tab: s.tab, row: s.row, title: s.title, artist: s.artist,
      decision: s.decision, videoId: s.videoId || null, note: s.note || '', check: s.check || null,
      ...scoreSong(s.raw, { tab: s.tab }),
    }));
  const written = Object.values(state.songs).filter(s => s.written).length;
  return { job: getJob(), songs, written };
}

function decide(key, decision, videoId) {
  const s = state.songs[key];
  if (!s) throw new Error('unknown song');
  if (decision === 'accepted') {
    const vid = leihu.videoId(videoId) || (/^[A-Za-z0-9_-]{11}$/.test(videoId || '') ? videoId : null);
    if (!vid) throw new Error('not a YouTube video link');
    s.videoId = vid;
  }
  s.decision = decision || null;
  s.note = '';
  saveState();
}

function acceptConfident() {
  let n = 0;
  for (const s of Object.values(state.songs)) {
    if (!s.raw || s.written || s.decision) continue;
    const r = scoreSong(s.raw, { tab: s.tab });
    if (r.status === 'confident') { s.decision = 'accepted'; s.videoId = r.candidates[0].id; n++; }
  }
  saveState();
  return n;
}

// ── Writing to the sheet ─────────────────────────────────────────────────────

// Writes every accepted link into the sheet, only into empty link cells. Rows are
// found again by tab + title + artist, so rows inserted or moved since the search
// don't matter. Returns counts and per-song notes.
async function save() {
  const pending = Object.values(state.songs).filter(s => s.decision === 'accepted' && !s.written && s.videoId);
  if (!pending.length) return { written: 0, skipped: 0 };
  let api;
  try {
    api = await sheetsApi(true);
    // Prove Editor access with a write that changes nothing (same check as the history sheet)
    const sheetId = process.env.GOOGLE_SHEET_ID;
    const a1 = await api.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'A1', valueRenderOption: 'FORMULA' });
    await api.spreadsheets.values.update({
      spreadsheetId: sheetId, range: 'A1', valueInputOption: 'USER_ENTERED',
      requestBody: { values: a1.data.values || [['']] },
    });
  } catch (err) {
    const email = (() => { try { return JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8')).client_email; } catch { return 'the service account'; } })();
    if (err.code === 403 || /permission/i.test(err.message)) {
      throw new Error(`No permission to edit the song sheet. Share it with ${email} as Editor, then try again.`);
    }
    throw err;
  }

  const tabs = await readTabs(api);
  const data = [];
  let skipped = 0;
  for (const s of pending) {
    const t = tabs.find(x => x.tab === s.tab);
    const c = t && findColumns(t.rows[0]);
    if (!t || c.title === -1 || c.url === -1) { s.note = 'tab or link column not found'; skipped++; continue; }
    const same = r => r && String(r[c.title] ?? '').trim() === s.title
      && (c.artist === -1 || String(r[c.artist] ?? '').trim() === s.artist);
    let idx = same(t.rows[s.row - 1]) ? s.row - 1 : t.rows.findIndex((r, i) => i > 0 && same(r));
    if (idx < 1) { s.note = 'row not found in the sheet'; skipped++; continue; }
    if (String(t.rows[idx][c.url] ?? '').trim()) { s.note = 'link cell already filled — left as is'; s.written = true; skipped++; continue; }
    data.push({ s, range: `${quoteTab(s.tab)}!${columnLetter(c.url)}${idx + 1}`, url: `https://www.youtube.com/watch?v=${s.videoId}` });
  }
  if (data.length) {
    await api.spreadsheets.values.batchUpdate({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: data.map(d => ({ range: d.range, values: [[d.url]] })) },
    });
    for (const d of data) { d.s.written = true; d.s.note = ''; }
  }
  saveState();
  console.log(`[links] Wrote ${data.length} links to the sheet, skipped ${skipped}`);
  return { written: data.length, skipped };
}

// ── "Check with Leihu" ───────────────────────────────────────────────────────

// Imports the video into Leihu (or reuses it) and, once processed, compares the
// lyrics Leihu recognized with the online lyrics it found. Runs in the background;
// the result lands in song.check:
//   { state: 'running' | 'match' | 'partial' | 'nomatch' | 'inconclusive' | 'failed', similarity, note }
async function check(key, videoId) {
  const s = state.songs[key];
  if (!s) throw new Error('unknown song');
  const vid = leihu.videoId(videoId) || videoId;
  s.check = { state: 'running', videoId: vid, started: Date.now() };
  saveState();
  runCheck(s, vid).catch(err => {
    s.check = { state: 'failed', videoId: vid, note: err.response?.data?.error || err.message };
    saveState();
  });
}

async function runCheck(s, vid) {
  const base = leihu.baseUrl();
  await leihu.refresh();
  let id = leihu.findByVideo(vid)?.id;
  if (!id) id = await leihu.importVideo(vid, s.tab);
  const deadline = Date.now() + CHECK_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadline) throw new Error('Leihu took too long to process the song');
    await new Promise(r => setTimeout(r, CHECK_POLL_MS));
    await leihu.refresh();
    const st = leihu.findByVideo(vid)?.state;
    if (st === 'failed') throw new Error('Leihu could not process this video');
    if (st === 'ready' || st === 'nolyrics') break;
  }
  const [song, cands] = await Promise.all([
    axios.get(`${base}/api/songs/${id}`, { timeout: 15000 }),
    axios.get(`${base}/api/songs/${id}/lyrics/candidates`, { timeout: 60000 }),
  ]);
  const meta = song.data;
  const reliable = meta.lyrics_quality ? meta.lyrics_quality.ok !== false : !meta.lyrics_unreliable;
  const sims = (cands.data.results || []).map(c => c.similarity).filter(x => typeof x === 'number');
  const best = sims.length ? Math.max(...sims) : null;
  let result;
  if (!reliable || best == null) {
    result = { state: 'inconclusive', note: 'Leihu could not recognize the sung lyrics reliably (common for 台語) — judge by length and channel' };
  } else {
    result = { state: best >= 0.6 ? 'match' : best >= 0.3 ? 'partial' : 'nomatch', similarity: best };
  }
  s.check = { ...result, videoId: vid, leihuId: id };
  saveState();
}

module.exports = {
  start, stop, getJob, getView, decide, acceptConfident, save, check,
  // for tests
  rowKey, columnLetter, findColumns, _setState: s => { state = s; },
};
