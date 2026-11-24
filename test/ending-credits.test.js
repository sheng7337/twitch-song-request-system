const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { stubModule } = require('./helpers');

// Chat log and the last-roll time go to a temp folder, never the real files
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ending-credits-'));
process.env.CHAT_LOG_DIR = tmp;
process.env.ENDING_CREDITS_FILE = path.join(tmp, 'ending-credits.json');
process.env.REWARD_TAKEOVERS_FILE = path.join(tmp, 'reward-takeovers.json');
process.env.TWITCH_BROADCASTER_ID = '1';
process.env.TWITCH_REWARD_ID = 'song-reward';
process.env.TWITCH_RANDOM_REWARDS = JSON.stringify([{ id: 'random-reward', tabs: [] }]);
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

stubModule('sheets.js', { getSongs: () => [] });
stubModule('history.js', { isReady: () => false, getLastRequestedAt: () => null });
stubModule('twitch.js', { ensureFreshToken: async () => {} });
console.log = console.error = console.warn = () => {};
const log = require('../server/chat-log');
const credits = require('../server/ending-credits');

const u = (id, login, name = login) => ({ id, login, name, color: '', badges: [] });
const chat = (at, user, text, extra = {}) => ({ kind: 'chat', id: `m${at}`, at, user, text, parts: [], type: 'text', ...extra });
const keys = (groups) => Object.fromEntries(groups.map(g => [g.key, g.people.map(p => p.login)]));

test('Twitch notices and follows become chat-log records', () => {
  const gift = log.fromNotice({
    message_id: 'n1', notice_type: 'sub_gift', system_message: 'Gifter gifted a Tier 1 sub to Lucky!',
    chatter_user_id: '7', chatter_user_login: 'gifter', chatter_user_name: 'Gifter', chatter_is_anonymous: false,
    badges: [], message: { text: '' },
    sub_gift: { recipient_user_id: '8', recipient_user_login: 'lucky', recipient_user_name: 'Lucky', sub_tier: '1000' },
  }, 100);
  assert.deepStrictEqual([gift.kind, gift.notice, gift.user.login, gift.recipient, gift.anonymous],
    ['notice', 'sub_gift', 'gifter', { id: '8', login: 'lucky', name: 'Lucky' }, undefined]);

  const raid = log.fromNotice({
    message_id: 'n2', notice_type: 'raid', system_message: '5 raiders from Friend have joined!',
    chatter_user_id: '9', chatter_user_login: 'friend', chatter_user_name: 'Friend', badges: [], message: { text: '' },
    raid: { user_id: '9', user_login: 'friend', user_name: 'Friend', viewer_count: 5, profile_image_url: 'https://x/friend.png' },
  }, 200);
  assert.deepStrictEqual([raid.user.login, raid.viewers, raid.avatar], ['friend', 5, 'https://x/friend.png']);

  const follow = log.fromFollow({ user_id: '10', user_login: 'newbie', user_name: 'Newbie', followed_at: '' }, 300);
  assert.deepStrictEqual([follow.kind, follow.user.login], ['follow', 'newbie']);

  const redeem = log.fromRedemption({ id: 'r1', user_id: '11', user_login: 'r', user_name: 'R', user_input: '晴天', reward: { id: 'song-reward', title: '點歌' } }, 400);
  assert.strictEqual(redeem.rewardId, 'song-reward');
});

test('groups in roll order: each viewer once per group; song rewards count as requests; broadcaster and bots left out', () => {
  const records = [
    chat(1, u('2', 'old'), 'before the last roll'),
    { kind: 'notice', id: 'n1', at: 10, user: u('3', 'raider'), notice: 'raid', viewers: 5, avatar: 'https://x/r.png' },
    { kind: 'notice', id: 'n2', at: 11, user: u('4', 'subber'), notice: 'sub' },
    { kind: 'notice', id: 'n3', at: 12, user: u('5', 'gifter', 'Gifter 聖誕老人'), notice: 'community_sub_gift' },
    { kind: 'notice', id: 'n4', at: 12, user: u('5', 'gifter'), notice: 'sub_gift', recipient: u('6', 'lucky') },
    { kind: 'notice', id: 'n5', at: 13, user: u('0', 'ananonymousgifter'), notice: 'sub_gift', anonymous: true, recipient: u('12', 'lucky2') },
    { kind: 'notice', id: 'n6', at: 14, user: u('4', 'subber'), notice: 'announcement' },
    { kind: 'follow', id: 'f1', at: 15, user: u('7', 'follower') },
    { kind: 'redeem', id: 'r1', at: 16, user: u('8', 'requester'), reward: '點歌', rewardId: 'song-reward', text: '晴天' },
    { kind: 'redeem', id: 'r2', at: 17, user: u('9', 'lucky-dip'), reward: '隨機', rewardId: 'random-reward', text: '' },
    { kind: 'redeem', id: 'r3', at: 18, user: u('10', 'hydrate'), reward: '喝水', rewardId: 'water', text: '' },
    chat(20, u('11', 'cheerer'), 'Cheer100', { bits: 100 }),
    chat(21, u('4', 'subber'), 'Cheer500', { bits: 500 }),
    chat(22, u('1', 'streamer'), 'thanks all'),
    chat(23, u('13', 'nightbot'), 'beep'),
    chat(24, u('8', 'requester'), '!endingtk'),
    chat(25, u('14', 'quiet'), 'deleted', { deleted: true }),
  ];
  const groups = credits.collect(records, { since: 5, broadcasterId: '1', songRewards: new Set(['song-reward', 'random-reward']) });
  assert.deepStrictEqual(keys(groups), {
    raiders: ['raider'],
    subs: ['subber', 'gifter', 'lucky', 'lucky2'],
    cheers: ['subber', 'cheerer'],   // most bits first
    followers: ['follower'],
    redeemers: ['hydrate'],
    requesters: ['requester', 'lucky-dip'],
    chatters: ['cheerer', 'subber'],
  });
  assert.strictEqual(groups[0].people[0].avatarUrl, 'https://x/r.png', 'a raid brings its own picture');
  assert.strictEqual(groups[1].people[1].displayName, 'Gifter 聖誕老人', 'cards get displayName, as !tk sends');
});

test('gifters stay under subscribers with how many subs they gifted; their recipients too', () => {
  const gifter = u('5', 'pup');
  const records = [
    { kind: 'notice', id: 'g0', at: 10, user: u('4', 'subber'), notice: 'resub' },
    // a gift of 5, as Twitch sends it: the count once, then one line per recipient
    { kind: 'notice', id: 'g1', at: 11, user: gifter, notice: 'community_sub_gift', count: 5 },
    ...[1, 2, 3, 4, 5].map(i => ({ kind: 'notice', id: 'g1' + i, at: 11, user: gifter, notice: 'sub_gift', communityGift: 'c1', recipient: u('6' + i, 'got' + i) })),
    // and later one more, to one viewer
    { kind: 'notice', id: 'g2', at: 12, user: gifter, notice: 'sub_gift', recipient: u('70', 'later') },
    // an older log: the gift of several has no count, its lines are counted
    { kind: 'notice', id: 'g3', at: 13, user: u('8', 'old'), notice: 'community_sub_gift' },
    ...[1, 2].map(i => ({ kind: 'notice', id: 'g3' + i, at: 13, user: u('8', 'old'), notice: 'sub_gift', communityGift: 'c3', recipient: u('9' + i, 'oldgot' + i) })),
    // anonymous: no card for the gifter, the recipient still gets one
    { kind: 'notice', id: 'g4', at: 14, user: u('0', 'ananonymousgifter'), notice: 'sub_gift', anonymous: true, recipient: u('99', 'anongot') },
  ];
  const [subs] = credits.collect(records);
  assert.strictEqual(subs.key, 'subs');
  assert.deepStrictEqual(subs.people.map(p => [p.login, p.gifts || 0]), [
    ['subber', 0], ['pup', 6], ['got1', 0], ['got2', 0], ['got3', 0], ['got4', 0], ['got5', 0], ['later', 0],
    ['old', 2], ['oldgot1', 0], ['oldgot2', 0], ['anongot', 0],
  ]);
});

test('Bits spent on Power-ups and combos count with the cheers; cheers are not counted twice', () => {
  const at = 1000;
  const powerUp = log.fromBitsUse({ user_id: '30', user_login: 'sparkle', user_name: 'Sparkle', bits: 50, type: 'power_up',
    power_up: { type: 'message_effect' }, message: { text: 'hi', fragments: [] } }, at);
  assert.deepStrictEqual([powerUp.kind, powerUp.notice, powerUp.bits, powerUp.use, powerUp.powerUp, powerUp.user.login],
    ['notice', 'bits_use', 50, 'power_up', 'message_effect', 'sparkle']);
  assert.strictEqual(log.fromBitsUse({ user_id: '31', user_login: 'c', bits: 100, type: 'cheer' }, at), null, 'a cheer comes with its chat message');
  const combo = log.fromBitsUse({ user_id: '32', user_login: 'combo', user_name: 'Combo', bits: 10, type: 'combo' }, at + 1);
  const records = [chat(at - 1, u('31', 'c'), 'Cheer100', { bits: 100 }), powerUp,
    { ...powerUp, id: 'b2', at: at + 2, bits: 80 }, combo];
  const cheers = credits.collect(records).find(g => g.key === 'cheers');
  assert.deepStrictEqual(cheers.people.map(p => p.login), ['sparkle', 'c', 'combo'], '130 Bits, then 100, then 10');
});

test('top chatters: most messages first, at most 8 (two pages)', () => {
  const records = [];
  for (let i = 0; i < 12; i++) for (let n = 0; n <= i; n++) records.push(chat(i * 100 + n, u(String(100 + i), `c${i}`), 'hi'));
  const [g] = credits.collect(records);
  assert.strictEqual(g.key, 'chatters');
  assert.deepStrictEqual(g.people.map(p => p.login), ['c11', 'c10', 'c9', 'c8', 'c7', 'c6', 'c5', 'c4']);
});

test('gather reads the chat log since the last roll, and at most 12 hours back', async () => {
  const now = Date.now();
  log.addFollow({ user_id: '20', user_login: 'today', user_name: 'Today' });
  log.addNotice({ notice_type: 'shared_chat_sub', chatter_user_id: '21', chatter_user_login: 'elsewhere', message: { text: '' } });
  assert.deepStrictEqual(keys(await credits.gather(now + 1000)), { followers: ['today'] }, 'shared-chat notices are other channels\'');

  credits.saveRunAt(now + 1000);
  assert.deepStrictEqual(await credits.gather(now + 2000), [], 'nobody new since the last roll');
  assert.strictEqual(credits.lastRunAt(), now + 1000);

  fs.writeFileSync(process.env.ENDING_CREDITS_FILE, JSON.stringify({ lastAt: 0 }));
  assert.deepStrictEqual(await credits.gather(now + 13 * 3600000), [], 'older than 12 hours: an earlier stream');
});
