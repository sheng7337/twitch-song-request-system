const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reward-effects-'));
process.env.REWARD_EFFECTS_FILE = path.join(dir, 'reward-effects.json');
process.env.ALERTS_FILE = path.join(dir, 'alerts.json');
process.env.ALERT_MEDIA_DIR = path.join(dir, 'media');
fs.mkdirSync(process.env.ALERT_MEDIA_DIR);
for (const f of ['horn.mp3', 'boing.wav', 'cat.gif', 'notes.txt']) fs.writeFileSync(path.join(process.env.ALERT_MEDIA_DIR, f), '');
const fx = require('../server/reward-effects');

const sent = [];
const settled = [];
fx.init({ toOverlays: m => sent.push(m), toDashboards: () => {}, settle: (r, action) => settled.push([r.id, action]) });
test.after(() => { fx._reset(); fs.rmSync(dir, { recursive: true, force: true }); });
test.beforeEach(() => {
  fs.rmSync(process.env.REWARD_EFFECTS_FILE, { force: true });
  fx._reset();
  sent.length = 0;
  settled.length = 0;
});

const redeem = (n, rewardId = 'r1') => ({ kind: 'redeem', id: 'red' + n, rewardId, reward: 'Horn', user: { name: 'Viewer' + n }, text: '' });
const plays = () => sent.filter(m => m.type === 'reward-effect').map(m => m.effect);
const horn = (extra = {}) => ({ rewardId: 'r1', title: 'Horn', sounds: ['horn.mp3'], ...extra });

test('a redemption of a reward with an effect plays; ending it marks the redemption done', () => {
  fx.update({ effects: [horn({ image: 'cat.gif', place: 'top-right', showName: true })] });
  fx.setOverlays(1);
  assert.strictEqual(fx.fromRecord(redeem(1, 'other')), null);   // no effect for that reward
  assert.ok(fx.fromRecord(redeem(1)));
  const [p] = plays();
  assert.deepStrictEqual([p.sound, p.image, p.place, p.name, p.test], ['horn.mp3', 'cat.gif', 'top-right', 'Viewer1', false]);
  assert.strictEqual(p.volume, 64);   // 80 % of the overall 80 %
  assert.deepStrictEqual(settled, []);
  fx.ended(p.id);
  assert.deepStrictEqual(settled, [['red1', 'done']]);
});

test('one at a time by default; overlap plays up to three; skip refunds the new one', () => {
  fx.update({ effects: [horn()] });
  fx.setOverlays(1);
  fx.fromRecord(redeem(1)); fx.fromRecord(redeem(2));
  assert.strictEqual(plays().length, 1);
  assert.strictEqual(fx.status().queue.length, 1);
  fx.ended(plays()[0].id);
  assert.strictEqual(plays().length, 2);   // the waiting one starts

  fx._reset(); sent.length = 0; settled.length = 0;
  fx.update({ together: 'overlap', effects: [horn()] });
  fx.setOverlays(1);
  for (let i = 1; i <= 4; i++) fx.fromRecord(redeem(i));
  assert.strictEqual(plays().length, 3);
  assert.strictEqual(fx.status().queue.length, 1);

  fx._reset(); sent.length = 0; settled.length = 0;
  fx.update({ together: 'skip', effects: [horn()] });
  fx.setOverlays(1);
  fx.fromRecord(redeem(1)); fx.fromRecord(redeem(2));
  assert.strictEqual(plays().length, 1);
  assert.deepStrictEqual(settled, [['red2', 'refund']]);
});

test('paused, by a mode or with no overlay open, redemptions wait; turned off, they are refunded', () => {
  fx.update({ effects: [horn()] });
  fx.fromRecord(redeem(1));   // no overlay yet
  assert.strictEqual(plays().length, 0);
  fx.setModePause(true);
  fx.setOverlays(1);
  assert.strictEqual(plays().length, 0);
  fx.setModePause(false);
  assert.strictEqual(plays().length, 1);

  fx.update({ state: 'paused' });
  fx.fromRecord(redeem(2));
  assert.strictEqual(fx.status().queue.length, 1);
  fx.update({ state: 'off' });   // the waiting one is refunded, and new ones too
  fx.fromRecord(redeem(3));
  assert.deepStrictEqual(settled, [['red2', 'refund'], ['red3', 'refund']]);
});

test('the queue holds 20; Clear refunds the waiting ones; a turned-off row is left alone', () => {
  fx.update({ state: 'paused', effects: [horn(), { rewardId: 'r2', title: 'Quiet', on: false }] });
  fx.setOverlays(1);
  for (let i = 1; i <= 21; i++) fx.fromRecord(redeem(i));
  assert.deepStrictEqual(settled, [['red21', 'refund']]);
  fx.clear();
  assert.strictEqual(settled.length, 21);
  assert.strictEqual(fx.fromRecord(redeem(30, 'r2')), null);
  assert.strictEqual(settled.length, 21);
});

test('a test plays at once, even while paused, and touches no redemption', () => {
  fx.update({ state: 'paused', effects: [horn({ sounds: ['horn.mp3', 'boing.wav'] })] });
  const p = fx.test('r1');
  assert.ok(['horn.mp3', 'boing.wav'].includes(p.sound));
  assert.strictEqual(p.test, true);
  fx.ended(p.id);
  assert.deepStrictEqual(settled, []);
  assert.throws(() => fx.test('nope'), { messageCode: 'effectBadSetting' });
});

test('settings are checked: files in the folder, sounds as sounds, ranges, one effect per reward', () => {
  const bad = (u) => assert.throws(() => fx.update(u), { messageCode: 'effectBadSetting' });
  bad({ effects: [horn({ sounds: ['missing.mp3'] })] });
  bad({ effects: [horn({ sounds: ['cat.gif'] })] });
  bad({ effects: [horn({ image: 'horn.mp3' })] });
  bad({ effects: [horn({ size: 90 })] });
  bad({ effects: [horn({ place: 'middle' })] });
  bad({ effects: [horn(), horn()] });
  bad({ effects: [{ title: 'no reward' }] });
  bad({ together: 'sometimes' });
  bad({ state: 'loud' });
  const out = fx.update({ volume: 50, effects: [horn({ seconds: 1, size: 40 })] });
  assert.deepStrictEqual([out.volume, out.effects[0].seconds, out.effects[0].size, out.effects[0].place], [50, 2, 40, 'center']);
  assert.deepStrictEqual(out.sounds, ['boing.wav', 'horn.mp3']);
  assert.deepStrictEqual(out.pictures, ['cat.gif']);   // notes.txt isn't media
  assert.strictEqual(JSON.parse(fs.readFileSync(process.env.REWARD_EFFECTS_FILE, 'utf8')).volume, 50);
});

test('a reward with a main use too (song, random, outfit): the effect plays but leaves done / refund to it', () => {
  const main = new Set(['r2']);
  fx.init({ hasMainUse: id => main.has(id) });
  try {
    fx.update({ effects: [horn(), horn({ rewardId: 'r2', title: 'Song' })], together: 'skip' });
    fx.setOverlays(1);
    fx.fromRecord(redeem(1, 'r2'));
    fx.fromRecord(redeem(2, 'r2'));   // skipped: not refunded here
    fx.ended(plays()[0].id);          // played: not marked done here
    assert.deepStrictEqual(settled, []);
    fx.fromRecord(redeem(3, 'r1'));   // effect only: as before
    fx.ended(plays()[1].id);
    assert.deepStrictEqual(settled, [['red3', 'done']]);
  } finally {
    fx.init({ hasMainUse: () => false });
  }
});

test('attach / detach from the Rewards tab; a taken-over reward\'s copy keeps the effect', () => {
  fx.attach('r9', 'Jingle');
  fx.attach('r9', 'Jingle');   // once
  assert.deepStrictEqual(fx.status().effects.map(e => [e.rewardId, e.title, e.sounds.length]), [['r9', 'Jingle', 0]]);
  assert.ok(fx.hasEffect('r9'));
  fx.moveReward('r9', 'copy9');
  assert.ok(!fx.hasEffect('r9') && fx.hasEffect('copy9'));
  fx.detach('copy9');
  assert.deepStrictEqual(fx.status().effects, []);
  assert.throws(() => fx.attach('bad id!', 'x'), { messageCode: 'effectBadSetting' });
});
