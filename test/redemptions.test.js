const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { stubModule } = require('./helpers');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'redemptions-'));
process.env.CHAT_LOG_DIR = tmp;
process.env.REWARD_TAKEOVERS_FILE = path.join(tmp, 'reward-takeovers.json');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
stubModule('sheets.js', { getSongs: () => [] });
stubModule('history.js', { isReady: () => false, getLastRequestedAt: () => null });
stubModule('twitch.js', { ensureFreshToken: async () => {} });
const redemptions = require('../server/redemptions');

test('the hidden copy has the original\'s settings, is off, and has a name of its own', () => {
  const original = {
    id: 'orig', title: '點歌券', cost: 500, prompt: '輸入歌名', is_enabled: true, is_paused: false, background_color: '#9147FF',
    is_user_input_required: true, should_redemptions_skip_request_queue: false,
    max_per_stream_setting: { is_enabled: false, max_per_stream: 0 },
    max_per_user_per_stream_setting: { is_enabled: true, max_per_user_per_stream: 2 },
    global_cooldown_setting: { is_enabled: true, global_cooldown_seconds: 60 },
    image: { url_1x: 'https://x/icon.png' },
  };
  assert.deepStrictEqual(redemptions.copyOf(original), {
    title: '點歌券 (new)', cost: 500, prompt: '輸入歌名', is_enabled: false, background_color: '#9147FF',
    is_user_input_required: true, should_redemptions_skip_request_queue: false,
    is_max_per_user_per_stream_enabled: true, max_per_user_per_stream: 2,
    is_global_cooldown_enabled: true, global_cooldown_seconds: 60,
  });
  const long = 'x'.repeat(45);
  assert.strictEqual([...redemptions.tempTitle(long)].length, 45, 'within Twitch\'s 45 characters');
});

test('a new reward: on, in Twitch\'s queue, checked against Twitch\'s limits', () => {
  assert.deepStrictEqual(redemptions.newRewardBody({ title: ' 情境點歌 ', cost: '500.4', prompt: '寫下你的心情\n謝謝', textRequired: true }), {
    title: '情境點歌', cost: 500, prompt: '寫下你的心情 謝謝', is_enabled: true, is_user_input_required: true, should_redemptions_skip_request_queue: false,
  });
  const code = (input) => { try { redemptions.newRewardBody(input); } catch (err) { return err.messageCode; } return null; };
  assert.strictEqual(code({ title: '', cost: 1 }), 'rewardTitleMissing');
  assert.strictEqual(code({ title: 'x'.repeat(46), cost: 1 }), 'rewardTitleLong');
  assert.strictEqual(code({ title: '中'.repeat(45), cost: 1 }), null, '45 characters, not bytes');
  assert.strictEqual(code({ title: 'x', cost: 0 }), 'rewardCostBad');
  assert.strictEqual(code({ title: 'x', cost: 'abc' }), 'rewardCostBad');
  assert.strictEqual(code({ title: 'x', cost: 1, prompt: 'p'.repeat(201) }), 'rewardPromptLong');
});

test('a finished takeover still counts the original\'s redemptions as song requests', () => {
  fs.writeFileSync(process.env.REWARD_TAKEOVERS_FILE, JSON.stringify({
    old: { copyId: 'new', title: '點歌券', done: true },
    waiting: { copyId: 'hidden', title: '隨機' },
  }));
  assert.deepStrictEqual(redemptions.originalsOf(new Set(['new', 'hidden'])), ['old']);
});

test('the song rewards are the song request reward, the random ones, the 🎭 ones, and the originals they took over', () => {
  fs.writeFileSync(process.env.REWARD_TAKEOVERS_FILE, JSON.stringify({ old: { copyId: 'song', title: '點歌券', done: true } }));
  const saved = { reward: process.env.TWITCH_REWARD_ID, random: process.env.TWITCH_RANDOM_REWARDS, mood: process.env.MOOD_REWARDS };
  process.env.TWITCH_REWARD_ID = 'song';
  process.env.TWITCH_RANDOM_REWARDS = JSON.stringify([{ id: 'rnd1', tabs: [] }, { id: 'rnd2', tabs: ['國語'] }]);
  process.env.MOOD_REWARDS = 'mood1, mood2';
  try {
    assert.deepStrictEqual([...redemptions.songRewardIds()].sort(), ['mood1', 'mood2', 'old', 'rnd1', 'rnd2', 'song']);
  } finally {
    for (const [k, v] of [['TWITCH_REWARD_ID', saved.reward], ['TWITCH_RANDOM_REWARDS', saved.random], ['MOOD_REWARDS', saved.mood]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('redemptions made while disconnected: those since the drop, oldest first, as EventSub sends them', () => {
  const r = (id, at) => ({
    id, broadcaster_id: '1', broadcaster_login: 'me', broadcaster_name: 'Me', user_id: '9', user_login: 'v', user_name: 'V',
    user_input: '我愛他', status: 'UNFULFILLED', redeemed_at: at, reward: { id: 'song', title: '點歌券', prompt: '', cost: 500 },
  });
  const since = Date.parse('2026-11-18T16:28:00Z');
  const missed = redemptions.missedFrom([r('b', '2026-11-18T16:29:30Z'), r('old', '2026-11-18T15:00:00Z'), r('a', '2026-11-18T16:28:40Z')], since);
  assert.deepStrictEqual(missed.map(e => e.id), ['a', 'b']);
  assert.deepStrictEqual(missed[0], {
    id: 'a', broadcaster_user_id: '1', broadcaster_user_login: 'me', broadcaster_user_name: 'Me',
    user_id: '9', user_login: 'v', user_name: 'V', user_input: '我愛他', status: 'unfulfilled',
    redeemed_at: '2026-11-18T16:28:40Z', reward: { id: 'song', title: '點歌券', prompt: '', cost: 500 },
  });
});
