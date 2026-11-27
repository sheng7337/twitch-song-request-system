// server/reward-effects.js
// 🎟 Reward effects (the 🔔 Alerts tab, overlay/reward-effects.html), instead of TriggerFyre: a channel-point
// reward plays a sound (one of several at random), a picture / GIF / video where you put it, or both.
// Rewards are matched by ID, so renaming one on Twitch doesn't break it. The files are the alerts'
// (the alert-media folder).
//
// An effect that played marks its redemption done; one that doesn't play is refunded — the new one when
// another is playing and "skip" is set, all while turned off, past the queue's limit, and the waiting
// ones on Clear. Twitch lets the app do that only for the rewards it manages (redemptions.js). A reward
// with a main use too (🎤 / 🎲 / 👕, reward-uses.js) is left to it: the effect only plays.
// Effects are added and removed in the 🎟️ Rewards tab (attach / detach), and set up in the 🔔 Alerts tab.
// Nothing plays while paused (here or by a mode, modes.js) or while no reward-effects overlay is open:
// redemptions wait. The overlay says when an effect ended; the queue is in memory only — after a restart,
// waiting redemptions stay in Twitch's queue. Settings are kept in reward-effects.json.
// The picture '@reward' is the reward's own icon on Twitch (112 × 112, Twitch's standard one when it has
// none), served by /api/reward-effects/icon/:id; a newly attached effect starts with it, at the smallest size.

const fs = require('fs');
const path = require('path');
const alerts = require('./alerts');
const { UserError } = require('./messages');

const FILE = process.env.REWARD_EFFECTS_FILE || path.join(__dirname, '..', 'reward-effects.json');   // tests use a temp file
const SOUND = /\.(mp3|wav|ogg|m4a)$/i;
const REWARD_ICON = '@reward';
const PLACES = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right', 'random'];
const TOGETHER = ['queue', 'overlap', 'skip'];
const STATES = ['on', 'paused', 'off'];
const QUEUE_MAX = 20;
const OVERLAP_MAX = 3;
const SOUNDS_MAX = 10;
const FALLBACK_SECONDS = 65;   // the overlay never said it ended: the longest effect (60 s) and some

const DEFAULTS = { state: 'on', together: 'queue', volume: 80, effects: [] };
const EFFECT = { rewardId: '', title: '', on: true, sounds: [], image: '', place: 'center', size: 25, seconds: 0, volume: 80, showName: false };
const LIMITS = { size: [10, 60], seconds: [0, 60], volume: [0, 100] };

let data = load();
let toOverlays = () => {};
let toDashboards = () => {};
let settle = (redemption, action) => require('./redemptions').settle(redemption, action);
let hasMainUse = (rewardId) => !!require('./reward-uses').useOf(rewardId);
let modePaused = false;
let overlays = 0;
let queue = [];               // [{ id, effect, redemption }] waiting
let playing = new Map();      // id → { item, timer }
let nextId = 1;

function load() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  const out = { ...DEFAULTS, ...saved };
  out.effects = Array.isArray(saved.effects) ? saved.effects.map(e => ({ ...EFFECT, ...e })) : [];
  return out;
}

function save() {
  try { fs.writeFileSync(FILE, JSON.stringify(data, null, 1)); } catch (err) { console.error('[reward-effects] Could not save reward-effects.json:', err.message); }
}

// { toOverlays, toDashboards, settle?, hasMainUse? } — redemptions.settle and reward-uses (tests pass their own)
function init(opts) {
  toOverlays = opts.toOverlays || toOverlays;
  toDashboards = opts.toDashboards || toDashboards;
  if (opts.settle) settle = opts.settle;
  if (opts.hasMainUse) hasMainUse = opts.hasMainUse;
}

// Done / refunded here only when the reward has no main use (that one decides)
function settleIfOurs(redemption, action) {
  if (hasMainUse(redemption.rewardId)) return false;
  settle(redemption, action);
  return true;
}

const paused = () => data.state === 'paused' || modePaused;

function status() {
  const files = alerts.files();
  return {
    state: data.state, together: data.together, volume: data.volume, effects: data.effects,
    modePaused, overlays, playing: playing.size,
    queue: queue.map(q => ({ id: q.id, title: q.effect.title, name: q.redemption ? q.redemption.name : '' })),
    sounds: files.filter(f => SOUND.test(f)), pictures: files.filter(f => !SOUND.test(f)), folder: alerts.MEDIA_DIR,
  };
}

function changed() {
  toDashboards({ type: 'reward-effects', status: status() });
}

const bad = (message) => new UserError('effectBadSetting', {}, message);

function checkEffect(e, files) {
  if (!e || typeof e !== 'object') throw bad('an effect must be an object');
  const out = { ...EFFECT };
  if (!/^[\w-]{1,100}$/.test(String(e.rewardId || ''))) throw bad('rewardId is missing');
  out.rewardId = String(e.rewardId);
  out.title = String(e.title || '').slice(0, 60);
  out.on = e.on === undefined ? true : !!e.on;
  out.showName = !!e.showName;
  const sounds = e.sounds === undefined ? [] : e.sounds;
  if (!Array.isArray(sounds) || sounds.length > SOUNDS_MAX) throw bad(`sounds must be a list of up to ${SOUNDS_MAX}`);
  for (const s of sounds) if (!SOUND.test(String(s)) || !files.includes(String(s))) throw bad(`${s} is not a sound in the alert-media folder`);
  out.sounds = [...new Set(sounds.map(String))];
  if (e.image === REWARD_ICON) out.image = REWARD_ICON;
  else if (e.image) {
    if (SOUND.test(String(e.image)) || !files.includes(String(e.image))) throw bad(`${e.image} is not a picture or video in the alert-media folder`);
    out.image = String(e.image);
  }
  if (e.place !== undefined) {
    if (!PLACES.includes(e.place)) throw bad(`place must be one of ${PLACES.join(', ')}`);
    out.place = e.place;
  }
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    if (e[key] === undefined) continue;
    const n = Number(e[key]);
    if (!Number.isFinite(n) || n < min || n > max) throw bad(`${key} must be from ${min} to ${max}`);
    out[key] = Math.round(n);
  }
  if (out.seconds > 0 && out.seconds < 2) out.seconds = 2;
  return out;
}

// { state?, together?, volume?, effects?: [the whole list] }
function update(updates) {
  if (updates.state !== undefined && !STATES.includes(updates.state)) throw bad(`state must be one of ${STATES.join(', ')}`);
  if (updates.together !== undefined && !TOGETHER.includes(updates.together)) throw bad(`together must be one of ${TOGETHER.join(', ')}`);
  if (updates.volume !== undefined) {
    const n = Number(updates.volume);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw bad('volume must be from 0 to 100');
  }
  let effects;
  if (updates.effects !== undefined) {
    if (!Array.isArray(updates.effects)) throw bad('effects must be a list');
    const files = alerts.files();
    effects = updates.effects.map(e => checkEffect(e, files));
    const ids = effects.map(e => e.rewardId);
    if (new Set(ids).size !== ids.length) throw bad('a reward can have only one effect');
  }
  if (updates.state !== undefined) data.state = updates.state;
  if (updates.together !== undefined) data.together = updates.together;
  if (updates.volume !== undefined) data.volume = Math.round(Number(updates.volume));
  if (effects) data.effects = effects;
  save();
  if (data.state === 'off') clear();
  advance();
  changed();
  return status();
}

// What the overlay plays: one of the sounds, the picture, where and how
function payload(item) {
  const e = item.effect;
  return {
    id: item.id,
    sound: e.sounds.length ? e.sounds[Math.floor(Math.random() * e.sounds.length)] : '',
    image: e.image === REWARD_ICON ? '' : e.image,
    icon: e.image === REWARD_ICON ? `/api/reward-effects/icon/${encodeURIComponent(e.rewardId)}` : '',
    place: e.place, size: e.size, seconds: e.seconds,
    volume: Math.round(e.volume * data.volume / 100),
    name: e.showName && item.redemption ? item.redemption.name : '',
    text: e.showName && item.redemption ? item.redemption.text : '',
    reward: e.title,
    test: !item.redemption,
  };
}

function start(item) {
  const p = payload(item);
  const timer = setTimeout(() => ended(item.id), (item.effect.seconds || FALLBACK_SECONDS) * 1000 + 5000);
  playing.set(item.id, { item, timer });
  toOverlays({ type: 'reward-effect', effect: p });
  console.log(`[reward-effects] ${p.test ? 'Test: ' : ''}${item.effect.title || item.effect.rewardId}${item.redemption ? ` for ${item.redemption.name}` : ''}`);
}

// Starts what may start now
function advance() {
  if (paused() || overlays === 0) return;
  const max = data.together === 'overlap' ? OVERLAP_MAX : 1;
  let started = false;
  while (queue.length && playing.size < max) { start(queue.shift()); started = true; }
  if (started) changed();
}

// From the overlay (or the fallback timer): this effect is over → its redemption is done
function ended(id) {
  const p = playing.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  playing.delete(id);
  if (p.item.redemption) settleIfOurs(p.item.redemption, 'done');
  advance();
  changed();
}

function refund(item, why) {
  if (!item.redemption) return;
  if (settleIfOurs(item.redemption, 'refund')) console.log(`[reward-effects] Refunded (${why}): ${item.effect.title} for ${item.redemption.name}`);
  else console.log(`[reward-effects] Not played (${why}): ${item.effect.title} for ${item.redemption.name}`);
}

// From the chat log: a redemption of a reward with an effect
function fromRecord(rec) {
  if (!rec || rec.kind !== 'redeem') return null;
  const effect = data.effects.find(e => e.rewardId === rec.rewardId);
  if (!effect || !effect.on) return null;
  const item = { id: `fx${Date.now()}-${nextId++}`, effect, redemption: { id: rec.id, rewardId: rec.rewardId, name: rec.user ? rec.user.name : '', text: rec.text || '' } };
  if (data.state === 'off') { refund(item, 'turned off'); return null; }
  const busy = playing.size > 0 || queue.length > 0;
  if (data.together === 'skip' && busy) { refund(item, 'another is playing'); return null; }
  if (queue.length >= QUEUE_MAX) { refund(item, 'the queue is full'); return null; }
  queue.push(item);
  advance();
  changed();
  return item;
}

// A test of a reward's effect, on stream only: plays now, past the queue and the pause; nothing on Twitch
function test(rewardId) {
  const effect = data.effects.find(e => e.rewardId === rewardId);
  if (!effect) throw bad('no effect for this reward');
  const item = { id: `fx${Date.now()}-${nextId++}`, effect, redemption: null };
  start(item);
  changed();
  return payload(item);
}

// ⏭ The ones playing end now (their redemptions are done: they played)
function skip() {
  for (const id of [...playing.keys()]) {
    toOverlays({ type: 'reward-effect-stop', id });
    ended(id);
  }
}

// 🗑 The waiting ones are refunded
function clear() {
  const waiting = queue;
  queue = [];
  for (const item of waiting) refund(item, 'cleared');
  changed();
}

// 🎟️ Rewards tab: this reward gets an effect (nothing to play yet: set up in the Alerts tab), or loses it
function attach(rewardId, title) {
  if (!/^[\w-]{1,100}$/.test(String(rewardId || ''))) throw bad('rewardId is missing');
  // the reward's icon to start with: 112 px, so at the smallest size (larger looks blurry)
  if (!data.effects.some(e => e.rewardId === rewardId)) data.effects.push({ ...EFFECT, rewardId: String(rewardId), title: String(title || '').slice(0, 60), image: REWARD_ICON, size: LIMITS.size[0] });
  save();
  changed();
  return status();
}

function detach(rewardId) {
  data.effects = data.effects.filter(e => e.rewardId !== rewardId);
  save();
  changed();
  return status();
}

const hasEffect = (rewardId) => data.effects.some(e => e.rewardId === rewardId);

// A taken-over reward's copy (redemptions.js) keeps the effect
function moveReward(oldId, newId) {
  let moved = false;
  for (const e of data.effects) if (e.rewardId === oldId) { e.rewardId = newId; moved = true; }
  if (moved) { save(); changed(); }
}

// A mode's ⏸ (modes.js); the waiting ones play when it's off
function setModePause(on) {
  modePaused = !!on;
  advance();
  changed();
}

// How many reward-effects overlays are open (index.js); with none, redemptions wait
function setOverlays(n) {
  overlays = Math.max(0, n);
  advance();
  changed();
}

function _reset() {
  for (const p of playing.values()) clearTimeout(p.timer);
  data = load(); queue = []; playing = new Map(); modePaused = false; overlays = 0;
}

module.exports = { init, status, update, fromRecord, test, ended, skip, clear, setModePause, setOverlays, attach, detach, hasEffect, moveReward, PLACES, REWARD_ICON, _reset };
