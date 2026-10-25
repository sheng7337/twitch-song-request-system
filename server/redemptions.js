// server/redemptions.js
// Channel-point redemptions marked done or refunded from the dashboard: the Chat tab's ✓ / ↩, and
// songs in the queue (sung → done, removed → refunded; queue.js setRedemptionHook).
//
// Twitch lets an app change only the redemptions of rewards that app created. A reward made on
// Twitch can be taken over: the app makes a hidden copy with the same settings (all but the icon,
// which apps can't upload), the streamer deletes the original on Twitch, and the copy takes the
// original's name, on / paused state and place in .env. Takeovers are kept in reward-takeovers.json:
//   { [originalId]: { copyId, title, enabled, paused, startedAt, done?, doneAt? } }
// Finished ones stay, so !endingtk still counts the original's redemptions earlier that stream.

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const chatLog = require('./chat-log');
const { ensureFreshToken } = require('./twitch');
const { UserError } = require('./messages');

const API = 'https://api.twitch.tv/helix/channel_points/custom_rewards';
const TAKEOVERS_PATH = process.env.REWARD_TAKEOVERS_FILE || path.join(__dirname, '..', 'reward-takeovers.json');   // tests use a temp file
const MANAGEABLE_MAX_AGE_MS = 10 * 60 * 1000;
const TITLE_MAX = 45;   // Twitch's limit
const ACTIONS = { done: 'FULFILLED', refund: 'CANCELED' };

let manageable = { ids: new Set(), at: 0 };
let channel = '';   // the broadcaster's login, for links to Twitch's pages

async function helix() {
  await ensureFreshToken();
  return {
    headers: {
      'Client-Id': process.env.TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${process.env.TWITCH_USER_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  };
}

const broadcaster = () => process.env.TWITCH_BROADCASTER_ID;

function loadTakeovers() {
  try { return JSON.parse(fs.readFileSync(TAKEOVERS_PATH, 'utf8')) || {}; } catch { return {}; }
}

function saveTakeovers(all) {
  fs.writeFileSync(TAKEOVERS_PATH, JSON.stringify(all, null, 2));
}

// IDs of the rewards this app created (so can change their redemptions), checked again every 10 minutes
async function manageableIds(force = false) {
  if (!force && Date.now() - manageable.at < MANAGEABLE_MAX_AGE_MS) return manageable.ids;
  try {
    const { data } = await axios.get(API, { ...await helix(), params: { broadcaster_id: broadcaster(), only_manageable_rewards: true } });
    manageable = { ids: new Set(data.data.map(r => r.id)), at: Date.now() };
  } catch (err) {
    console.error('[redemptions] Could not check which rewards the app manages:', err.response?.data?.message || err.message);
  }
  return manageable.ids;
}

async function channelLogin() {
  if (channel) return channel;
  try {
    const { data } = await axios.get('https://api.twitch.tv/helix/users', { ...await helix(), params: { id: broadcaster() } });
    channel = data.data?.[0]?.login || '';
  } catch {}
  return channel;
}

// Done (FULFILLED) or refunded (CANCELED). Twitch takes it only while the redemption is waiting.
async function setStatus(rewardId, id, action) {
  const status = ACTIONS[action] || action;
  if (!Object.values(ACTIONS).includes(status)) throw new Error(`unknown action ${action}`);
  if (!(await manageableIds()).has(rewardId)) {
    throw new UserError('redemptionNotManageable', {}, 'Twitch lets the app change only the redemptions of rewards the app made');
  }
  let data;
  try {
    ({ data } = await axios.patch(`${API}/redemptions`, { status },
      { ...await helix(), params: { broadcaster_id: broadcaster(), reward_id: rewardId, id } }));
  } catch (err) {
    // Twitch finds only waiting redemptions: this one was done or refunded already (on Twitch, or another dashboard)
    if (err.response?.status === 404) throw new UserError('redemptionHandled', {}, 'This redemption was already done or refunded');
    throw err;
  }
  const r = data.data?.[0];
  const now = (r?.status || status).toLowerCase();
  chatLog.setRedeemStatus(id, now, r?.redeemed_at);
  return { ok: true, status: now };
}

// For songs from the queue: a reward made on Twitch stays in Twitch's own queue, as before; one
// handled already (on Twitch) is left as it is
function settle({ id, rewardId }, action) {
  setStatus(rewardId, id, action)
    .then(() => console.log(`[redemptions] ${action === 'done' ? 'Done' : 'Refunded'}: redemption ${id}`))
    .catch(err => {
      if (err.messageCode === 'redemptionNotManageable' || err.messageCode === 'redemptionHandled') return;
      console.warn(`[redemptions] Could not mark redemption ${id} ${action}:`, err.response?.data?.message || err.message);
    });
}

// ── Taking over a reward made on Twitch ─────────────────────────────────────

// Name of the hidden copy until the original is deleted (Twitch wants every reward name different)
function tempTitle(title) {
  return `${[...title].slice(0, TITLE_MAX - 6).join('')} (new)`;
}

// The new reward's settings from the original's (Get Custom Reward → Create Custom Rewards)
function copyOf(r) {
  const body = {
    title: tempTitle(r.title),
    cost: r.cost,
    prompt: r.prompt || '',
    is_enabled: false,
    is_user_input_required: !!r.is_user_input_required,
    should_redemptions_skip_request_queue: !!r.should_redemptions_skip_request_queue,
  };
  if (r.background_color) body.background_color = r.background_color;
  const perStream = r.max_per_stream_setting;
  const perUser = r.max_per_user_per_stream_setting;
  const cooldown = r.global_cooldown_setting;
  if (perStream?.is_enabled) Object.assign(body, { is_max_per_stream_enabled: true, max_per_stream: perStream.max_per_stream });
  if (perUser?.is_enabled) Object.assign(body, { is_max_per_user_per_stream_enabled: true, max_per_user_per_stream: perUser.max_per_user_per_stream });
  if (cooldown?.is_enabled) Object.assign(body, { is_global_cooldown_enabled: true, global_cooldown_seconds: cooldown.global_cooldown_seconds });
  return body;
}

function roleOf(id) {
  if (id && id === process.env.TWITCH_REWARD_ID) return 'song';
  try { if (JSON.parse(process.env.TWITCH_RANDOM_REWARDS || '[]').some(r => r.id === id)) return 'random'; } catch {}
  return '';
}

// Undefined when Twitch has no such reward (deleted)
async function getReward(id) {
  try {
    const { data } = await axios.get(API, { ...await helix(), params: { broadcaster_id: broadcaster(), id } });
    return data.data?.[0];
  } catch (err) {
    if (err.response?.status === 404) return undefined;
    throw err;
  }
}

// Every reward for the dashboard's list; hidden copies of takeovers in progress are part of their original's row.
// A takeover whose original is gone (deleted while the app was closed) finishes here.
async function listRewards() {
  const opts = await helix();
  const [all, mine] = await Promise.all([
    axios.get(API, { ...opts, params: { broadcaster_id: broadcaster() } }),
    axios.get(API, { ...opts, params: { broadcaster_id: broadcaster(), only_manageable_rewards: true } }),
  ]);
  manageable = { ids: new Set(mine.data.data.map(r => r.id)), at: Date.now() };
  const rewards = all.data.data;
  let takeovers = loadTakeovers();
  let finished = false;
  for (const [id, t] of Object.entries(takeovers)) {
    if (t.done || rewards.some(r => r.id === id)) continue;
    try { await finishTakeover(id); finished = true; } catch (err) {
      console.warn('[redemptions] Could not finish taking over a reward:', err.message);
    }
  }
  if (finished) return listRewards();
  takeovers = loadTakeovers();
  const copies = new Set(Object.values(takeovers).filter(t => !t.done).map(t => t.copyId));
  return {
    channel: await channelLogin(),
    rewards: rewards.filter(r => !copies.has(r.id)).map(r => ({
      id: r.id, title: r.title, cost: r.cost, enabled: r.is_enabled, role: roleOf(r.id),
      manageable: manageable.ids.has(r.id),
      skipsQueue: !!r.should_redemptions_skip_request_queue,
      takeover: takeovers[r.id] && !takeovers[r.id].done ? { startedAt: takeovers[r.id].startedAt } : null,
    })).sort((a, b) => (b.role ? 1 : 0) - (a.role ? 1 : 0)),
  };
}

// Step 1: the hidden copy
async function startTakeover(id) {
  const takeovers = loadTakeovers();
  if (takeovers[id] && !takeovers[id].done) return { ok: true };
  if ((await manageableIds(true)).has(id)) return { ok: true };
  const reward = await getReward(id);
  if (!reward) throw new UserError('rewardGone', {}, 'That reward is no longer on Twitch');
  const { data } = await axios.post(API, copyOf(reward), { ...await helix(), params: { broadcaster_id: broadcaster() } });
  takeovers[id] = { copyId: data.data[0].id, title: reward.title, enabled: reward.is_enabled, paused: reward.is_paused, startedAt: Date.now() };
  saveTakeovers(takeovers);
  manageable.at = 0;
  console.log(`[redemptions] Hidden copy of "${reward.title}" made; waiting for the original to be deleted on Twitch`);
  return { ok: true };
}

// Step 2, once the original is deleted on Twitch: the copy takes its name and state, and the
// song request system uses the copy
async function finishTakeover(id) {
  const takeovers = loadTakeovers();
  const t = takeovers[id];
  if (!t || t.done) return { ok: true };
  if (await getReward(id)) throw new UserError('rewardStillThere', { title: t.title }, `"${t.title}" is still on Twitch — delete it there first`);
  try {
    await axios.patch(API, { title: t.title, is_enabled: t.enabled !== false, is_paused: !!t.paused },
      { ...await helix(), params: { broadcaster_id: broadcaster(), id: t.copyId } });
  } catch (err) {
    if (err.response?.status === 404) {
      delete takeovers[id];
      saveTakeovers(takeovers);
      throw new UserError('rewardCopyGone', { title: t.title }, `The copy of "${t.title}" was deleted on Twitch too`);
    }
    throw err;
  }
  const { writeEnvValues } = require('./setup-routes');   // here, so tests of this module don't load setup
  if (process.env.TWITCH_REWARD_ID === id) writeEnvValues({ TWITCH_REWARD_ID: t.copyId });
  let random = [];
  try { random = JSON.parse(process.env.TWITCH_RANDOM_REWARDS || '[]'); } catch {}
  if (random.some(r => r.id === id)) writeEnvValues({ TWITCH_RANDOM_REWARDS: JSON.stringify(random.map(r => r.id === id ? { ...r, id: t.copyId } : r)) });
  takeovers[id] = { ...t, done: true, doneAt: Date.now() };
  saveTakeovers(takeovers);
  manageable.at = 0;
  console.log(`[redemptions] "${t.title}" is now the app's own reward`);
  return { ok: true };
}

// Changed one's mind before deleting the original: the hidden copy goes
async function cancelTakeover(id) {
  const takeovers = loadTakeovers();
  const t = takeovers[id];
  if (!t || t.done) return { ok: true };
  try {
    await axios.delete(API, { ...await helix(), params: { broadcaster_id: broadcaster(), id: t.copyId } });
  } catch (err) {
    if (err.response?.status !== 404) throw err;
  }
  delete takeovers[id];
  saveTakeovers(takeovers);
  manageable.at = 0;
  return { ok: true };
}

// channel.channel_points_custom_reward.remove: the original of a takeover was deleted on Twitch
function onRewardRemoved(e) {
  const t = loadTakeovers()[e.id];
  if (t && !t.done) finishTakeover(e.id).catch(err => console.warn('[redemptions] Could not finish taking over a reward:', err.message));
}

// Originals of taken-over rewards whose copy is one of `ids` (for !endingtk, earlier in the stream)
function originalsOf(ids) {
  return Object.entries(loadTakeovers()).filter(([, t]) => t.done && ids.has(t.copyId)).map(([id]) => id);
}

module.exports = {
  manageableIds, channelLogin, setStatus, settle, listRewards,
  startTakeover, finishTakeover, cancelTakeover, onRewardRemoved, originalsOf, copyOf, tempTitle,
};
