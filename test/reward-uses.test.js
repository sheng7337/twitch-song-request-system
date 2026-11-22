const test = require('node:test');
const assert = require('node:assert');
const { useOf, tabsOf, change, moved } = require('../server/reward-uses');

const env = (extra = {}) => ({
  TWITCH_REWARD_ID: 'song1',
  TWITCH_RANDOM_REWARDS: JSON.stringify([{ id: 'rand1', name: 'Random', tabs: [] }, { id: 'rand2', name: 'JP', tabs: ['日語'] }]),
  OUTFIT_REWARDS: 'out1,out2',
  ...extra,
});
// .env after `values` are written
const apply = (e, values) => ({ ...e, ...values });

test('each reward has one main use, read from .env', () => {
  const e = env();
  assert.deepStrictEqual(['song1', 'rand1', 'rand2', 'out2', 'x', ''].map(id => useOf(id, e)), ['song', 'random', 'random', 'outfit', '', '']);
  assert.deepStrictEqual(tabsOf('rand2', e), ['日語']);
  assert.deepStrictEqual(tabsOf('x', e), []);
  assert.strictEqual(useOf('x', { TWITCH_RANDOM_REWARDS: 'not json' }), '');
});

test('a new use takes the reward out of its old one', () => {
  let e = env();
  e = apply(e, change('out1', 'Hat', 'random', ['國語'], e));
  assert.strictEqual(useOf('out1', e), 'random');
  assert.strictEqual(e.OUTFIT_REWARDS, 'out2');
  assert.deepStrictEqual(tabsOf('out1', e), ['國語']);
  e = apply(e, change('rand2', 'JP', 'outfit', undefined, e));
  assert.strictEqual(useOf('rand2', e), 'outfit');
  assert.ok(!JSON.parse(e.TWITCH_RANDOM_REWARDS).some(r => r.id === 'rand2'));
  e = apply(e, change('rand1', 'Random', '', undefined, e));
  assert.strictEqual(useOf('rand1', e), '');
  assert.deepStrictEqual(change('x', 'X', '', undefined, e), {});   // nothing to change
});

test('🎲 tabs change in place and are kept when not given', () => {
  let e = env();
  e = apply(e, change('rand2', 'JP', 'random', ['日語', 'English', '日語'], e));
  assert.deepStrictEqual(tabsOf('rand2', e), ['日語', 'English']);
  assert.strictEqual(JSON.parse(e.TWITCH_RANDOM_REWARDS).length, 2);
  e = apply(e, change('rand2', 'JP', 'random', undefined, e));
  assert.deepStrictEqual(tabsOf('rand2', e), ['日語', 'English']);
});

test('🎤 moves to another reward, but the song reward can\'t be set to something else', () => {
  let e = env();
  assert.throws(() => change('song1', 'Song', '', undefined, e), { messageCode: 'rewardSongNeeded' });
  assert.throws(() => change('song1', 'Song', 'outfit', undefined, e), { messageCode: 'rewardSongNeeded' });
  e = apply(e, change('out1', 'Hat', 'song', undefined, e));
  assert.strictEqual(e.TWITCH_REWARD_ID, 'out1');
  assert.strictEqual(e.OUTFIT_REWARDS, 'out2');
  assert.strictEqual(useOf('song1', e), '');
  assert.throws(() => change('x', 'X', 'party', undefined, e), { messageCode: 'rewardUseBad' });
  assert.throws(() => change('', 'X', 'song', undefined, e), { messageCode: 'rewardUseBad' });
});

test('a taken-over reward\'s copy keeps every use', () => {
  const e = env();
  assert.deepStrictEqual(moved('song1', 'c1', e), { TWITCH_REWARD_ID: 'c1' });
  assert.deepStrictEqual(JSON.parse(moved('rand2', 'c2', e).TWITCH_RANDOM_REWARDS)[1], { id: 'c2', name: 'JP', tabs: ['日語'] });
  assert.deepStrictEqual(moved('out1', 'c3', e), { OUTFIT_REWARDS: 'c3,out2' });
  assert.deepStrictEqual(moved('x', 'c4', e), {});
});
