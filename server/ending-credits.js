// server/ending-credits.js
// !endingtk — the !tk sponsor roll for the whole stream, one heading per group: raiders,
// subscribers (gifters and the viewers they gifted), cheerers, new followers, channel-point
// redeemers, song requesters and the top chatters, since the last !endingtk (at most
// WINDOW_MS back, so the first one covers this stream only).
//
// Everything is read back from the chat log (chat-log.js keeps chat, redemptions, Twitch's
// sub / raid notices and follows, one file per day), so a restart mid-stream loses no one.

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const chatLog = require('./chat-log');
const redemptions = require('./redemptions');
const { ensureFreshToken } = require('./twitch');

const STATE_PATH = process.env.ENDING_CREDITS_FILE || path.join(__dirname, '..', 'ending-credits.json');   // tests use a temp file
const WINDOW_MS = 12 * 60 * 60 * 1000;
const TOP_CHATTERS = 8;   // two pages of four
// Same list as the dashboard's "Hide bots"
const BOTS = new Set(['nightbot', 'streamelements', 'moobot', 'fossabot', 'wizebot', 'streamlabs', 'soundalerts',
  'sery_bot', 'botrixoficial', 'kofistreambot', 'commanderroot', 'streamstickers', 'pokemoncommunitygame']);
// Heading order on the roll; clip player shows clip.credits.<key>
const GROUPS = ['raiders', 'subs', 'cheers', 'followers', 'redeemers', 'requesters', 'chatters'];
const SUB_NOTICES = new Set(['sub', 'resub', 'sub_gift', 'community_sub_gift', 'gift_paid_upgrade', 'prime_paid_upgrade', 'pay_it_forward']);

function lastRunAt() {
  try { return Number(JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')).lastAt) || 0; } catch { return 0; }
}

function saveRunAt(at) {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify({ lastAt: at }, null, 2)); } catch (err) {
    console.error('[ending-credits] Could not save the time of this roll:', err.message);
  }
}

// Song request and random song rewards: their redeemers are thanked as requesters. A reward the
// app took over (redemptions.js) still counts under its old ID, earlier that stream.
function songRewardIds() {
  const ids = new Set([process.env.TWITCH_REWARD_ID].filter(Boolean));
  try { for (const r of JSON.parse(process.env.TWITCH_RANDOM_REWARDS || '[]')) if (r.id) ids.add(r.id); } catch {}
  for (const id of redemptions.originalsOf(ids)) ids.add(id);
  return ids;
}

// Records → [{ key, people: [{ id, login, displayName, avatarUrl? }] }] (the card shape !tk sends),
// empty groups left out.
// Each group lists a viewer once, in order of first appearance (cheers: most bits first,
// chatters: most messages first). The broadcaster and bots are left out.
function collect(records, { since = 0, broadcasterId = '', songRewards = new Set() } = {}) {
  const groups = Object.fromEntries(GROUPS.map(k => [k, new Map()]));
  const bits = new Map();
  const said = new Map();
  const add = (key, u, extra) => {
    if (!u || !(u.id || u.login)) return;
    if (u.id && u.id === broadcasterId) return;
    if (BOTS.has((u.login || '').toLowerCase())) return;
    const id = u.id || u.login.toLowerCase();
    if (!groups[key].has(id)) groups[key].set(id, { id: u.id || '', login: u.login || '', displayName: u.name || u.login, ...extra });
  };
  for (const r of records) {
    if (r.at < since) continue;
    if (r.kind === 'follow') add('followers', r.user);
    else if (r.kind === 'redeem') add(r.rewardId && songRewards.has(r.rewardId) ? 'requesters' : 'redeemers', r.user);
    else if (r.kind === 'notice') {
      if (r.notice === 'raid') add('raiders', r.user, r.avatar ? { avatarUrl: r.avatar } : {});
      else if (SUB_NOTICES.has(r.notice)) {
        if (!r.anonymous) add('subs', r.user);
        if (r.recipient) add('subs', r.recipient);
      }
    } else if (r.kind === 'chat' && !r.deleted) {
      if (r.bits) { add('cheers', r.user); bits.set(r.user.id || r.user.login, (bits.get(r.user.id || r.user.login) || 0) + r.bits); }
      if (!r.text.startsWith('!')) {
        add('chatters', r.user);
        said.set(r.user.id || r.user.login, (said.get(r.user.id || r.user.login) || 0) + 1);
      }
    }
  }
  const byCount = (counts) => (a, b) => (counts.get(b.id || b.login) || 0) - (counts.get(a.id || a.login) || 0);
  return GROUPS.map(key => {
    let people = [...groups[key].values()];
    if (key === 'cheers') people.sort(byCount(bits));
    if (key === 'chatters') people = people.sort(byCount(said)).slice(0, TOP_CHATTERS);
    return { key, people };
  }).filter(g => g.people.length);
}

// Profile pictures for the cards, 100 viewers per Twitch call; a failure leaves the initials
async function addAvatars(groups) {
  const ids = [...new Set(groups.flatMap(g => g.people.filter(p => p.id && !p.avatarUrl).map(p => p.id)))];
  const urls = new Map();
  try {
    if (ids.length) await ensureFreshToken();
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await axios.get('https://api.twitch.tv/helix/users', {
        params: { id: ids.slice(i, i + 100) },
        paramsSerializer: { indexes: null },   // id=1&id=2, as Twitch wants
        headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${process.env.TWITCH_USER_ACCESS_TOKEN}` },
        timeout: 10000,
      });
      for (const u of data.data || []) urls.set(u.id, u.profile_image_url || '');
    }
  } catch (err) {
    console.error('[ending-credits] Could not get profile pictures:', err.response?.data?.message || err.message);
  }
  for (const g of groups) for (const p of g.people) if (!p.avatarUrl) p.avatarUrl = urls.get(p.id) || '';
  return groups;
}

// Everyone since the last roll: the chat log of each day the window touches
async function gather(now = Date.now()) {
  const since = Math.max(lastRunAt(), now - WINDOW_MS);
  const records = await chatLog.loadSince(since, now);
  return collect(records, { since, broadcasterId: process.env.TWITCH_BROADCASTER_ID || '', songRewards: songRewardIds() });
}

module.exports = { collect, gather, addAvatars, saveRunAt, lastRunAt, GROUPS, TOP_CHATTERS };
