// server/bot.js
// 🤖 Chat bot, instead of Nightbot: the streamer's own commands (!歌單 → a reply) and timers (a message
// every N minutes once chat has moved on). Replies post as the streamer's account (chat-send.js), and
// only while the app runs. A reply's variables: $(user) $(touser) $(query) $(count) $(channel) $(uptime)
// $(followage) $(sheet) $(commands) $(pick a|b|c) $(random 1-100). Nothing runs code or fetches a URL.
// The bot's own messages come back through chat like any other; isOwn() tells them apart, so a reply
// that starts with "!" (say, $(query) from a viewer) never runs a command as the streamer.
// Settings and each command's count are kept in bot.json.

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { UserError } = require('./messages');
const strings = require('../shared/i18n-viewer');

const FILE = process.env.BOT_FILE || path.join(__dirname, '..', 'bot.json');   // tests use a temp file
const LEVELS = ['everyone', 'sub', 'vip', 'mod'];
const LIMITS = { cooldown: [0, 3600], userCooldown: [0, 3600], minutes: [1, 240], minLines: [0, 200] };
const MAX_COMMANDS = 100;
const MAX_TIMERS = 20;
const MAX_ALIASES = 10;
const MAX_TEXT = 500;              // Twitch's limit for a chat message
const TICK_MS = 15 * 1000;         // timers are looked at this often
const TIMER_GAP_MS = 2 * 60 * 1000;   // at least this long between two timers' messages (staggered)
const BURST = { n: 10, ms: 30 * 1000 };   // at most this many replies in this long, whatever the cooldowns
const OWN_MS = 30 * 1000;          // how long a sent text is waited for in chat

const DEFAULTS = () => ({
  nextId: 3,
  commands: [
    command({ id: 'c1', name: '!歌單', aliases: ['!songs', '!songlist'], response: '🎵 $(sheet)' }),
    command({ id: 'c2', name: '!commands', response: '$(commands)', cooldown: 30 }),
  ],
  timers: [],
});

function command(c = {}) {
  return { id: '', name: '', aliases: [], response: '', level: 'everyone', cooldown: 5, userCooldown: 0, on: true, count: 0, ...c };
}
function timer(t = {}) {
  return { id: '', name: '', message: '', minutes: 20, minLines: 2, liveOnly: true, on: true, ...t };
}

let data = load();
let deps = { send: async () => ({}), session: () => ({ live: false, startedAt: null }), language: () => 'en', reserved: () => [], token: async () => {} };
let saveTimer = null;
let tickTimer = null;
const runtime = { channel: '', lastAt: {}, lastBy: {}, timerAt: {}, lines: {}, burst: [], wasLive: false, lastTimerPost: 0, lastError: null };
const own = { ids: new Set(), texts: [] };

function load() {
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  if (!saved) return DEFAULTS();
  return {
    nextId: Number(saved.nextId) || 1,
    commands: (saved.commands || []).map(command),
    timers: (saved.timers || []).map(timer),
  };
}

function save(now) {
  clearTimeout(saveTimer);
  const write = () => {
    saveTimer = null;
    try { fs.writeFileSync(FILE, JSON.stringify(data, null, 1)); } catch (err) { console.error('[bot] Could not save bot.json:', err.message); }
  };
  if (now) write(); else saveTimer = setTimeout(write, 2000);   // counts: a busy chat isn't a write per message
}

// send(text) → { id }; session() → { live, startedAt }; language() → 'en' | 'zh-TW';
// reserved() → the app's own commands' prefixes (!so, !tk …); token() → a fresh Twitch token
function init(d) {
  deps = { ...deps, ...d };
  clearInterval(tickTimer);
  const now = Date.now();
  for (const t of data.timers) runtime.timerAt[t.id] = now;   // the first message comes a whole interval after starting
  tickTimer = setInterval(() => tick().catch(err => console.error('[bot] Timer:', err.message)), TICK_MS);
  tickTimer.unref?.();
}

// ── Names ──
// "歌單" / "!歌單 " → "!歌單"; spaces, a second "!" and over 30 characters are refused
function cleanName(raw) {
  let name = String(raw || '').trim().toLowerCase();
  if (!name) return '';
  if (!name.startsWith('!')) name = '!' + name;
  if (!/^![^\s!]{1,30}$/u.test(name)) throw new UserError('botBadName', { name }, `"${name}" can't be a command: one word, up to 30 characters.`);
  return name;
}

// Taken by the app's own commands: chat-router matches by prefix, so "!tk" also takes "!tkx"; "!so " needs a space
function reservedBy(name) {
  for (const p of deps.reserved()) {
    const bare = p.trim();
    if (name === bare || (p === bare && name.startsWith(bare))) return bare;
  }
  return null;
}

function namesOf(c) {
  return [c.name, ...c.aliases].filter(Boolean);
}

function checkNames(c) {
  for (const name of namesOf(c)) {
    const taken = reservedBy(name);
    if (taken) throw new UserError('botNameReserved', { name, command: taken }, `${name} is the app's own command (${taken}).`);
    const other = data.commands.find(o => o.id !== c.id && namesOf(o).includes(name));
    if (other) throw new UserError('botNameTaken', { name }, `${name} is already a command.`);
  }
  if (new Set(namesOf(c)).size !== namesOf(c).length) throw new UserError('botNameTaken', { name: c.name }, `${c.name} is listed twice.`);
}

const clamp = (v, [lo, hi], fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const text = (v) => {
  const s = String(v ?? '').replace(/\r?\n/g, ' ').trim();
  if ([...s].length > MAX_TEXT) throw new UserError('botTooLong', { max: MAX_TEXT }, `At most ${MAX_TEXT} characters.`);
  return s;
};

// The fields a change may set, checked
function applyCommand(c, body) {
  const next = { ...c };
  if (body.name !== undefined) next.name = cleanName(body.name);
  if (body.aliases !== undefined) {
    const list = Array.isArray(body.aliases) ? body.aliases : String(body.aliases).split(/[\s,，、]+/);
    next.aliases = [...new Set(list.map(cleanName).filter(Boolean))].filter(a => a !== next.name).slice(0, MAX_ALIASES);
  }
  if (body.response !== undefined) next.response = text(body.response);
  if (body.level !== undefined) next.level = LEVELS.includes(body.level) ? body.level : next.level;
  if (body.cooldown !== undefined) next.cooldown = clamp(body.cooldown, LIMITS.cooldown, next.cooldown);
  if (body.userCooldown !== undefined) next.userCooldown = clamp(body.userCooldown, LIMITS.userCooldown, next.userCooldown);
  if (body.on !== undefined) next.on = !!body.on;
  if (body.count !== undefined) next.count = clamp(body.count, [0, 1e9], next.count);
  if (!next.name) throw new UserError('botNameMissing', {}, 'A command needs a name.');
  checkNames(next);
  return next;
}

function applyTimer(t, body) {
  const next = { ...t };
  if (body.name !== undefined) next.name = String(body.name).trim().slice(0, 40);
  if (body.message !== undefined) next.message = text(body.message);
  if (body.minutes !== undefined) next.minutes = clamp(body.minutes, LIMITS.minutes, next.minutes);
  if (body.minLines !== undefined) next.minLines = clamp(body.minLines, LIMITS.minLines, next.minLines);
  if (body.liveOnly !== undefined) next.liveOnly = !!body.liveOnly;
  if (body.on !== undefined) next.on = !!body.on;
  return next;
}

function addCommand(body = {}) {
  if (data.commands.length >= MAX_COMMANDS) throw new UserError('botTooMany', { max: MAX_COMMANDS }, `At most ${MAX_COMMANDS}.`);
  const c = applyCommand(command({ id: 'c' + data.nextId }), body);
  data.nextId++;
  data.commands.push(c);
  save(true);
  return c;
}

function updateCommand(id, body = {}) {
  const i = data.commands.findIndex(c => c.id === id);
  if (i < 0) throw new UserError('botNotFound', {}, 'That command is gone — reload the page.');
  data.commands[i] = applyCommand(data.commands[i], body);
  save(true);
  return data.commands[i];
}

function addTimer(body = {}) {
  if (data.timers.length >= MAX_TIMERS) throw new UserError('botTooMany', { max: MAX_TIMERS }, `At most ${MAX_TIMERS}.`);
  const t = applyTimer(timer({ id: 't' + data.nextId }), body);
  data.nextId++;
  data.timers.push(t);
  runtime.timerAt[t.id] = Date.now();
  save(true);
  return t;
}

function updateTimer(id, body = {}) {
  const i = data.timers.findIndex(t => t.id === id);
  if (i < 0) throw new UserError('botNotFound', {}, 'That timer is gone — reload the page.');
  const was = data.timers[i];
  data.timers[i] = applyTimer(was, body);
  if (data.timers[i].on && !was.on) runtime.timerAt[id] = Date.now();   // switched on: a whole interval first
  save(true);
  return data.timers[i];
}

function remove(id) {
  const before = data.commands.length + data.timers.length;
  data.commands = data.commands.filter(c => c.id !== id);
  data.timers = data.timers.filter(t => t.id !== id);
  if (data.commands.length + data.timers.length === before) throw new UserError('botNotFound', {}, 'Already gone — reload the page.');
  save(true);
}

// ── Variables ──
function say(key, params = {}) {
  const table = strings[deps.language()]?.bot || strings.en.bot;
  const s = table[key] ?? strings.en.bot[key];
  if (typeof s === 'function') return s(params);
  return String(s).replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
}

function uptime(now = Date.now()) {
  const s = deps.session();
  if (!s.live || !s.startedAt) return say('offline');
  const min = Math.max(0, Math.floor((now - s.startedAt) / 60000));
  const h = Math.floor(min / 60);
  return h ? say('hoursMinutes', { h, m: min % 60 }) : say('minutes', { m: min });
}

// How long since `since` (ms), as years + months, months + days, or days
function age(since, now = Date.now()) {
  const a = new Date(since);
  const b = new Date(now);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  if (b.getDate() < a.getDate()) months--;
  const anchor = new Date(a); anchor.setMonth(a.getMonth() + months);
  const days = Math.max(0, Math.floor((b - anchor) / 86400000));
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y) return m ? say('yearsMonths', { y, m }) : say('years', { y });
  if (months) return days ? say('monthsDays', { m: months, d: days }) : say('months', { m: months });
  return days ? say('days', { d: days }) : say('today');
}

const helix = async (url, params) => {
  await deps.token();
  const { data: body } = await axios.get('https://api.twitch.tv/helix/' + url, {
    headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${process.env.TWITCH_USER_ACCESS_TOKEN}` },
    params, timeout: 10000,
  });
  return body.data || [];
};

// How long `who` ({ id } or { login }) has followed; needs moderator:read:followers
async function followage(who) {
  try {
    let id = who.id;
    if (!id) id = (await helix('users', { login: who.login }))[0]?.id;
    if (!id) return say('notFollowing', { user: who.name || who.login });
    const f = (await helix('channels/followers', { broadcaster_id: process.env.TWITCH_BROADCASTER_ID, user_id: id }))[0];
    return f ? age(Date.parse(f.followed_at)) : say('notFollowing', { user: who.name || who.login });
  } catch (err) {
    console.error('[bot] Could not look up a follow:', err.response?.data?.message || err.message);
    return say('unknown');
  }
}

function sheetUrl() {
  const id = process.env.GOOGLE_SHEET_ID;
  return id ? `https://docs.google.com/spreadsheets/d/${id}` : '';
}

const levelOf = (badges = []) => {
  const sets = badges.map(b => b.set_id);
  if (sets.includes('broadcaster') || sets.includes('moderator')) return 3;
  if (sets.includes('vip')) return 2;
  if (sets.includes('subscriber') || sets.includes('founder')) return 1;
  return 0;
};

// The commands everyone may use, for $(commands)
function publicNames() {
  return data.commands.filter(c => c.on && c.level === 'everyone').map(c => c.name).join(' ');
}

// Fills the variables in once: a viewer's $(query) that has "$(…)" in it stays as typed
async function expand(template, ctx = {}) {
  const user = ctx.user || { name: '', login: '' };
  const query = String(ctx.query || '').trim();
  const target = query.split(/\s+/)[0]?.replace(/^@/, '') || '';
  const jobs = [];
  const out = String(template || '').replace(/\$\((\w+)(?:\s+([^)]*))?\)/g, (whole, name, arg = '') => {
    switch (name.toLowerCase()) {
      case 'user': return user.name || user.login;
      case 'touser': return target || user.name || user.login;
      case 'query': return query;
      case 'count': return String(ctx.count ?? 0);
      case 'channel': return ctx.channel || '';
      case 'uptime': return uptime();
      case 'sheet': return sheetUrl();
      case 'commands': return publicNames();
      case 'pick': {
        const options = arg.split('|').map(s => s.trim()).filter(Boolean);
        return options.length ? options[Math.floor(Math.random() * options.length)] : '';
      }
      case 'random': {
        const m = arg.match(/^\s*(-?\d+)\s*-\s*(-?\d+)\s*$/);
        const [lo, hi] = m ? [Number(m[1]), Number(m[2])].sort((a, b) => a - b) : [1, 100];
        return String(lo + Math.floor(Math.random() * (hi - lo + 1)));
      }
      case 'followage': {
        const key = `\u0000${jobs.length}\u0000`;
        jobs.push(followage(target ? { login: target.toLowerCase(), name: target } : user).then(v => [key, v]));
        return key;
      }
      default: return whole;
    }
  });
  let filled = out;
  for (const [key, v] of await Promise.all(jobs)) filled = filled.split(key).join(v);
  filled = filled.replace(/\s+/g, ' ').trim();
  return [...filled].slice(0, MAX_TEXT).join('');
}

// ── Chat ──
// Twitch (and 7TV) add invisible characters to repeat a message; they aren't part of the command
const clean = s => String(s || '').replace(/[\u{E0000}-\u{E007F}͏​-‍⁠﻿]/gu, '').trim();

async function post(message) {
  own.texts.push({ text: message, at: Date.now() });
  try {
    const { id } = await deps.send(message);
    if (id) own.ids.add(id);
    runtime.lastError = null;
    return true;
  } catch (err) {
    runtime.lastError = { at: Date.now(), message: err.message, code: err.messageCode || null };
    console.error('[bot] Could not post in chat:', err.message);
    return false;
  }
}

// One of the bot's own messages, coming back through chat (by its ID, or its text while the ID isn't back yet)
function isOwn(event) {
  if (event.chatter_user_id !== process.env.TWITCH_BROADCASTER_ID) return false;
  if (own.ids.delete(event.message_id)) return true;
  const now = Date.now();
  own.texts = own.texts.filter(o => now - o.at < OWN_MS);
  const said = clean(event.message?.text);
  const i = own.texts.findIndex(o => o.text === said);
  if (i < 0) return false;
  own.texts.splice(i, 1);
  return true;
}

// A chat message (not the bot's own): counts for the timers, and may be a command → the reply, or null
async function onChat(event) {
  for (const t of data.timers) runtime.lines[t.id] = (runtime.lines[t.id] || 0) + 1;
  if (event.broadcaster_user_name) runtime.channel = event.broadcaster_user_name;   // for $(channel) in timers
  const words = clean(event.message?.text);
  if (!words.startsWith('!')) return null;
  const first = words.split(/\s+/)[0].toLowerCase();
  const c = data.commands.find(x => x.on && namesOf(x).includes(first));
  if (!c) return null;
  if (levelOf(event.badges) < LEVELS.indexOf(c.level)) return null;
  const now = Date.now();
  const userId = event.chatter_user_id || event.chatter_user_login;
  if (now - (runtime.lastAt[c.id] || 0) < c.cooldown * 1000) return null;
  const byUser = runtime.lastBy[c.id] || (runtime.lastBy[c.id] = {});
  if (now - (byUser[userId] || 0) < c.userCooldown * 1000) return null;
  runtime.burst = runtime.burst.filter(at => now - at < BURST.ms);
  if (runtime.burst.length >= BURST.n) return null;
  runtime.lastAt[c.id] = now;
  byUser[userId] = now;
  runtime.burst.push(now);
  c.count++;
  save();
  const reply = await expand(c.response, {
    user: { id: event.chatter_user_id, login: event.chatter_user_login, name: event.chatter_user_name },
    query: words.slice(first.length), count: c.count, channel: event.broadcaster_user_name,
  });
  if (!reply) return null;
  await post(reply);
  return reply;
}

// Timers: due when its minutes have passed and chat has had its lines since; live only unless set
// otherwise. One at a time, TIMER_GAP_MS apart, the longest-waiting first. Going live starts them over.
async function tick(now = Date.now()) {
  const { live } = deps.session();
  if (live && !runtime.wasLive) for (const t of data.timers) { runtime.timerAt[t.id] = now; runtime.lines[t.id] = 0; }
  runtime.wasLive = live;
  if (now - runtime.lastTimerPost < TIMER_GAP_MS) return null;
  const due = data.timers
    .filter(t => t.on && t.message && (live || !t.liveOnly))
    .filter(t => now - (runtime.timerAt[t.id] ?? now) >= t.minutes * 60000 && (runtime.lines[t.id] || 0) >= t.minLines)
    .sort((a, b) => (runtime.timerAt[a.id] ?? now) - (runtime.timerAt[b.id] ?? now));
  if (!due.length) return null;
  return postTimer(due[0], now);
}

async function postTimer(t, now = Date.now()) {
  runtime.timerAt[t.id] = now;
  runtime.lines[t.id] = 0;
  runtime.lastTimerPost = now;
  const message = await expand(t.message, { channel: runtime.channel });
  if (message) await post(message);
  return message;
}

// "▶ Post now" in the dashboard (it starts the timer's interval over)
async function postNow(id) {
  const t = data.timers.find(x => x.id === id);
  if (!t) throw new UserError('botNotFound', {}, 'That timer is gone — reload the page.');
  if (!t.message) throw new UserError('chatEmpty', {}, 'Type a message first.');
  const message = await postTimer(t);
  if (runtime.lastError && Date.now() - runtime.lastError.at < 1000) throw new UserError('botPostFailed', { message: runtime.lastError.message }, runtime.lastError.message);
  return message;
}

// What a command's reply or a timer's message would say, for the dashboard's "Try": as if the streamer
// typed it (with `query` after it). Posts nothing; $(count) is the next one.
async function preview({ text: template = '', id = '', query = '' } = {}) {
  const c = data.commands.find(x => x.id === id);
  const name = runtime.channel || 'viewer';
  return expand(template, {
    user: { name, login: name.toLowerCase(), id: process.env.TWITCH_BROADCASTER_ID },
    query, count: (c?.count || 0) + 1, channel: runtime.channel,
  });
}

function status() {
  const now = Date.now();
  const { live } = deps.session();
  return {
    commands: data.commands,
    timers: data.timers.map(t => ({
      ...t,
      lines: runtime.lines[t.id] || 0,
      // when it would be due by time alone (chat lines and live-only can hold it longer)
      dueAt: (runtime.timerAt[t.id] ?? now) + t.minutes * 60000,
    })),
    live,
    sheet: !!process.env.GOOGLE_SHEET_ID,
    reserved: deps.reserved().map(p => p.trim()),
    lastError: runtime.lastError,
    limits: LIMITS,
  };
}

// Tests: back to the defaults, nothing on disk
function _reset(d = DEFAULTS()) {
  data = d;
  for (const k of ['lastAt', 'lastBy', 'timerAt', 'lines']) runtime[k] = {};
  Object.assign(runtime, { burst: [], wasLive: false, lastTimerPost: 0, lastError: null });
  own.ids.clear();
  own.texts = [];
}

module.exports = {
  init, onChat, isOwn, tick, postNow, preview, expand, status, age, cleanName,
  addCommand, updateCommand, addTimer, updateTimer, remove, _reset, TIMER_GAP_MS,
};
