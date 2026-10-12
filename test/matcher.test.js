const test = require('node:test');
const assert = require('node:assert');
const { stubModule, song } = require('./helpers');

let songs = [
  song('シャルル', 'バルーン', '日語', '0'),
  song('ロキ', 'みきとP', '日語', '-2'),
  song('彩虹金剛', 'someone'),
  song('Lemon', '米津玄師', '日語'),
  song('Lemon', 'Other Artist', '日語'),
];
stubModule('sheets.js', { getSongs: () => songs });
const { matchSong } = require('../server/matcher');

test('an exact title is accepted with full confidence', () => {
  const r = matchSong('シャルル');
  assert.strictEqual(r.confident, true);
  assert.strictEqual(r.confidence, 100);
  assert.strictEqual(r.song.key, '0');
});

test('exact matching ignores case and surrounding spaces', () => {
  songs = [song('Ghost Rule', 'DECO*27')];
  assert.strictEqual(matchSong('  ghost rule ').confident, true);
});

test('the same title by two artists goes to the broadcaster to pick', () => {
  songs = [song('Lemon', '米津玄師'), song('Lemon', 'Other Artist')];
  const r = matchSong('Lemon');
  assert.strictEqual(r.confident, false);
  assert.strictEqual(r.candidates.length, 2);
});

test('a short prefix cannot auto-accept a much longer title', () => {
  songs = [song('彩虹金剛', 'someone'), song('シャルル', 'バルーン')];
  const r = matchSong('彩虹');
  assert.strictEqual(r.confident, false);
});

test('an empty song list matches nothing', () => {
  songs = [];
  assert.strictEqual(matchSong('シャルル').matched, false);
});
