const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { stubModule, song } = require('./helpers');

// Logs go to a temp folder, never the real chat-logs/
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-log-'));
process.env.CHAT_LOG_DIR = tmp;
process.env.CHAT_LOG_DAYS = '3';
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

stubModule('sheets.js', {
  getSongs: () => [song('晴天', '周杰倫'), song('Love Story', 'Taylor Swift'), song('Love', 'x'), song('Up', 'y'), song('愛', 'z')],
});
// Request history (history.js keeps UTC "YYYY-MM-DD HH:MM:SS"): 晴天 was sung, Love Story never
const historyState = { ready: true, last: { '晴天': '2026-10-20 12:00:00' } };
stubModule('history.js', {
  isReady: () => historyState.ready,
  getLastRequestedAt: (title) => historyState.last[title] || null,
});
console.log = console.error = console.warn = () => {};
const log = require('../server/chat-log');

// channel.chat.message as EventSub sends it
const chatEvent = (over = {}) => ({
  broadcaster_user_id: '1', broadcaster_user_login: 'kenzi', broadcaster_user_name: 'Kenzi',
  chatter_user_id: '42', chatter_user_login: 'viewer', chatter_user_name: '觀眾A',
  message_id: 'm1', color: '#FF7F50', message_type: 'text', cheer: null, reply: null,
  badges: [{ set_id: 'subscriber', id: '12', info: '14' }, { set_id: 'vip', id: '1', info: '' }],
  message: {
    text: '@Kenzi 可以唱晴天嗎 Kappa',
    fragments: [
      { type: 'mention', text: '@Kenzi', mention: { user_id: '1', user_login: 'kenzi', user_name: 'Kenzi' } },
      { type: 'text', text: ' 可以唱晴天嗎 ' },
      { type: 'emote', text: 'Kappa', emote: { id: '25', emote_set_id: '0' } },
    ],
  },
  ...over,
});

test('a chat message keeps who said it, badges, emotes, mentions and the songs it names', () => {
  const rec = log.fromChat(chatEvent(), 1000);
  assert.deepStrictEqual(rec, {
    kind: 'chat', id: 'm1', at: 1000,
    user: { id: '42', login: 'viewer', name: '觀眾A', color: '#FF7F50', badges: ['subscriber', 'vip'] },
    text: '@Kenzi 可以唱晴天嗎 Kappa',
    parts: [{ t: 'mention', text: '@Kenzi', login: 'kenzi' }, { t: 'text', text: ' 可以唱晴天嗎 ' }, { t: 'emote', text: 'Kappa', id: '25' }],
    type: 'text', songs: [{ title: '晴天', artist: '周杰倫', lastAt: Date.parse('2026-10-20T12:00:00Z') }],
  });

  const cheer = log.fromChat(chatEvent({
    message_type: 'user_intro', cheer: { bits: 100 },
    reply: { parent_user_name: 'Kenzi', parent_message_body: '歡迎' },
    message: { text: 'Cheer100 hi', fragments: [{ type: 'cheermote', text: 'Cheer100', cheermote: { prefix: 'cheer', bits: 100, tier: 100 } }, { type: 'text', text: ' hi' }] },
  }));
  assert.strictEqual(cheer.bits, 100);
  assert.strictEqual(cheer.type, 'user_intro');
  assert.deepStrictEqual(cheer.reply, { name: 'Kenzi', text: '歡迎' });
  assert.deepStrictEqual(cheer.parts[0], { t: 'cheer', text: 'Cheer100', bits: 100 });
});

test('a song named in chat says when it was last sung: never, or not known while the history is not loaded', () => {
  const text = (t) => ({ message: { text: t, fragments: [{ type: 'text', text: t }] } });
  assert.deepStrictEqual(log.fromChat(chatEvent(text('love story please'))).songs, [{ title: 'Love Story', artist: 'Taylor Swift', lastAt: null }]);
  historyState.ready = false;
  assert.deepStrictEqual(log.fromChat(chatEvent(text('love story please'))).songs, [{ title: 'Love Story', artist: 'Taylor Swift' }]);
  historyState.ready = true;
});

test('song mentions: longest title wins, short English words and commands do not count', () => {
  assert.deepStrictEqual(log.songsIn('想聽 love story!!'), [{ title: 'Love Story', artist: 'Taylor Swift' }]);
  assert.deepStrictEqual(log.songsIn('what is up'), [], '"Up" is too short to tell from normal English');
  assert.deepStrictEqual(log.songsIn('我愛你'), [], 'one-character titles are left out');
  assert.strictEqual(log.fromChat(chatEvent({ message: { text: '!sr 晴天', fragments: [{ type: 'text', text: '!sr 晴天' }] } })).songs, undefined);
});

test('a redemption is logged with its reward and text', () => {
  const rec = log.fromRedemption({ id: 'r1', user_id: '42', user_login: 'viewer', user_name: '觀眾A', user_input: ' 晴天 ', reward: { id: 'rw1', title: '點歌' } }, 5);
  assert.deepStrictEqual(rec, { kind: 'redeem', id: 'r1', at: 5, user: { id: '42', login: 'viewer', name: '觀眾A', color: '', badges: [] }, text: '晴天', reward: '點歌', rewardId: 'rw1' });
});

test('messages are kept, sent to dashboards and saved per day; deletions apply when a day is read back', async () => {
  const sent = [];
  await log.init(m => sent.push(m));
  log.addChat(chatEvent({ message_id: 'a' }));
  log.addChat(chatEvent({ message_id: 'b', chatter_user_id: '7', chatter_user_login: 'troll' }));
  log.addRedemption({ id: 'r9', user_login: 'viewer', user_name: '觀眾A', user_input: '晴天', reward: { title: '點歌' } });
  log.onModeration('channel.chat.message_delete', { message_id: 'a' });
  log.onModeration('channel.chat.clear_user_messages', { target_user_id: '7' });
  await log.flush();

  assert.deepStrictEqual(sent.map(m => m.type), ['chat', 'chat', 'chat', 'chat-delete', 'chat-delete']);
  const { records, channel } = log.getRecent();
  assert.strictEqual(channel, 'kenzi');
  assert.deepStrictEqual(records.map(r => [r.id, !!r.deleted]), [['a', true], ['b', true], ['r9', false]]);

  const today = log.dayOf(Date.now());
  assert.deepStrictEqual(await log.days(), [today]);
  const day = await log.load(today);
  assert.deepStrictEqual(day.map(r => [r.id, !!r.deleted]), [['a', true], ['b', true], ['r9', false]]);
  assert.deepStrictEqual(await log.load('../secrets'), [], 'only real dates are read');
});

test('a restart shows today again; logs older than CHAT_LOG_DAYS are deleted', async () => {
  const now = Date.now();
  const old = log.dayOf(now - 5 * 86400000);
  const kept = log.dayOf(now - 2 * 86400000);
  fs.writeFileSync(path.join(tmp, `${old}.jsonl`), '');
  fs.writeFileSync(path.join(tmp, `${kept}.jsonl`), '{"kind":"chat","id":"x"');   // cut off by a crash
  await log.init(() => {});
  assert.deepStrictEqual(await log.days(), [log.dayOf(now), kept]);
  assert.deepStrictEqual(await log.load(kept), []);
  assert.ok(log.getRecent().records.some(r => r.id === 'r9'), "today's chat is back after a restart");
});

test('a redemption done or refunded later: sent to dashboards, and applied when its day is read back', async () => {
  const sent = [];
  await log.init(m => sent.push(m));
  const rec = log.addRedemption({ id: 'w1', user_login: 'viewer', user_name: '觀眾A', user_input: '晴天', status: 'unfulfilled', reward: { id: 'rw1', title: '點歌' } });
  assert.strictEqual(rec.status, 'unfulfilled');
  log.setRedeemStatus('w1', 'fulfilled');
  log.setRedeemStatus('w1', 'fulfilled');   // Twitch's update event after the dashboard's own ✓
  // Yesterday's redemption, no longer in memory: its status goes to yesterday's file
  const yesterday = Date.now() - 86400000;
  fs.appendFileSync(path.join(tmp, `${log.dayOf(yesterday)}.jsonl`), JSON.stringify({ kind: 'redeem', id: 'w0', at: yesterday, user: {}, text: '', reward: '點歌', rewardId: 'rw1', status: 'unfulfilled' }) + '\n');
  log.setRedeemStatus('w0', 'canceled', new Date(yesterday).toISOString());
  await log.flush();

  assert.deepStrictEqual(sent.filter(m => m.type === 'chat-redeem'), [{ type: 'chat-redeem', id: 'w1', status: 'fulfilled' }, { type: 'chat-redeem', id: 'w0', status: 'canceled' }]);
  assert.strictEqual((await log.load(log.dayOf(Date.now()))).find(r => r.id === 'w1').status, 'fulfilled');
  const before = await log.load(log.dayOf(yesterday));
  assert.deepStrictEqual(before.map(r => [r.id, r.status]), [['w0', 'canceled']], 'status lines are applied, not listed');
});

test('a first message in the channel: flagged before or after it arrives, and read back', async () => {
  const sent = [];
  await log.init(m => sent.push(m));
  log.markFirst('early');   // Twitch's IRC was quicker than EventSub
  const a = log.addChat({ message_id: 'early', chatter_user_login: 'a', chatter_user_name: 'A', message: { text: 'hi', fragments: [] }, message_type: 'text' });
  const b = log.addChat({ message_id: 'late', chatter_user_login: 'b', chatter_user_name: 'B', message: { text: 'yo', fragments: [] }, message_type: 'text' });
  log.markFirst('late');
  log.markFirst('late');
  await log.flush();
  assert.strictEqual(a.first, true);
  assert.strictEqual(b.first, true);
  assert.deepStrictEqual(sent.filter(m => m.type === 'chat-first'), [{ type: 'chat-first', id: 'late' }]);
  const day = await log.load(log.dayOf(Date.now()));
  assert.deepStrictEqual(day.filter(r => r.first).map(r => r.id), ['early', 'late']);
  assert.ok(!day.some(r => r.kind === 'chat-first'), 'flag lines are applied, not listed');
});

test('announced marks: kept per day, applied when read back, and undone; a gift of several subs is marked as such', async () => {
  const sent = [];
  await log.init(m => sent.push(m));
  const gift = log.addNotice({ message_id: 'g1', chatter_user_login: 'santa', chatter_user_name: 'Santa', notice_type: 'sub_gift',
    sub_gift: { recipient_user_id: '9', recipient_user_login: 'kid', community_gift_id: 'cg1' } });
  assert.strictEqual(gift.communityGift, 'cg1');
  const hi = log.addChat({ message_id: 'hi1', chatter_user_login: 'a', chatter_user_name: 'A', message: { text: 'hello', fragments: [] }, message_type: 'text' });
  const yesterday = Date.now() - 86400000;
  fs.appendFileSync(path.join(tmp, `${log.dayOf(yesterday)}.jsonl`), JSON.stringify({ kind: 'follow', id: 'f-old', at: yesterday, user: {} }) + '\n');
  log.setAnnounced([{ id: 'hi1', at: hi.at }, { id: 'g1', at: gift.at }, { id: 'f-old', at: yesterday }], true);
  log.setAnnounced([{ id: 'g1', at: gift.at }], false);
  await log.flush();

  assert.strictEqual(hi.announced, true);
  assert.deepStrictEqual(sent.filter(m => m.type === 'chat-announced').map(m => [m.ids, m.done]), [[['hi1', 'g1', 'f-old'], true], [['g1'], false]]);
  const since = await log.loadSince(yesterday - 1000);
  const marked = Object.fromEntries(since.filter(r => ['hi1', 'g1', 'f-old'].includes(r.id)).map(r => [r.id, !!r.announced]));
  assert.deepStrictEqual(marked, { 'f-old': true, g1: false, hi1: true });
  assert.ok(!since.some(r => r.kind === 'announced'), 'mark lines are applied, not listed');
  assert.ok((await log.loadSince(Date.now() - 60000)).every(r => r.at >= Date.now() - 60000), 'only records since then');
});
