// server/link-finder.js
// Owns the sheet's YouTube link column (header config.YT_LINK_HEADER, "YTLink"):
// finds, for each song without a link, the video that matches its lyric version,
// lets the streamer review the picks on /dashboard/links.html, then writes the
// accepted links into the sheet — only into empty cells, creating the column in
// a tab the first time links are saved there.
//
// Searching runs tools/find-videos.py with Leihu Singsing's own Python (bundled, or
// its .venv when run from source), so it
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
const { UserError } = require('./messages');

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
    if (song.check && song.check.state === 'running') song.check = { ...song.check, state: 'failed', note: 'interrupted by a server restart', noteCode: 'checkInterrupted' };
  }
  return s;
}

function saveState() {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state));
}

// A note on a song for the review page, with its message code (shared/i18n-server.js)
function setNote(s, code, params, text) {
  Object.assign(s, { note: text, noteCode: code, noteParams: params || {} });
}

// The job's error, with its message code when it has one
function setJobError(err) {
  Object.assign(job, { error: err.message, errorCode: err.messageCode || null, errorParams: err.messageParams || {} });
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
    url: col(config.YT_LINK_HEADER),
  };
}

// Every tab's values, A:Z like sheets.js, excluding config.EXCLUDED_TABS, plus
// what's needed to add a column (sheetId, columnCount).
async function readTabs(api) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const meta = await api.spreadsheets.get({ spreadsheetId });
  const tabs = meta.data.sheets.map(s => s.properties).filter(p => !config.EXCLUDED_TABS.includes(p.title));
  const res = await api.spreadsheets.values.batchGet({ spreadsheetId, ranges: tabs.map(p => `${quoteTab(p.title)}!A:Z`) });
  return tabs.map((p, i) => ({
    tab: p.title, sheetId: p.sheetId, columnCount: p.gridProperties?.columnCount ?? 26,
    rows: res.data.valueRanges[i].values || [],
  }));
}

// Sheet rows that have a title but no YouTube link yet — including every row of a
// tab that has no link column at all (it's created when links are first saved).
async function rowsMissingLinks() {
  const tabs = await readTabs(await sheetsApi(false));
  const rows = [];
  const skippedTabs = [];
  for (const { tab, rows: values } of tabs) {
    const c = findColumns(values[0]);
    if (c.title === -1) { skippedTabs.push(tab); continue; }
    values.slice(1).forEach((r, i) => {
      const title = String(r[c.title] ?? '').trim();
      if (!title || (c.url !== -1 && String(r[c.url] ?? '').trim())) return;
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
    throw new UserError('leihuNotRunning', {}, 'Leihu Singsing is not running — start it first, the search uses its lyric sites and YouTube tools.');
  }
  // LEIHU_PYTHON in .env replaces the search, and a wrong one is reported as such rather than
  // quietly falling back. Otherwise: packaged Leihu ships python\python.exe; a source install
  // runs from .venv (or venv). The helper still needs Leihu's folder for its code either way.
  const override = (process.env.LEIHU_PYTHON || '').trim();
  if (override && !fs.existsSync(override)) {
    throw new UserError('leihuPythonEnvMissing', { path: override }, `LEIHU_PYTHON in .env points to ${override}, which does not exist`);
  }
  const python = override || [
    path.join(root || '', 'python', 'python.exe'),
    path.join(root || '', '.venv', 'Scripts', 'python.exe'),
    path.join(root || '', 'venv', 'Scripts', 'python.exe'),
  ].find(p => fs.existsSync(p));
  if (!root || !python) throw new UserError('leihuPythonMissing', { root }, `Leihu Singsing's Python was not found in ${root}`);
  return { root, python };
}

// limit: search only this many new songs (a trial run); the rest stay for the next start.
async function start({ limit } = {}) {
  if (job.running) return getJob();
  Object.assign(job, { running: true, total: 0, done: 0, current: '', error: '', errorCode: null, errorParams: {}, skippedTabs: [] });
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
    setJobError(err);
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
    if (code && !job.error && job.done < job.total) {
      const detail = `exit ${code}${stderr.trim() ? ': ' + stderr.trim().split('\n').pop() : ''}`;
      setJobError(new UserError('searchStopped', { detail }, `search stopped (${detail})`));
    }
    console.log(`[links] Search finished: ${job.done}/${job.total} songs`);
  });
  child.on('error', err => setJobError(err));
}

function onHelperLine(line, todo) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.fatal) { setJobError(new Error(msg.fatal)); return; }
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
      decision: s.decision, videoId: s.videoId || null, check: s.check || null,
      note: s.note || '', noteCode: s.note ? s.noteCode || null : null, noteParams: s.noteParams || {},
      ...scoreSong(s.raw, { tab: s.tab, title: s.title }),
    }));
  const written = Object.values(state.songs).filter(s => s.written).length;
  const filled = Object.values(state.songs).filter(cellWasFilled).length;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  return {
    job: getJob(), songs, written, filled,
    access: state.access && state.access.sheetId === sheetId ? state.access : null,   // null = not checked for this sheet
    serviceEmail: serviceEmail(),
    sheetUrl: sheetId ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/edit` : null,
  };
}

function decide(key, decision, videoId) {
  const s = state.songs[key];
  if (!s) throw new UserError('unknownSong', {}, 'unknown song');
  if (decision === 'accepted') {
    const vid = leihu.videoId(videoId) || (/^[A-Za-z0-9_-]{11}$/.test(videoId || '') ? videoId : null);
    if (!vid) throw new UserError('notYouTube', {}, 'not a YouTube video link');
    s.videoId = vid;
  }
  s.decision = decision || null;
  setNote(s, null, {}, '');
  saveState();
}

function acceptConfident() {
  let n = 0;
  for (const s of Object.values(state.songs)) {
    if (!s.raw || s.written || s.decision) continue;
    const r = scoreSong(s.raw, { tab: s.tab, title: s.title });
    if (r.status === 'confident') { s.decision = 'accepted'; s.videoId = r.candidates[0].id; n++; }
  }
  saveState();
  return n;
}

// ── Writing to the sheet ─────────────────────────────────────────────────────

// The Google account the server uses — the one to share the sheet with.
function serviceEmail() {
  try { return JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8')).client_email || null; } catch { return null; }
}

function noPermissionMessage() {
  return `No permission to edit the song sheet. Share it with ${serviceEmail() || 'the service account'} as Editor, then try again.`;
}

// Proves Editor access with a write that changes nothing (A1 written back as-is, formulas
// included — same check as the history sheet). Only run on request or when saving, since
// even this write can show up in the sheet's version history. The result is kept in
// state.access for the review page. Returns { canEdit, checked, sheetId, error }.
async function checkAccess(api) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  try {
    api = api || await sheetsApi(true);
    const a1 = await api.spreadsheets.values.get({ spreadsheetId, range: 'A1', valueRenderOption: 'FORMULA' });
    await api.spreadsheets.values.update({
      spreadsheetId, range: 'A1', valueInputOption: 'USER_ENTERED',
      requestBody: { values: a1.data.values || [['']] },
    });
    state.access = { canEdit: true, checked: Date.now(), sheetId: spreadsheetId };
  } catch (err) {
    if (err.code !== 403 && !/permission/i.test(err.message)) throw err;
    state.access = { canEdit: false, checked: Date.now(), sheetId: spreadsheetId, error: noPermissionMessage(),
      errorCode: 'noEditor', errorParams: { email: serviceEmail() || 'the service account' } };
  }
  saveState();
  return state.access;
}

// Songs skipped by an earlier save because their link cell was filled. Every save tries
// them again, so clearing those cells in the sheet is enough to have them written.
const cellWasFilled = s => s.decision === 'accepted' && s.written && s.videoId && s.noteCode === 'noteCellFilled';

// Writes every accepted link into the sheet, only into empty link cells. Rows are
// found again by tab + title + artist, so rows inserted or moved since the search
// don't matter. Returns counts and per-song notes.
async function save() {
  const pending = Object.values(state.songs).filter(s => (s.decision === 'accepted' && !s.written && s.videoId) || cellWasFilled(s));
  if (!pending.length) return { written: 0, skipped: 0, createdIn: [] };
  const api = await sheetsApi(true);
  // Checked again on every save: access can be taken away after the review page's check
  if (!(await checkAccess(api)).canEdit) {
    throw new UserError('noEditor', { email: serviceEmail() || 'the service account' }, noPermissionMessage());
  }
  try {
    return await writeLinks(api, pending);
  } catch (err) {
    // Editors can still be kept out of protected tabs or ranges (Data → Protect sheets and ranges)
    if (/protected/i.test(err.message)) {
      throw new UserError('protectedRange', { email: serviceEmail() || 'the service account' }, 'Part of the sheet is protected (Data → Protect sheets and ranges). Let ' +
        `${serviceEmail() || 'the service account'} edit it, or remove the protection, then save again.`);
    }
    throw err;
  }
}

async function writeLinks(api, pending) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const tabs = await readTabs(api);

  // A tab without the link column gets one, right after its last used header.
  const grow = [];          // grid columns to add (a tab can be exactly as wide as its data)
  const headerCells = [];
  const createdIn = [];
  for (const t of tabs) {
    const c = findColumns(t.rows[0]);
    if (c.title === -1 || c.url !== -1 || !pending.some(s => s.tab === t.tab)) continue;
    const header = t.rows[0] || [];
    let col = header.length;
    while (col > 0 && !String(header[col - 1] ?? '').trim()) col--;
    if (col >= 26) { t.full = true; continue; }   // songs are read from A:Z
    if (col >= t.columnCount) grow.push({ appendDimension: { sheetId: t.sheetId, dimension: 'COLUMNS', length: col + 1 - t.columnCount } });
    headerCells.push({ range: `${quoteTab(t.tab)}!${columnLetter(col)}1`, values: [[config.YT_LINK_HEADER]] });
    t.rows[0] = Array.from({ length: col + 1 }, (_, i) => (i === col ? config.YT_LINK_HEADER : header[i] ?? ''));
    createdIn.push(t.tab);
  }
  if (grow.length) await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: grow } });

  const data = [];
  let skipped = 0;
  for (const s of pending) {
    const t = tabs.find(x => x.tab === s.tab);
    const c = t && findColumns(t.rows[0]);
    if (!t || c.title === -1) { setNote(s, 'noteNoColumn', {}, 'tab or song column not found'); skipped++; continue; }
    if (c.url === -1) {
      if (t.full) setNote(s, 'noteTabFull', { header: config.YT_LINK_HEADER }, `this tab uses all columns A–Z — add a "${config.YT_LINK_HEADER}" column header yourself`);
      else setNote(s, 'noteNoLinkColumn', {}, 'link column not found');
      skipped++;
      continue;
    }
    const same = r => r && String(r[c.title] ?? '').trim() === s.title
      && (c.artist === -1 || String(r[c.artist] ?? '').trim() === s.artist);
    let idx = same(t.rows[s.row - 1]) ? s.row - 1 : t.rows.findIndex((r, i) => i > 0 && same(r));
    if (idx < 1) { setNote(s, 'noteRowNotFound', {}, 'row not found in the sheet'); skipped++; continue; }
    if (String(t.rows[idx][c.url] ?? '').trim()) { setNote(s, 'noteCellFilled', {}, 'link cell already filled — left as is'); s.written = true; skipped++; continue; }
    data.push({ s, range: `${quoteTab(s.tab)}!${columnLetter(c.url)}${idx + 1}`, url: `https://www.youtube.com/watch?v=${s.videoId}` });
  }
  if (data.length || headerCells.length) {
    await api.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data: [...headerCells, ...data.map(d => ({ range: d.range, values: [[d.url]] }))] },
    });
    for (const d of data) { d.s.written = true; setNote(d.s, null, {}, ''); }
  }
  saveState();
  console.log(`[links] Wrote ${data.length} links to the sheet, skipped ${skipped}` +
    (createdIn.length ? `, added the ${config.YT_LINK_HEADER} column to ${createdIn.join(', ')}` : ''));
  return { written: data.length, skipped, createdIn };
}

// ── "Check with Leihu" ───────────────────────────────────────────────────────

// Imports the video into Leihu (or reuses it) and, once processed, compares the
// lyrics Leihu recognized with the online lyrics it found. Runs in the background;
// the result lands in song.check:
//   { state: 'running' | 'match' | 'partial' | 'nomatch' | 'inconclusive' | 'failed', similarity, note }
async function check(key, videoId) {
  const s = state.songs[key];
  if (!s) throw new UserError('unknownSong', {}, 'unknown song');
  const vid = leihu.videoId(videoId) || videoId;
  s.check = { state: 'running', videoId: vid, started: Date.now() };
  saveState();
  runCheck(s, vid).catch(err => {
    s.check = { state: 'failed', videoId: vid, note: err.response?.data?.error || err.message,
      noteCode: err.messageCode || null, noteParams: err.messageParams || {} };
    saveState();
  });
}

async function runCheck(s, vid) {
  const base = leihu.baseUrl();
  await leihu.refresh();
  let id = leihu.findByVideo(vid)?.id;
  if (!id) id = await leihu.importVideo(vid, s.tab, s);
  const deadline = Date.now() + CHECK_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadline) throw new UserError('checkTooLong', {}, 'Leihu took too long to process the song');
    await new Promise(r => setTimeout(r, CHECK_POLL_MS));
    await leihu.refresh();
    const st = leihu.findByVideo(vid)?.state;
    if (st === 'failed') {
      const f = leihu.failure(id);
      if (f && f.blocked) throw new UserError('youtubeBlocked', {}, `YouTube is blocking downloads from this PC: ${f.reason}`);
      if (f) throw new UserError('checkFailedReason', { reason: f.reason }, `Leihu could not process this video: ${f.reason}`);
      throw new UserError('checkFailed', {}, 'Leihu could not process this video');
    }
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
    result = { state: 'inconclusive', noteCode: 'checkInconclusive', note: 'Leihu could not recognize the sung lyrics reliably (common for 台語) — judge by length and channel' };
  } else {
    result = { state: best >= 0.6 ? 'match' : best >= 0.3 ? 'partial' : 'nomatch', similarity: best };
  }
  s.check = { ...result, videoId: vid, leihuId: id };
  saveState();
}

// ── Songs not on the sheet (Pending Review) ──────────────────────────────────

const IDENTIFY_TIMEOUT_MS = 90 * 1000;
const SOURCE_ORDER = ['LRCLIB', '酷狗音樂', '網易雲音樂'];   // display names: LRCLIB/Kugou usually keep 繁體

// Runs tools/find-videos.py for one search, apart from the search job.
// Resolves with its result: { title_n, artist_n, lyrics, videos, errors }.
async function searchOne(title, artist) {
  const { root, python } = await leihuPython();
  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn(python, [HELPER, root], { cwd: ROOT, windowsHide: true });
    const timer = setTimeout(() => proc.kill(), IDENTIFY_TIMEOUT_MS);
    let buf = '';
    let stderr = '';
    let result = null;
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', chunk => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.fatal) stderr = msg.fatal;
        else if (msg.ready) {
          proc.stdin.write(JSON.stringify({ key: 'one', title, artist }) + '\n');
          proc.stdin.end();
        } else if (msg.key === 'one') result = msg;
      }
    });
    proc.stderr.on('data', d => { stderr = (stderr + d).slice(-2000); });
    proc.on('error', err => { clearTimeout(timer); reject(err); });
    proc.on('close', code => {
      clearTimeout(timer);
      if (result) {
        const { key, ...raw } = result;
        return resolve(raw);
      }
      const detail = stderr.trim() ? stderr.trim().split('\n').pop() : `exit ${code}`;
      reject(new UserError('searchStopped', { detail }, `search stopped (${detail})`));
    });
  });
}

// Which song free text ("晴天 周董", "Lemon 米津玄師") means, from the lyric results of
// searching that text: results whose title the text contains (or that contain the whole
// text), grouped by title + artist. A group scores by how much of the text its title and
// artist cover, how many lyric results agree, and how many videos carry its title (and
// artist). Returns { title, artist, title_n, artist_n } with display names as written by
// the viewer when they match, else by the first source in SOURCE_ORDER; null when no
// lyric result fits.
function pickSong(raw, text) {
  const q = raw.title_n || '';
  if (!q) return null;
  const groups = new Map();
  for (const l of raw.lyrics || []) {
    if (!l.track_n || !(q.includes(l.track_n) || l.track_n.includes(q))) continue;
    const k = `${l.track_n}|${l.artist_n || ''}`;
    if (!groups.has(k)) groups.set(k, { track_n: l.track_n, artist_n: l.artist_n || '', items: [] });
    groups.get(k).items.push(l);
  }
  let best = null;
  for (const g of groups.values()) {
    const artistTyped = !!g.artist_n && q.includes(g.artist_n);
    const cover = q.includes(g.track_n)
      ? (g.track_n.length + (artistTyped ? g.artist_n.length : 0)) / q.length
      : 0.5 * q.length / g.track_n.length;
    const videos = (raw.videos || []).filter(v => v.title_n.includes(g.track_n));
    const byArtist = g.artist_n ? videos.filter(v => v.title_n.includes(g.artist_n) || (v.channel_n || '').includes(g.artist_n)) : [];
    const score = 10 * cover + Math.min(g.items.length, 5) + 0.5 * videos.length + byArtist.length;
    if (!best || score > best.score) best = { ...g, score };
  }
  if (!best) return null;
  const rank = l => (text.includes(l.track) ? 0 : 1) * 10 + (SOURCE_ORDER.indexOf(l.source) + 1 || SOURCE_ORDER.length + 1);
  const shown = [...best.items].sort((a, b) => rank(a) - rank(b))[0];
  const artistShown = best.items.find(l => l.artist && text.includes(l.artist)) || shown;
  return { title: shown.track, artist: artistShown.artist || '', title_n: best.track_n, artist_n: best.artist_n };
}

// The sheet tab whose rules fit free text: kana → 日語; anything else '' (automatic).
// Chinese characters alone can't tell 國語 from 台語, so they stay automatic.
function guessTab(text) {
  return /[぀-ヿ]/.test(text || '') ? '日語' : '';
}

// Identifies the song a viewer asked for and scores YouTube videos for it like the
// link finder does. Returns { title, artist, tab, status, refDuration, candidates }.
async function identify(text) {
  text = String(text || '').trim();
  let raw = await searchOne(text, '');
  const pick = pickSong(raw, text);
  // The viewer didn't type the artist: search again by title + artist, which finds the
  // official uploads a title-only search can miss (メリッサ alone finds other singers' versions)
  if (pick && pick.artist_n && !(raw.title_n || '').includes(pick.artist_n)) {
    try {
      const more = await searchOne(pick.title, pick.artist);
      const seen = new Set((raw.videos || []).map(v => v.id));
      raw = { ...raw,
        lyrics: [...(raw.lyrics || []), ...(more.lyrics || [])],
        videos: [...(raw.videos || []), ...(more.videos || []).filter(v => !seen.has(v.id))] };
    } catch (err) {
      console.error(`[pending] Second search for "${pick.title} ${pick.artist}" failed:`, err.message);
    }
  }
  const tab = guessTab(text);
  const r = scoreSong(pick ? { ...raw, title_n: pick.title_n, artist_n: pick.artist_n } : raw,
    { tab, title: pick ? pick.title : text });
  return {
    title: pick ? pick.title : text, artist: pick ? pick.artist : '', tab,
    status: pick ? r.status : 'none', refDuration: r.refDuration,
    candidates: r.candidates.map(c => ({
      id: c.id, title: c.title, channel: c.channel, duration: c.duration, views: c.views,
      tier: c.tier, diff: c.diff, official: c.official, reasons: c.reasons,
    })),
  };
}

// The tab new songs go to: the first excluded tab (待練勿點 by default), so they can't be
// requested until the streamer moves them to another tab.
function practiceTab() {
  return config.EXCLUDED_TABS[0] || null;
}

// Appends a song to practiceTab() with its YouTube link (the YTLink column is created
// when the tab has none). A song already in that tab isn't added again.
// Returns { tab, added }.
async function addToSheet({ title, artist, videoId }) {
  title = String(title || '').trim();
  artist = String(artist || '').trim();
  const tab = practiceTab();
  if (!tab) throw new UserError('noPracticeTab', {}, 'No tab to add songs to — list one in EXCLUDED_TABS in .env');
  const api = await sheetsApi(true);
  if (!(await checkAccess(api)).canEdit) {
    throw new UserError('noEditor', { email: serviceEmail() || 'the service account' }, noPermissionMessage());
  }
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const meta = await api.spreadsheets.get({ spreadsheetId });
  const p = meta.data.sheets.map(s => s.properties).find(x => x.title === tab);
  if (!p) throw new UserError('practiceTabMissing', { tab }, `The tab "${tab}" is not in the song sheet`);
  const rows = (await api.spreadsheets.values.get({ spreadsheetId, range: `${quoteTab(tab)}!A:Z` })).data.values || [];
  const header = [...(rows[0] || [])];
  const c = findColumns(header);
  const songHeader = process.env.SHEET_SONG_COLUMN || 'title';
  if (c.title === -1) throw new UserError('practiceTabNoTitle', { tab, header: songHeader }, `The tab "${tab}" has no "${songHeader}" column`);
  const same = r => String(r[c.title] ?? '').trim() === title && (c.artist === -1 || String(r[c.artist] ?? '').trim() === artist);
  if (rows.slice(1).some(same)) return { tab, added: false };

  let urlCol = c.url;
  const headerCells = [];
  if (videoId && urlCol === -1) {
    urlCol = header.length;
    while (urlCol > 0 && !String(header[urlCol - 1] ?? '').trim()) urlCol--;
    if (urlCol >= 26) throw new UserError('noteTabFull', { header: config.YT_LINK_HEADER }, `this tab uses all columns A–Z — add a "${config.YT_LINK_HEADER}" column header yourself`);
    const columnCount = p.gridProperties?.columnCount ?? 26;
    if (urlCol >= columnCount) {
      await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
        { appendDimension: { sheetId: p.sheetId, dimension: 'COLUMNS', length: urlCol + 1 - columnCount } },
      ] } });
    }
    headerCells.push({ range: `${quoteTab(tab)}!${columnLetter(urlCol)}1`, values: [[config.YT_LINK_HEADER]] });
  }
  const row = [];
  row[c.title] = title;
  if (c.artist !== -1) row[c.artist] = artist;
  if (videoId && urlCol !== -1) row[urlCol] = `https://www.youtube.com/watch?v=${videoId}`;
  const values = [Array.from(row, v => v ?? '')];
  try {
    if (headerCells.length) {
      await api.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data: headerCells } });
    }
    await api.spreadsheets.values.append({
      spreadsheetId, range: `${quoteTab(tab)}!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });
  } catch (err) {
    if (/protected/i.test(err.message)) {
      throw new UserError('protectedRange', { email: serviceEmail() || 'the service account' }, 'Part of the sheet is protected (Data → Protect sheets and ranges). Let ' +
        `${serviceEmail() || 'the service account'} edit it, or remove the protection, then save again.`);
    }
    throw err;
  }
  console.log(`[links] Added "${title}" to the ${tab} tab`);
  return { tab, added: true };
}

module.exports = {
  start, stop, getJob, getView, decide, acceptConfident, save, check, checkAccess,
  identify, addToSheet, practiceTab, guessTab,
  // for tests
  rowKey, columnLetter, findColumns, pickSong, leihuPython, _setState: s => { state = s; },
};
