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
