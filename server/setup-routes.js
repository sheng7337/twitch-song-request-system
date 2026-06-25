// server/setup-routes.js
// All /setup/api/* endpoints for the web-based setup wizard.

const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const ENV_PATH = path.join(__dirname, '..', '.env');
const PROGRESS_PATH = path.join(__dirname, '..', 'setup-progress.json');
const CREDS_PATH = path.join(__dirname, '..', 'google-credentials.json');

// ── Helpers ───────────────────────────────────────────────────────────────────

function readEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  let content = fs.readFileSync(ENV_PATH, { encoding: 'utf8' });
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  const result = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) result[m[1].trim()] = m[2].trim();
  }
  return result;
}

function writeEnvValues(values) {
  let content = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, { encoding: 'utf8' })
    : '';
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);

  for (const [key, value] of Object.entries(values)) {
    if (new RegExp(`^${key}=`, 'm').test(content)) {
      content = content.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
    } else {
      content += (content.endsWith('\n') ? '' : '\n') + `${key}=${value}\n`;
    }
    process.env[key] = value;
  }
  fs.writeFileSync(ENV_PATH, content, { encoding: 'utf8' });
  if (onConfigChange) onConfigChange();
}

function saveProgress(data) {
  const existing = fs.existsSync(PROGRESS_PATH)
    ? JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'))
    : {};
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify({ ...existing, ...data }, null, 2));
}

function loadProgress() {
  if (!fs.existsSync(PROGRESS_PATH)) return {};
  return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
}

// In-memory state for Device Auth polling
let deviceAuthState = null;

// Called after every .env write so the server can start the song queue
// services (sheets, history, Twitch connection) the moment setup finishes —
// without this, finishing the wizard mid-run leaves the dashboard open with
// no song list until the process is restarted.
let onConfigChange = null;
function setConfigChangeCallback(fn) { onConfigChange = fn; }

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /setup/api/status — current setup state
router.get('/status', (req, res) => {
  const env = readEnv();
  const progress = loadProgress();
  const hasCredentials = fs.existsSync(CREDS_PATH);
  const serviceEmail = hasCredentials
    ? JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8')).client_email
    : null;

  res.json({
    progress,
    hasCredentials,
    serviceEmail,
    configured: {
      twitch: !!(env.TWITCH_CLIENT_ID && env.TWITCH_USER_ACCESS_TOKEN && env.TWITCH_BROADCASTER_ID),
      rewards: !!(env.TWITCH_REWARD_ID && env.TWITCH_RANDOM_REWARD_ID),
      sheets: !!(env.GOOGLE_SHEET_ID && env.SHEET_SONG_COLUMN),
      history: !!env.HISTORY_SHEET_ID,
    },
    // Exposed so the wizard can tell "Twitch app already registered, just
    // need to re-authorize" apart from "never registered an app at all" —
    // the former should skip straight to the device auth step.
    clientId: env.TWITCH_CLIENT_ID || null,
    displayName: progress.displayName || null,
    broadcasterId: env.TWITCH_BROADCASTER_ID || null,
  });
});

// POST /setup/api/validate-client-id
router.post('/validate-client-id', async (req, res) => {
  const { clientId } = req.body;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  try {
    // Try a simple API call to verify the client ID is valid
    await axios.get('https://id.twitch.tv/oauth2/validate', {
      headers: { 'Client-Id': clientId }
    });
    writeEnvValues({ TWITCH_CLIENT_ID: clientId });
    res.json({ ok: true });
  } catch (err) {
    // 401 is expected (no token), but 400 means bad client ID
    if (err.response?.status === 400) {
      return res.status(400).json({ error: 'Invalid Client ID' });
    }
    // Any other response means the client ID format is accepted
    writeEnvValues({ TWITCH_CLIENT_ID: clientId });
    res.json({ ok: true });
  }
});

// POST /setup/api/start-device-auth
router.post('/start-device-auth', async (req, res) => {
  const clientId = process.env.TWITCH_CLIENT_ID || readEnv().TWITCH_CLIENT_ID;
  if (!clientId) return res.status(400).json({ error: 'Client ID not set' });

  try {
    const response = await axios.post('https://id.twitch.tv/oauth2/device', null, {
      params: {
        client_id: clientId,
        scopes: 'channel:read:redemptions channel:manage:redemptions',
      }
    });
    deviceAuthState = {
      device_code: response.data.device_code,
      interval: response.data.interval || 5,
      expires_in: response.data.expires_in,
      startedAt: Date.now(),
    };
    res.json({
      user_code: response.data.user_code,
      verification_uri: response.data.verification_uri || 'https://www.twitch.tv/activate',
      expires_in: response.data.expires_in,
      interval: response.data.interval,
    });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

// GET /setup/api/poll-device-auth
router.get('/poll-device-auth', async (req, res) => {
  if (!deviceAuthState) return res.status(400).json({ error: 'No active device auth' });

  const clientId = process.env.TWITCH_CLIENT_ID || readEnv().TWITCH_CLIENT_ID;
  const { device_code, startedAt, expires_in } = deviceAuthState;

  if (Date.now() > startedAt + expires_in * 1000) {
    deviceAuthState = null;
    return res.json({ status: 'expired' });
  }

  try {
    const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: clientId,
        device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }
    });

    const tokens = response.data;
    const expiry = String(Date.now() + tokens.expires_in * 1000);

    // Get broadcaster info
    const userRes = await axios.get('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-Id': clientId,
        'Authorization': `Bearer ${tokens.access_token}`,
      }
    });
    const user = userRes.data.data[0];

    writeEnvValues({
      TWITCH_USER_ACCESS_TOKEN: tokens.access_token,
      TWITCH_USER_REFRESH_TOKEN: tokens.refresh_token,
      TWITCH_USER_TOKEN_EXPIRES_AT: expiry,
      TWITCH_BROADCASTER_ID: user.id,
    });
    saveProgress({ displayName: user.display_name, broadcasterId: user.id });
    deviceAuthState = null;

    res.json({ status: 'authorized', displayName: user.display_name, broadcasterId: user.id });
  } catch (err) {
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    if (msg === 'authorization_pending') return res.json({ status: 'pending' });
    if (msg === 'slow_down') return res.json({ status: 'pending' });
    res.json({ status: 'error', error: msg });
  }
});

// GET /setup/api/rewards — fetch list of existing rewards
router.get('/rewards', async (req, res) => {
  const env = readEnv();
  const clientId = env.TWITCH_CLIENT_ID || process.env.TWITCH_CLIENT_ID;
  const token = env.TWITCH_USER_ACCESS_TOKEN || process.env.TWITCH_USER_ACCESS_TOKEN;
  const broadcasterId = env.TWITCH_BROADCASTER_ID || process.env.TWITCH_BROADCASTER_ID;
  if (!clientId || !token || !broadcasterId) {
    return res.status(400).json({ error: 'Twitch not configured yet — please complete Step 2 first' });
  }
  try {
    const r = await axios.get(
      `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${broadcasterId}`,
      { headers: { 'Client-Id': clientId, 'Authorization': `Bearer ${token}` } }
    );
    res.json({ rewards: r.data.data || [] });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

// POST /setup/api/create-rewards
// Body options:
//   { mode: 'pick', rewardType: 'song'|'random', rewardId } — assign existing reward
//   { mode: 'create', rewardType: 'song'|'random', title, cost } — create new reward
router.post('/create-rewards', async (req, res) => {
  const { mode, rewardType, rewardId, title, cost, songRequestCost = 500, randomSongCost = 300 } = req.body;
  const env = readEnv();
  const clientId = env.TWITCH_CLIENT_ID;
  const token = env.TWITCH_USER_ACCESS_TOKEN;
  const broadcasterId = env.TWITCH_BROADCASTER_ID;

  if (!clientId || !token || !broadcasterId) {
    return res.status(400).json({ error: 'Twitch not configured yet' });
  }

  const headers = {
    'Client-Id': clientId,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Single reward pick or create
  if (mode === 'pick' && rewardId && rewardType) {
    const envKey = rewardType === 'song' ? 'TWITCH_REWARD_ID' : 'TWITCH_RANDOM_REWARD_ID';
    writeEnvValues({ [envKey]: rewardId });
    return res.json({ ok: true });
  }

  if (mode === 'create' && title && rewardType) {
    const envKey = rewardType === 'song' ? 'TWITCH_REWARD_ID' : 'TWITCH_RANDOM_REWARD_ID';
    const requireText = rewardType === 'song';
    try {
      const r = await axios.post(
        `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${broadcasterId}`,
        { title, cost: parseInt(cost) || 500, is_user_input_required: requireText },
        { headers }
      );
      const newId = r.data.data[0].id;
      writeEnvValues({ [envKey]: newId });
      return res.json({ ok: true, id: newId, title: r.data.data[0].title });
    } catch (err) {
      return res.status(500).json({ error: err.response?.data?.message || err.message });
    }
  }

  // Check existing rewards
  let existing = [];
  try {
    const r = await axios.get(
      `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${broadcasterId}`,
      { headers }
    );
    existing = r.data.data || [];
  } catch (_) {}

  const results = {};

  // Song Request reward
  const existingSong = existing.find(r => r.title.includes('點歌') || r.title.includes('Song Request'));
  if (existingSong) {
    writeEnvValues({ TWITCH_REWARD_ID: existingSong.id });
    results.songRequest = { id: existingSong.id, title: existingSong.title, existing: true };
  } else {
    try {
      const r = await axios.post(
        `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${broadcasterId}`,
        { title: '點歌券', cost: songRequestCost, is_user_input_required: true, prompt: '輸入想點的歌名' },
        { headers }
      );
      const reward = r.data.data[0];
      writeEnvValues({ TWITCH_REWARD_ID: reward.id });
      results.songRequest = { id: reward.id, title: reward.title, existing: false };
    } catch (err) {
      results.songRequest = { error: err.response?.data?.message || err.message };
    }
  }

  // Random Song reward
  const existingRandom = existing.find(r => r.title.includes('隨機') || r.title.includes('Random'));
  if (existingRandom) {
    writeEnvValues({ TWITCH_RANDOM_REWARD_ID: existingRandom.id });
    results.randomSong = { id: existingRandom.id, title: existingRandom.title, existing: true };
  } else {
    try {
      const r = await axios.post(
        `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${broadcasterId}`,
        { title: '隨機點歌券', cost: randomSongCost, is_user_input_required: false },
        { headers }
      );
      const reward = r.data.data[0];
      writeEnvValues({ TWITCH_RANDOM_REWARD_ID: reward.id });
      results.randomSong = { id: reward.id, title: reward.title, existing: false };
    } catch (err) {
      results.randomSong = { error: err.response?.data?.message || err.message };
    }
  }

  res.json({ ok: true, results });
});

// GET /setup/api/upload-credentials — show helpful error if accessed directly
router.get('/upload-credentials', (req, res) => {
  res.status(405).json({ error: 'Use POST with the JSON file content in the request body' });
});

// POST /setup/api/upload-credentials — accept google-credentials.json upload
router.post('/upload-credentials', (req, res) => {
  let creds;
  try {
    creds = typeof req.body === 'object' && req.body !== null && Object.keys(req.body).length > 0
      ? req.body
      : JSON.parse(req.rawBody || '{}');
  } catch (e) {
    console.error('[setup] upload-credentials parse error:', e.message, 'rawBody length:', req.rawBody?.length);
    return res.status(400).json({ error: 'Invalid JSON — please upload the credentials .json file from Google Cloud Console' });
  }
  const required = ['type', 'client_email', 'private_key', 'project_id'];
  for (const field of required) {
    if (!creds[field]) return res.status(400).json({ error: `Missing field: ${field}` });
  }
  if (creds.type !== 'service_account') {
    return res.status(400).json({ error: 'Not a service account key file' });
  }
  fs.writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 2), { encoding: 'utf8' });
  res.json({ ok: true, clientEmail: creds.client_email });
});

// POST /setup/api/validate-sheet — test sheet access and return headers + preview
router.post('/validate-sheet', async (req, res) => {
  const { sheetUrl, historyMode } = req.body;
  if (!sheetUrl) return res.status(400).json({ error: 'sheetUrl required' });

  // Extract sheet ID from URL
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return res.status(400).json({ error: 'Could not find Sheet ID in URL — please paste the full URL from your browser' });
  const sheetId = match[1];

  if (!fs.existsSync(CREDS_PATH)) {
    return res.status(400).json({ error: 'Google credentials not uploaded yet' });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'A1:Z5', // headers + first 4 data rows
    });

    const rows = r.data.values || [];

    if (historyMode) {
      // For history sheet — just confirm access. A brand-new sheet is
      // expected to be empty (the server writes headers on first run).
      writeEnvValues({ HISTORY_SHEET_ID: sheetId });
      res.json({ ok: true, sheetId });
    } else {
      // For song list — return headers and preview for column selection
      if (rows.length === 0) return res.status(400).json({ error: 'Sheet appears to be empty' });
      res.json({
        ok: true,
        sheetId,
        headers: rows[0],
        preview: rows.slice(1, 5),
      });
    }
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('403') || msg.includes('permission')) {
      return res.status(400).json({
        error: 'Access denied. Make sure you shared the sheet with the service account email shown above.',
      });
    }
    res.status(400).json({ error: err.message });
  }
});

// POST /setup/api/save-columns — save chosen column names
router.post('/save-columns', (req, res) => {
  const { sheetId, songColumn, artistColumn, keyColumn } = req.body;
  const values = {
    GOOGLE_SHEET_ID: sheetId,
    SHEET_SONG_COLUMN: songColumn,
    SHEET_ARTIST_COLUMN: artistColumn,
  };
  writeEnvValues(values);
  res.json({ ok: true });
});

// POST /setup/api/save-history — save history sheet ID
router.post('/save-history', (req, res) => {
  const { sheetId } = req.body;
  if (sheetId) writeEnvValues({ HISTORY_SHEET_ID: sheetId });
  res.json({ ok: true });
});

module.exports = router;
module.exports.setConfigChangeCallback = setConfigChangeCallback;
module.exports.writeEnvValues = writeEnvValues;
