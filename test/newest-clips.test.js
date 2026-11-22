const test = require('node:test');
const assert = require('node:assert');
const { newestClips } = require('../server/newest-clips');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-23T00:00:00Z');

// A fake Twitch: clips in the window, most-viewed first, in pages
function fakeTwitch(clips, pageSize = 100) {
  const calls = [];
  const get = async (p) => {
    calls.push(p);
    const from = Date.parse(p.started_at), to = Date.parse(p.ended_at);
    const inWin = clips.filter(c => { const t = Date.parse(c.created_at); return t >= from && t < to; })
      .sort((a, b) => b.view_count - a.view_count);
    const start = Number(p.after || 0);
    const data = inWin.slice(start, start + Math.min(p.first, pageSize));
    return { data, pagination: start + data.length < inWin.length ? { cursor: String(start + data.length) } : {} };
  };
  return { get, calls };
}
const clip = (id, daysAgo, views) => ({ id, created_at: new Date(NOW - daysAgo * DAY).toISOString(), view_count: views });

test('keeps the newest clips, newest first, not the most viewed', async () => {
  const clips = [];
  for (let i = 0; i < 200; i++) clips.push(clip('c' + i, i * 3 + 1, i));   // older = more views
  const { get } = fakeTwitch(clips);
  const got = await newestClips(get, 'b1', 50, NOW);
  assert.strictEqual(got.length, 50);
  assert.deepStrictEqual(got.map(c => c.id), clips.slice(0, 50).map(c => c.id));
});

test('reads every page of a window, and every window, for a channel with few clips', async () => {
  const clips = [clip('a', 2, 1), clip('b', 40, 1), clip('c', 200, 1), clip('d', 800, 1), clip('e', 2000, 9)];
  const { get, calls } = fakeTwitch(clips, 1);
  const got = await newestClips(get, 'b1', 50, NOW);
  assert.deepStrictEqual(got.map(c => c.id), ['a', 'b', 'c', 'd', 'e']);
  // each call names a closed window (with only started_at, Twitch reads a week)
  assert.ok(calls.every(p => p.started_at && p.ended_at && p.broadcaster_id === 'b1'));
});

test('stops once it has enough', async () => {
  const clips = [];
  for (let i = 0; i < 80; i++) clips.push(clip('n' + i, 1 + i * 0.2, 1));   // all in the last 30 days
  clips.push(clip('old', 300, 999));
  const { get, calls } = fakeTwitch(clips);
  const got = await newestClips(get, 'b1', 50, NOW);
  assert.strictEqual(got.length, 50);
  assert.strictEqual(calls.length, 1);
  assert.ok(!got.some(c => c.id === 'old'));
});

test('no clips at all', async () => {
  const { get } = fakeTwitch([]);
  assert.deepStrictEqual(await newestClips(get, 'b1', 50, NOW), []);
});

test('SHOUTOUT_CLIPS: newest (default) or top', () => {
  const { clipPool } = require('../server/newest-clips');
  assert.strictEqual(clipPool({}), 'newest');
  assert.strictEqual(clipPool({ SHOUTOUT_CLIPS: 'TOP' }), 'top');
  assert.strictEqual(clipPool({ SHOUTOUT_CLIPS: 'newest' }), 'newest');
  assert.strictEqual(clipPool({ SHOUTOUT_CLIPS: 'weird' }), 'newest');
});
