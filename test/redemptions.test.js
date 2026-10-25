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

test('a finished takeover still counts the original\'s redemptions as song requests', () => {
  fs.writeFileSync(process.env.REWARD_TAKEOVERS_FILE, JSON.stringify({
    old: { copyId: 'new', title: '點歌券', done: true },
    waiting: { copyId: 'hidden', title: '隨機' },
  }));
  assert.deepStrictEqual(redemptions.originalsOf(new Set(['new', 'hidden'])), ['old']);
});
