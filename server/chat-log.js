// server/chat-log.js
// Chat log for the dashboard's Chat tab: every chat message and channel-point redemption,
// kept in memory (the latest RECENT_MAX, live in the tab) and appended to one file per day
// in chat-logs/ (YYYY-MM-DD.jsonl, local date), kept CHAT_LOG_DAYS days, so earlier streams
// can be searched. Filtering happens in the dashboard.
//
// Each line is one record:
//   { kind: 'chat', id, at, user, text, parts, type, bits?, reply?, songs? }
//   { kind: 'redeem', id, at, user, text, reward, rewardId, status? }
//       — status: 'unfulfilled' (waiting in Twitch's queue) | 'fulfilled' (done) | 'canceled' (refunded)
//   { kind: 'notice', id, at, user, notice, system, text, anonymous?, recipient?, viewers?, avatar? }
//       — Twitch's sub / resub / gift / raid … lines (notice = notice_type, system = Twitch's own wording);
//         recipient: who got a gifted sub; a raid's user is the raiding channel
//   { kind: 'follow', id, at, user }
//   { kind: 'delete', at, ids? | user? | all? }   — a mod deleted messages; applied on load
//   { kind: 'redeem-status', at, id, status }      — a redemption done or refunded later; in the
//       redemption's day file (at = the redemption's), applied on load
// user = { id, login, name, color, badges: ['moderator', 'subscriber', ...] }
// parts = the message split into text / emote / mention / cheer, for drawing emotes.
// songs = sheet songs the message names, for the "songs mentioned" filter:
//   [{ title, artist, lastAt?, recent?, onStream? }] — lastAt: when the song was last sung (ms, from
//   the request history; null = never; left out while the history sheet isn't loaded). recent /
//   onStream: set by song-notes.js (within the cooldown / a note was shown on the stream overlay).

const fs = require('fs');
const path = require('path');
const { getSongs } = require('./sheets');
const history = require('./history');

const LOG_DIR = process.env.CHAT_LOG_DIR || path.join(__dirname, '..', 'chat-logs');   // tests use a temp folder
const RECENT_MAX = 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

let recent = [];
let channel = null;        // the broadcaster's login, for Twitch's own chat window
let send = () => {};       // pushes a record to dashboards with the Chat tab open
let writing = Promise.resolve();

function keepDays() {
  const n = Number(process.env.CHAT_LOG_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

// Local date, so one evening's stream stays in one file
function dayOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Songs named in a message ────────────────────────────────────────────────

// Letters and digits only, lowercase ("Love Story (Taylor's Version)" → "lovestorytaylorsversion")
function plain(s) {
  return (s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

// Sheet songs whose title appears in the message: at least 2 characters, and 4 for titles
// in Latin letters only (short English words turn up in any sentence). A title inside a
// longer matched title ("Love" in "Love Story") is left out. At most 3.
function songsIn(text) {
  const hay = plain(text);
  if (!hay) return [];
  const hits = [];
  for (const s of getSongs()) {
    const t = plain(s.title);
    if (t.length < 2 || (/^[a-z0-9]+$/.test(t) && t.length < 4) || !hay.includes(t)) continue;
    hits.push({ t, title: s.title, artist: s.artist || '' });
  }
  hits.sort((a, b) => b.t.length - a.t.length);
  const out = [];
  for (const h of hits) {
    if (out.some(o => o.t.includes(h.t))) continue;
    out.push(h);
    if (out.length === 3) break;
  }
  return out.map(({ title, artist }) => ({ title, artist }));
}

// When the song was last sung (history.js keeps "YYYY-MM-DD HH:MM:SS" in UTC), as ms; null = never
function lastSungAt(title) {
  const s = history.getLastRequestedAt(title);
  const ms = s ? Date.parse(s.replace(' ', 'T') + 'Z') : NaN;
  return Number.isFinite(ms) ? ms : null;
}

// ── Records from Twitch events ──────────────────────────────────────────────

// Chat events name the viewer chatter_user_*, redemptions user_*
function userOf(e, prefix) {
  const p = prefix ? `${prefix}_user_` : 'user_';
  return { id: e[`${p}id`] || '', login: e[`${p}login`] || '', name: e[`${p}name`] || e[`${p}login`] || '' };
}

// channel.chat.message (EventSub v1)
function fromChat(e, at = Date.now()) {
  const parts = (e.message?.fragments || []).map(f => {
    if (f.type === 'emote' && f.emote) return { t: 'emote', text: f.text, id: f.emote.id };
    if (f.type === 'mention' && f.mention) return { t: 'mention', text: f.text, login: f.mention.user_login };
    if (f.type === 'cheermote' && f.cheermote) return { t: 'cheer', text: f.text, bits: f.cheermote.bits };
    return { t: 'text', text: f.text };
  });
  const text = e.message?.text || '';
  const rec = {
    kind: 'chat', id: e.message_id, at,
    user: { ...userOf(e, 'chatter'), color: e.color || '', badges: (e.badges || []).map(b => b.set_id) },
    text, parts, type: e.message_type || 'text',
  };
  if (e.cheer?.bits) rec.bits = e.cheer.bits;
  if (e.reply) rec.reply = { name: e.reply.parent_user_name || e.reply.parent_user_login, text: e.reply.parent_message_body || '' };
  const songs = text.startsWith('!') ? [] : songsIn(text);
  if (songs.length) rec.songs = history.isReady() ? songs.map(s => ({ ...s, lastAt: lastSungAt(s.title) })) : songs;
  return rec;
}

// channel.channel_points_custom_reward_redemption.add
function fromRedemption(e, at = Date.now()) {
  const rec = {
    kind: 'redeem', id: e.id || `r${at}`, at,
    user: { ...userOf(e, ''), color: '', badges: [] },
    text: (e.user_input || '').trim(), reward: e.reward?.title || '', rewardId: e.reward?.id || '',
  };
  if (e.status && e.status !== 'unknown') rec.status = e.status;
  return rec;
}

// channel.chat.notification
function fromNotice(e, at = Date.now()) {
  const rec = {
    kind: 'notice', id: e.message_id || `n${at}`, at,
    user: { ...userOf(e, 'chatter'), color: e.color || '', badges: (e.badges || []).map(b => b.set_id) },
    notice: e.notice_type || '', system: e.system_message || '', text: e.message?.text || '',
  };
  if (e.chatter_is_anonymous) rec.anonymous = true;
  const gift = e.sub_gift;
  if (gift?.recipient_user_id) {
    rec.recipient = { id: gift.recipient_user_id, login: gift.recipient_user_login || '', name: gift.recipient_user_name || gift.recipient_user_login || '' };
  }
  if (e.raid) {
    rec.user = { ...rec.user, id: e.raid.user_id || rec.user.id, login: e.raid.user_login || rec.user.login, name: e.raid.user_name || rec.user.name };
    rec.viewers = e.raid.viewer_count || 0;
    if (e.raid.profile_image_url) rec.avatar = e.raid.profile_image_url;
  }
  return rec;
}

// channel.follow (v2)
function fromFollow(e, at = Date.now()) {
  return { kind: 'follow', id: `f${e.user_id}-${at}`, at, user: { ...userOf(e, ''), color: '', badges: [] } };
}

// ── Log ─────────────────────────────────────────────────────────────────────

function append(rec) {
  const file = path.join(LOG_DIR, `${dayOf(rec.at)}.jsonl`);
  const line = JSON.stringify(rec) + '\n';
  writing = writing
    .then(() => fs.promises.mkdir(LOG_DIR, { recursive: true }))
    .then(() => fs.promises.appendFile(file, line, 'utf8'))
    .catch(err => console.error('[chat-log] Could not write the chat log:', err.message));
  return writing;
}

function add(rec) {
  recent.push(rec);
  if (recent.length > RECENT_MAX) recent = recent.slice(-RECENT_MAX);
  append(rec);
  send({ type: 'chat', record: rec });
  return rec;
}

// `prepare(record)` runs before the record is kept and sent (song-notes.js marks its songs)
function addChat(event, prepare) {
  if (event.broadcaster_user_login) channel = event.broadcaster_user_login;
  const rec = fromChat(event);
  if (prepare) prepare(rec);
  return add(rec);
}

function addRedemption(event) {
  if (event.broadcaster_user_login) channel = event.broadcaster_user_login;
  return add(fromRedemption(event));
}

// Shared-chat notices (shared_chat_sub …) are about the other channels in the shared chat
function addNotice(event) {
  if (event.broadcaster_user_login) channel = event.broadcaster_user_login;
  if ((event.notice_type || '').startsWith('shared_chat_')) return null;
  return add(fromNotice(event));
}

function addFollow(event) {
  if (event.broadcaster_user_login) channel = event.broadcaster_user_login;
  return add(fromFollow(event));
}

// Marks records deleted: { ids } (one message), { user } (a timeout / ban clears a viewer's
// messages, by user ID) or { all } (chat cleared).
function applyDelete(records, del) {
  for (const r of records) {
    if (r.kind !== 'chat') continue;
    if (del.all || (del.ids && del.ids.includes(r.id)) || (del.user && r.user.id === del.user)) r.deleted = true;
  }
}

function remove(del) {
  const rec = { kind: 'delete', at: Date.now(), ...del };
  applyDelete(recent, rec);
  append(rec);
  send({ type: 'chat-delete', ...del });
}

// channel.chat.message_delete / clear_user_messages / clear
function onModeration(type, e) {
  if (type === 'channel.chat.message_delete') remove({ ids: [e.message_id] });
  else if (type === 'channel.chat.clear_user_messages') remove({ user: e.target_user_id });
  else if (type === 'channel.chat.clear') remove({ all: true });
}

// A redemption done or refunded (channel.channel_points_custom_reward_redemption.update, or the
// app's own ✓ / ↩, redemptions.js). redeemedAt (Twitch's time) finds the day file when the
// redemption is no longer in memory.
function setRedeemStatus(id, status, redeemedAt) {
  const rec = recent.find(r => r.kind === 'redeem' && r.id === id);
  if (rec && rec.status === status) return;
  if (rec) rec.status = status;
  append({ kind: 'redeem-status', at: rec ? rec.at : (Date.parse(redeemedAt) || Date.now()), id, status });
  send({ type: 'chat-redeem', id, status });
}

function applyStatus(records, st) {
  const rec = records.find(r => r.kind === 'redeem' && r.id === st.id);
  if (rec) rec.status = st.status;
}

// A day's records with deletions and redemption statuses applied, oldest first
async function load(day) {
  if (!DAY_RE.test(day || '')) return [];
  let text;
  try { text = await fs.promises.readFile(path.join(LOG_DIR, `${day}.jsonl`), 'utf8'); } catch { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }   // a line cut off by a crash
    if (rec.kind === 'delete') applyDelete(out, rec);
    else if (rec.kind === 'redeem-status') applyStatus(out, rec);
    else out.push(rec);
  }
  return out;
}

// Days with a log, newest first
async function days() {
  let names;
  try { names = await fs.promises.readdir(LOG_DIR); } catch { return []; }
  return names.map(n => n.replace(/\.jsonl$/, '')).filter(d => DAY_RE.test(d)).sort().reverse();
}

// Deletes logs older than CHAT_LOG_DAYS
async function prune(now = Date.now()) {
  const oldest = dayOf(now - (keepDays() - 1) * 86400000);
  for (const d of await days()) {
    if (d < oldest) await fs.promises.unlink(path.join(LOG_DIR, `${d}.jsonl`)).catch(() => {});
  }
}

// `sendFn` pushes { type: 'chat' | 'chat-delete' | 'chat-redeem', ... } to the dashboards that want chat.
// Today's log is read back, so a restart keeps the chat on screen.
async function init(sendFn) {
  send = sendFn || send;
  await prune();
  const today = await load(dayOf(Date.now()));
  recent = [...today, ...recent].slice(-RECENT_MAX);
}

function getRecent() {
  return { records: recent, channel };
}

function flush() {
  return writing;
}

module.exports = { init, addChat, addRedemption, addNotice, addFollow, onModeration, setRedeemStatus, getRecent, load, days, prune, flush, fromChat, fromRedemption, fromNotice, fromFollow, songsIn, dayOf };
