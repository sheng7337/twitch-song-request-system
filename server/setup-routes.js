// server/setup-routes.js
// All /setup/api/* endpoints for the web-based setup wizard.

const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { ensureFreshToken, reconnect: reconnectTwitch } = require('./twitch');
const { message } = require('./messages');

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

  // A line break in a value would smuggle extra lines into .env.
  for (const [key, value] of Object.entries(values)) {
    if (/[\r\n]/.test(String(value))) throw new Error(`Invalid value for ${key}: line breaks are not allowed`);
  }

  for (const [key, value] of Object.entries(values)) {
    if (new RegExp(`^${key}=`, 'm').test(content)) {
      // Function replacer: a "$" in the value must not be read as a regex back-reference.
      content = content.replace(new RegExp(`^${key}=.*$`, 'm'), () => `${key}=${value}`);
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
      rewards: !!(env.TWITCH_REWARD_ID && env.TWITCH_RANDOM_REWARDS),
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
  const clientId = String(req.body.clientId || '').trim();
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  try {
    // Requesting a device code is the cheapest call that rejects an unknown
    // Client ID ("invalid client"); the code itself is thrown away.
    await axios.post('https://id.twitch.tv/oauth2/device', null, {
      params: { client_id: clientId, scopes: 'user:read:chat' },
    });
  } catch (err) {
    if (err.response?.status === 400) return res.status(400).json({ error: 'invalid_client' });
    return res.status(502).json(message('twitchUnreachable', { message: err.message }, `Could not reach Twitch: ${err.message}`));
  }
  writeEnvValues({ TWITCH_CLIENT_ID: clientId });
  res.json({ ok: true });
});

// POST /setup/api/start-device-auth
router.post('/start-device-auth', async (req, res) => {
  const clientId = process.env.TWITCH_CLIENT_ID || readEnv().TWITCH_CLIENT_ID;
  if (!clientId) return res.status(400).json(message('clientIdMissing', {}, 'Client ID not set'));

  try {
    const response = await axios.post('https://id.twitch.tv/oauth2/device', null, {
      params: {
        client_id: clientId,
        // moderator:read:followers: new followers for !endingtk (not in chat)
        scopes: 'channel:read:redemptions channel:manage:redemptions user:read:chat moderator:read:followers',
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
  if (!deviceAuthState) return res.status(400).json(message('noDeviceAuth', {}, 'No active device auth'));

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
    reconnectTwitch();   // a running connection picks up the new permissions

    res.json({ status: 'authorized', displayName: user.display_name, broadcasterId: user.id });
  } catch (err) {
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    if (msg === 'authorization_pending') return res.json({ status: 'pending' });
    if (msg === 'slow_down') return res.json({ status: 'pending' });
    res.json({ status: 'error', error: msg });
  }
});

// Returns the broadcaster ID and Helix headers, or null if Twitch isn't
// connected yet. Refreshes the token first: the wizard is often re-run long
// after the token was issued, and an expired one gives confusing 401s.
async function helixAuth() {
  const { TWITCH_CLIENT_ID: clientId, TWITCH_USER_ACCESS_TOKEN: token, TWITCH_BROADCASTER_ID: broadcasterId } = process.env;
  if (!clientId || !token || !broadcasterId) return null;
  await ensureFreshToken();
  return {
    broadcasterId,
    headers: {
      'Client-Id': clientId,
      'Authorization': `Bearer ${process.env.TWITCH_USER_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };
}

// GET /setup/api/rewards — fetch list of existing rewards
router.get('/rewards', async (req, res) => {
  try {
    const auth = await helixAuth();
    if (!auth) return res.status(400).json(message('twitchNotConfigured', {}, 'Twitch not configured yet — please complete Step 2 first'));
    const r = await axios.get(
      `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${auth.broadcasterId}`,
      { headers: auth.headers }
    );
    res.json({ rewards: r.data.data || [] });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

// Stores the reward picked in the rewards step as the all-tabs random reward.
// Per-tab rewards from the random-rewards step are kept, so re-running the
// rewards step doesn't wipe them.
function saveRewardForType(rewardType, id, name) {
  if (rewardType === 'song') {
    writeEnvValues({ TWITCH_REWARD_ID: id });
    return;
  }
  let rewards = [];
  try { rewards = JSON.parse(readEnv().TWITCH_RANDOM_REWARDS || '[]'); } catch (_) {}
  const perTab = rewards.filter(r => r.tabs?.length > 0 && r.id !== id);
  writeEnvValues({ TWITCH_RANDOM_REWARDS: JSON.stringify([{ id, name, tabs: [] }, ...perTab]) });
}

// POST /setup/api/create-rewards
// Body options:
//   { mode: 'pick', rewardType: 'song'|'random', rewardId, title } — assign existing reward
//   { mode: 'create', rewardType: 'song'|'random', title, cost } — create new reward
router.post('/create-rewards', async (req, res) => {
  const { mode, rewardType, rewardId, title, cost } = req.body;

  if (mode === 'pick' && rewardId && rewardType) {
    saveRewardForType(rewardType, rewardId, title || '隨機點歌券');
    return res.json({ ok: true });
  }

  if (mode === 'create' && title && rewardType) {
    const requireText = rewardType === 'song';
    try {
      const auth = await helixAuth();
      if (!auth) return res.status(400).json(message('twitchNotConfigured', {}, 'Twitch not configured yet'));
      const r = await axios.post(
        `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${auth.broadcasterId}`,
        { title, cost: parseInt(cost) || 500, is_user_input_required: requireText },
        { headers: auth.headers }
      );
      const reward = r.data.data[0];
      saveRewardForType(rewardType, reward.id, reward.title);
      return res.json({ ok: true, id: reward.id, title: reward.title });
    } catch (err) {
      return res.status(500).json({ error: err.response?.data?.message || err.message });
    }
  }

  res.status(400).json({ error: 'mode must be "pick" or "create"' });
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
    return res.status(400).json(message('credsInvalidJson', {}, 'Invalid JSON — please upload the credentials .json file from Google Cloud Console'));
  }
  const required = ['type', 'client_email', 'private_key', 'project_id'];
  for (const field of required) {
    if (!creds[field]) return res.status(400).json(message('credsMissingField', { field }, `Missing field: ${field}`));
  }
  if (creds.type !== 'service_account') {
    return res.status(400).json(message('credsNotServiceAccount', {}, 'Not a service account key file'));
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
  if (!match) return res.status(400).json(message('sheetIdNotFound', {}, 'Could not find Sheet ID in URL — please paste the full URL from your browser'));
  const sheetId = match[1];

  if (!fs.existsSync(CREDS_PATH)) {
    return res.status(400).json(message('credsNotUploaded', {}, 'Google credentials not uploaded yet'));
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDS_PATH,
      scopes: [historyMode
        ? 'https://www.googleapis.com/auth/spreadsheets'
        : 'https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    if (historyMode) {
      // The history sheet needs Editor access. Prove it with a write that
      // changes nothing (A1 written back as-is, formulas included), so a
      // Viewer-only share fails here instead of silently losing history later.
      const a1 = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId, range: 'A1', valueRenderOption: 'FORMULA',
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId, range: 'A1', valueInputOption: 'USER_ENTERED',
        requestBody: { values: a1.data.values || [['']] },
      });
      writeEnvValues({ HISTORY_SHEET_ID: sheetId });
      return res.json({ ok: true, sheetId });
    }

    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'A1:Z5', // headers + first 4 data rows
    });
    const rows = r.data.values || [];
    if (rows.length === 0) return res.status(400).json(message('sheetEmpty', {}, 'Sheet appears to be empty'));
    res.json({ ok: true, sheetId, headers: rows[0], preview: rows.slice(1, 5) });
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('403') || msg.includes('permission')) {
      return res.status(400).json(historyMode
        ? message('sheetDeniedEditor', {}, 'Access denied. Share the sheet with the service account email shown above as an Editor (not Viewer).')
        : message('sheetDenied', {}, 'Access denied. Make sure you shared the sheet with the service account email shown above.'));
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
    SHEET_KEY_COLUMN: keyColumn || 'key',
  };
  writeEnvValues(values);
  res.json({ ok: true });
});

// GET /setup/api/sheet-tabs — return distinct tab names from song cache
router.get('/sheet-tabs', (req, res) => {
  try {
    const cachePath = path.join(__dirname, '..', 'song-cache.json');
    if (!fs.existsSync(cachePath)) return res.json({ tabs: [] });
    const songs = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const tabs = [...new Set(songs.map(s => s.tab).filter(Boolean))];
    res.json({ tabs });
  } catch (_) {
    res.json({ tabs: [] });
  }
});

// POST /setup/api/save-random-rewards — create/record per-tab random rewards
// Body: { rewards: [{ name, cost, tabs[], id? }] }
// Entries with an id already exist on Twitch; entries without are created.
router.post('/save-random-rewards', async (req, res) => {
  const { rewards } = req.body;
  if (!Array.isArray(rewards)) return res.status(400).json({ error: 'rewards array required' });

  let auth = null;
  if (rewards.some(r => !r.id)) {
    try {
      auth = await helixAuth();
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!auth) return res.status(400).json(message('twitchNotConfigured', {}, 'Twitch not configured'));
  }

  const results = [];
  for (const reward of rewards) {
    if (reward.id) {
      results.push({ id: reward.id, name: reward.name, tabs: reward.tabs || [] });
    } else {
      try {
        const r = await axios.post(
          `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${auth.broadcasterId}`,
          { title: reward.name, cost: reward.cost || 300, is_user_input_required: false },
          { headers: auth.headers }
        );
        results.push({ id: r.data.data[0].id, name: r.data.data[0].title, tabs: reward.tabs || [] });
      } catch (err) {
        return res.status(500).json({ error: err.response?.data?.message || err.message });
      }
    }
  }

  // Preserve the basic all-tabs reward created in the rewards step (tabs:[])
  // unless the user already added their own all-tabs entry in this step.
  const hasAllTabs = results.some(r => !r.tabs || r.tabs.length === 0);
  if (!hasAllTabs) {
    let existing = [];
    try { existing = JSON.parse(process.env.TWITCH_RANDOM_REWARDS || '[]'); } catch (_) {}
    const allTabsEntry = existing.find(r => !r.tabs || r.tabs.length === 0);
    if (allTabsEntry) results.push(allTabsEntry);
  }

  writeEnvValues({ TWITCH_RANDOM_REWARDS: JSON.stringify(results) });
  res.json({ ok: true, rewards: results });
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
