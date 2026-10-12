// server/sheets.js
// Reads your song list from ALL tabs in Google Sheets (except excluded ones)
// and caches it locally.

const { google } = require('googleapis');
const config = require('./config');
const path = require('path');
const fs = require('fs');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'google-credentials.json');
const CACHE_PATH = path.join(__dirname, '..', 'song-cache.json');

// Tabs to skip — add more names here if needed

let songCache = [];

async function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      'google-credentials.json not found.\n' +
      'See SETUP.md → Step 2 to create a Google Service Account and download credentials.'
    );
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return auth.getClient();
}

async function fetchSongs() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const songCol = process.env.SHEET_SONG_COLUMN || 'title';
  const artistCol = process.env.SHEET_ARTIST_COLUMN || 'artist';
  const keyCol = process.env.SHEET_KEY_COLUMN || 'key';

  if (!sheetId) {
    console.warn('[sheets] GOOGLE_SHEET_ID not set — using empty song list');
    return [];
  }

  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // Step 1: get all sheet/tab names
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const tabs = meta.data.sheets
      .map(s => s.properties.title)
      .filter(name => !config.EXCLUDED_TABS.includes(name));

    // Step 2: fetch all tabs in one batchGet call
    const batchRes = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges: tabs.map(tab => `${tab}!A:Z`),
    });

    const allSongs = [];
    const rejectedKeys = [];

    for (const valueRange of batchRes.data.valueRanges) {
      const rows = valueRange.values;
      if (!rows || rows.length < 2) continue;

      const headers = rows[0].map(h => h.toLowerCase().trim());
      const titleIdx = headers.indexOf(songCol.toLowerCase());
      const artistIdx = headers.indexOf(artistCol.toLowerCase());
      const keyIdx = headers.indexOf(keyCol.toLowerCase().trim());

      if (titleIdx === -1) {
        console.warn(
          `[sheets] Tab "${valueRange.range}" has no "${songCol}" column — skipping. ` +
          `Found headers: ${headers.join(', ')}`
        );
        continue;
      }

      // Google Sheets wraps tab names containing spaces/CJK in single quotes
      // in the range string (e.g. "'台語'!A:Z"). Strip them so the stored
      // tab name matches what the Sheets API returns via spreadsheets.get().
      const tabName = valueRange.range.split('!')[0].replace(/^'(.*)'$/, '$1');
      const songs = rows.slice(1)
        .filter(row => row[titleIdx]?.trim())
        .map(row => {
          const rawKey = keyIdx !== -1 ? String(row[keyIdx] ?? '').trim() : '';
          const key = /^-?\d+(\.\d+)?$/.test(rawKey) ? rawKey : '';
          if (rawKey && !key) rejectedKeys.push(rawKey);
          return {
            title: row[titleIdx].trim(),
            artist: artistIdx !== -1 ? (row[artistIdx] || '').trim() : '',
            key,
            tab: tabName,
          };
        });

      allSongs.push(...songs);
    }

    // Deduplicate by title+artist (case-insensitive) — songs with the same
    // title but different artists are different songs and must both be kept
    const seen = new Set();
    const deduped = allSongs.filter(s => {
      const key = `${s.title.toLowerCase()}|${s.artist.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const withKey = deduped.filter(s => s.key).length;
    console.log(`[sheets] Loaded ${deduped.length} songs from ${tabs.join(', ')} (${withKey} with key)`);
    if (rejectedKeys.length) {
      const examples = [...new Set(rejectedKeys)].slice(0, 3).map(k => `"${k}"`).join(', ');
      console.log(`[sheets] Ignored ${rejectedKeys.length} non-numeric key value(s), e.g. ${examples}`);
    }

    // Force write fresh cache (delete old one first to avoid stale reads)
    if (fs.existsSync(CACHE_PATH)) fs.unlinkSync(CACHE_PATH);
    fs.writeFileSync(CACHE_PATH, JSON.stringify(deduped, null, 2));
    songCache = deduped;
    return deduped;

  } catch (err) {
    console.error('[sheets] Error fetching songs:', err.message);
    if (fs.existsSync(CACHE_PATH)) {
      console.log('[sheets] Using cached song list from disk');
      songCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    }
    return songCache;
  }
}

function getSongs() {
  return songCache;
}

async function startAutoRefresh() {
  await fetchSongs();
  setInterval(fetchSongs, config.SHEET_REFRESH_INTERVAL_MS);
}

module.exports = { fetchSongs, getSongs, startAutoRefresh };

