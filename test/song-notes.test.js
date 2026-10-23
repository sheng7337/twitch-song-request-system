const test = require('node:test');
const assert = require('node:assert');
const { stubModule } = require('./helpers');

stubModule('sheets.js', { getSongs: () => [] });
stubModule('history.js', { getHistory: () => ({}), getLastRequestedAt: () => null });
console.log = () => {};
const notes = require('../server/song-notes');

const DAY = 86400000;
const sent = [];
notes.init(m => sent.push(m));
const NOW = Date.parse('2026-10-24T12:00:00Z');
const rec = (at, ...songs) => ({ kind: 'chat', at, songs: songs.map(([title, lastAt]) => ({ title, artist: 'a', lastAt })) });

test('every song named in chat gets a note with when it was last sung; within the cooldown it is marked recent', () => {
  process.env.RANDOM_COOLDOWN_DAYS = '7';
  sent.length = 0;
  const r1 = rec(NOW, ['晴天', NOW - 3 * DAY - 1000], ['老歌', NOW - 30 * DAY], ['新歌', null]);
  notes.check(r1);
  assert.deepStrictEqual(r1.songs.map(s => [s.title, !!s.recent, !!s.onStream]), [['晴天', true, true], ['老歌', false, true], ['新歌', false, true]]);
  assert.deepStrictEqual(sent, [
    { type: 'song-note', title: '晴天', artist: 'a', days: 3, recent: true },
    { type: 'song-note', title: '老歌', artist: 'a', days: 30, recent: false },
    { type: 'song-note', title: '新歌', artist: 'a', days: null, recent: false },
  ]);
});

test('a song shows once per 10 minutes; without the history there is no note', () => {
  sent.length = 0;
  // Named again 5 minutes later: still marked, but the overlay isn't covered again
  const r2 = rec(NOW + 5 * 60000, ['晴天', NOW - 3 * DAY]);
  notes.check(r2);
  assert.deepStrictEqual([r2.songs[0].recent, r2.songs[0].onStream], [true, undefined]);
  assert.strictEqual(sent.length, 0);
  // After 10 minutes it shows again
  notes.check(rec(NOW + notes.PER_SONG_MS + 1000, ['晴天', NOW - 3 * DAY]));
  assert.strictEqual(sent.length, 1);

  const noHistory = { kind: 'chat', at: NOW, songs: [{ title: '別首', artist: 'a' }] };
  notes.check(noHistory);
  notes.check({ kind: 'chat', at: NOW });
  assert.strictEqual(noHistory.songs[0].onStream, undefined);
  assert.strictEqual(sent.length, 1);
});

test('SONG_NOTES=0 stops the overlay notes; songs are still marked recent', () => {
  process.env.RANDOM_COOLDOWN_DAYS = '7';
  process.env.SONG_NOTES = '0';
  sent.length = 0;
  const r = rec(NOW + 30 * DAY, ['關掉時', NOW + 29 * DAY]);
  notes.check(r);
  assert.deepStrictEqual([r.songs[0].recent, r.songs[0].onStream], [true, undefined]);
  assert.deepStrictEqual(sent, []);
  assert.strictEqual(notes.enabled(), false);
  delete process.env.SONG_NOTES;
  assert.strictEqual(notes.enabled(), true, 'on when unset');
});

test('cooldown 0: nothing is recent, notes still say when songs were sung', () => {
  process.env.RANDOM_COOLDOWN_DAYS = '0';
  sent.length = 0;
  const r = rec(NOW + DAY, ['另一首', NOW]);
  notes.check(r);
  assert.strictEqual(r.songs[0].recent, undefined);
  assert.deepStrictEqual(sent, [{ type: 'song-note', title: '另一首', artist: 'a', days: 1, recent: false }]);
  delete process.env.RANDOM_COOLDOWN_DAYS;
});
