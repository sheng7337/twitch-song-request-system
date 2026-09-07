// server/twitch.js
// EventSub WebSocket transport — connects directly to Twitch, no ngrok needed.
// Uses user access token (from Device Auth flow in setup wizard).

const axios = require('axios');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const TWITCH_API = 'https://api.twitch.tv/helix';
const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';
const ENV_PATH = path.join(__dirname, '..', '.env');

let ws = null;
let sessionId = null;
let redemptionHandler = null; // set by index.js via setEventHandler
let chatHandler = null;       // set by index.js via setChatHandler

// Deduplicate EventSub notifications — Twitch guarantees at-least-once delivery
// so the same message_id can arrive more than once after reconnects.
const seenMessageIds = new Set();
const SEEN_MAX = 500; // cap memory; old IDs beyond this are evicted FIFO
const seenQueue = [];
function isDuplicate(id) {
  if (seenMessageIds.has(id)) return true;
  seenMessageIds.add(id);
  seenQueue.push(id);
  if (seenQueue.length > SEEN_MAX) seenMessageIds.delete(seenQueue.shift());
  return false;
}

// ── Token management ──────────────────────────────────────────────────────────

function setEnvValue(key, value) {
  let content = fs.readFileSync(ENV_PATH, { encoding: 'utf8' });
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1); // strip BOM
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }
  fs.writeFileSync(ENV_PATH, content, { encoding: 'utf8' });
  process.env[key] = value;
}

async function ensureFreshToken() {
  const expiresAt = parseInt(process.env.TWITCH_USER_TOKEN_EXPIRES_AT || '0');
  if (Date.now() < expiresAt - 60000) return; // still valid with 1min buffer

  const refreshToken = process.env.TWITCH_USER_REFRESH_TOKEN;
  if (!refreshToken) throw new Error('No refresh token — please re-run setup');

  console.log('[twitch] Refreshing access token...');
  try {
    const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.TWITCH_CLIENT_ID,
      }
    });

    const newExpiry = String(Date.now() + res.data.expires_in * 1000);
    setEnvValue('TWITCH_USER_ACCESS_TOKEN', res.data.access_token);
    setEnvValue('TWITCH_USER_TOKEN_EXPIRES_AT', newExpiry);
    if (res.data.refresh_token) {
      setEnvValue('TWITCH_USER_REFRESH_TOKEN', res.data.refresh_token);
    }
    console.log('[twitch] Token refreshed');
  } catch (err) {
    if (err.response?.status === 400) {
      // Refresh token was rejected (rotated/revoked, or expired from
      // inactivity). Log the actual reason Twitch gave so a recurring
      // failure can be diagnosed instead of just disappearing into a
      // generic "expired" message.
      console.error('[twitch] Refresh token rejected:', JSON.stringify(err.response.data));
      // Clear the stale tokens so isSetupComplete() goes false and the user
      // is routed back to /setup to reauthorize. TWITCH_CLIENT_ID and
      // TWITCH_BROADCASTER_ID are left intact so the wizard can skip
      // straight to the device-auth step instead of starting over.
      setEnvValue('TWITCH_USER_ACCESS_TOKEN', '');
      setEnvValue('TWITCH_USER_REFRESH_TOKEN', '');
      setEnvValue('TWITCH_USER_TOKEN_EXPIRES_AT', '');
      throw new Error('Twitch authorization expired — please re-run setup to reconnect');
    }
    throw err;
  }
}

// ── EventSub WebSocket ────────────────────────────────────────────────────────

async function subscribeToEvents(sid) {
  await ensureFreshToken();
  const broadcasterId = process.env.TWITCH_BROADCASTER_ID;
  const clientId = process.env.TWITCH_CLIENT_ID;
  const token = process.env.TWITCH_USER_ACCESS_TOKEN;

  const headers = {
    'Client-Id': clientId,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  await axios.post(`${TWITCH_API}/eventsub/subscriptions`, {
    type: 'channel.channel_points_custom_reward_redemption.add',
    version: '1',
    condition: { broadcaster_user_id: broadcasterId },
    transport: { method: 'websocket', session_id: sid },
  }, { headers });
  console.log('[twitch] Subscribed to Channel Points redemptions');

  await axios.post(`${TWITCH_API}/eventsub/subscriptions`, {
    type: 'channel.chat.message',
    version: '1',
    // Both IDs must be set; user_id is the account that owns the token (broadcaster self-sub)
    condition: { broadcaster_user_id: broadcasterId, user_id: broadcasterId },
    transport: { method: 'websocket', session_id: sid },
  }, { headers });
  console.log('[twitch] Subscribed to chat messages');
}

function connectEventSub(url) {
  const wsUrl = url || EVENTSUB_WS_URL;
  console.log('[twitch] Connecting to EventSub WebSocket...');
  ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('[twitch] EventSub WebSocket connected');
  });

  ws.on('message', async (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch (_) { return; }

    const type = msg.metadata?.message_type;

    if (type === 'session_welcome') {
      sessionId = msg.payload.session.id;
      console.log(`[twitch] Session ID: ${sessionId}`);
      try {
        await subscribeToEvents(sessionId);
      } catch (err) {
        console.error('[twitch] Failed to subscribe:', err.response?.data || err.message);
        if (err.response?.status === 401) {
          // Token is invalid even though the stored expiry says it's still live
          // (e.g. revoked by the user on Twitch). Force the expiry to zero so
          // the next reconnect calls ensureFreshToken() properly instead of
          // short-circuiting. If the refresh token is also bad, ensureFreshToken
          // will clear all tokens and isSetupComplete() will route back to /setup.
          console.warn('[twitch] Token rejected — forcing re-check on next reconnect');
          setEnvValue('TWITCH_USER_TOKEN_EXPIRES_AT', '0');
          ws.removeAllListeners('close');
          ws.close();
          setTimeout(() => connectEventSub(), 5000);
        }
      }
    }

    if (type === 'notification') {
      const msgId = msg.metadata?.message_id;
      if (msgId && isDuplicate(msgId)) {
        console.warn(`[twitch] Duplicate message dropped: ${msgId}`);
        return;
      }
      const subType = msg.metadata?.subscription_type;
      if (subType === 'channel.channel_points_custom_reward_redemption.add') {
        if (redemptionHandler) redemptionHandler(msg.payload.event);
      } else if (subType === 'channel.chat.message') {
        if (chatHandler) chatHandler(msg.payload.event);
      }
    }

    if (type === 'session_reconnect') {
      console.log('[twitch] Reconnecting to new URL...');
      const reconnectUrl = msg.payload.session.reconnect_url;
      // Remove the close listener before closing so the auto-reconnect logic
      // doesn't fire a second connectEventSub() alongside the intended one.
      ws.removeAllListeners('close');
      ws.close();
      connectEventSub(reconnectUrl);
    }

    // session_keepalive — no action needed
  });

  ws.on('close', (code, reason) => {
    console.log(`[twitch] WebSocket closed (${code}), reconnecting in 5s...`);
    setTimeout(() => connectEventSub(), 5000);
  });

  ws.on('error', (err) => {
    console.error('[twitch] WebSocket error:', err.message);
  });
}

function setEventHandler(fn) {
  redemptionHandler = fn;
}

function setChatHandler(fn) {
  chatHandler = fn;
}

async function connect() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const token = process.env.TWITCH_USER_ACCESS_TOKEN;
  const broadcasterId = process.env.TWITCH_BROADCASTER_ID;

  if (!clientId || !token || !broadcasterId) {
    console.warn('[twitch] Missing credentials — run setup at http://localhost:3000/setup');
    return;
  }

  // Socket already exists (open, connecting, or closed-but-reconnecting via
  // the close handler). Don't open a second connection — let existing
  // machinery handle it. Only proceed when ws is null, which happens when
  // the server started with an expired token and never got to connectEventSub().
  if (ws !== null) return;

  try {
    await ensureFreshToken();
  } catch (err) {
    console.warn('[twitch] Token refresh failed:', err.message);
    console.warn('[twitch] Re-run setup at http://localhost:3000/setup');
    return;
  }

  connectEventSub();
}

module.exports = { connect, setEventHandler, setChatHandler, ensureFreshToken, setEnvValue };
