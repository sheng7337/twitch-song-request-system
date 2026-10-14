const test = require('node:test');
const assert = require('node:assert');
const { stubModule } = require('./helpers');

// Fake Leihu Singsing API: GET returns `leihu`, POSTs are recorded.
const leihu = { up: true, songs: [], jobs: [], remote: false };
const posts = [];
const axiosStub = {
  get: async (url) => {
    if (!leihu.up) throw new Error('connect ECONNREFUSED');
    if (url.endsWith('/api/songs')) return { data: leihu.songs };
    if (url.endsWith('/api/status')) return { data: { jobs: leihu.jobs, ...(leihu.remote ? { remote: { seq: 0 } } : {}) } };
    throw new Error('unexpected GET ' + url);
  },
  post: async (url, body) => { posts.push({ url, body }); return { data: {} }; },
};
const axiosPath = require.resolve('axios');
require.cache[axiosPath] = { id: axiosPath, filename: axiosPath, loaded: true, exports: axiosStub };

const sheet = [
  { title: '很愛很愛你', artist: '劉若英', key: '-2', url: 'https://youtu.be/3znMCsScCxo?t=30' },
  { title: '空色デイズ', artist: '中川翔子', key: '', url: 'https://www.youtube.com/watch?v=vVGa8I0Atcg&list=PL1' },
  { title: 'No Link', artist: 'x', key: '', url: '' },
];
const queueState = { nowPlaying: null, queue: [] };
stubModule('sheets.js', { getSongs: () => sheet });
stubModule('queue.js', { getState: () => queueState });
console.log = console.error = () => {};
const L = require('../server/leihu');

const done = { import: true, separate: true, pitch: true, lyrics: true };
const entry = (s) => ({ title: s.title, artist: s.artist, key: s.key });
const statusOf = (s) => L.getStatus().songs[L.songKey(s.title, s.artist)];

test('video IDs are read from every common link form', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=3znMCsScCxo',
    'https://youtu.be/3znMCsScCxo?si=abc',
    'youtube.com/watch?v=3znMCsScCxo&t=30s',
    'https://music.youtube.com/watch?v=3znMCsScCxo',
    'https://www.youtube.com/shorts/3znMCsScCxo',
  ]) assert.strictEqual(L.videoId(url), '3znMCsScCxo', url);
  assert.strictEqual(L.videoId('https://example.com/watch?v=3znMCsScCxo'), null);
  assert.strictEqual(L.videoId(''), null);
});

test('only whole-semitone keys within ±6 are sent to Leihu', () => {
  assert.strictEqual(L.transpose('-2'), -2);
  assert.strictEqual(L.transpose('6'), 6);
  assert.strictEqual(L.transpose('7'), null);
  assert.strictEqual(L.transpose('1.5'), null);
  assert.strictEqual(L.transpose(''), null);
});

test('songs match by video ID and report their Leihu state', async () => {
  leihu.songs = [
    { id: 'aaaaaaaaaa', title: 'YouTube title 1', source_url: 'https://www.youtube.com/watch?v=3znMCsScCxo', steps: done },
    { id: 'bbbbbbbbbb', title: 'YouTube title 2', source_url: 'https://www.youtube.com/watch?v=vVGa8I0Atcg', steps: { ...done, lyrics: false } },
  ];
  leihu.jobs = [{ song: 'bbbbbbbbbb', status: 'running' }];
  queueState.queue = sheet.map(entry);
  await L.refresh();

  assert.deepStrictEqual(statusOf(sheet[0]), { state: 'ready', id: 'aaaaaaaaaa', leihuTitle: 'YouTube title 1' });
  assert.strictEqual(statusOf(sheet[1]).state, 'processing');
  assert.strictEqual(statusOf(sheet[2]).state, 'unlinked');

  leihu.jobs = [];
  await L.refresh();
  assert.strictEqual(statusOf(sheet[1]).state, 'failed');
});

test('a missing song is imported once, then its key is rendered once', async () => {
  leihu.songs = [];
  leihu.jobs = [];
  await L.refresh();
  assert.strictEqual(statusOf(sheet[0]).state, 'missing');

  posts.length = 0;
  await L.prepare(entry(sheet[0]));
  await L.prepare(entry(sheet[0]));
  assert.deepStrictEqual(posts, [{ url: 'http://127.0.0.1:8765/api/youtube', body: { url: 'https://www.youtube.com/watch?v=3znMCsScCxo' } }]);
  assert.strictEqual(statusOf(sheet[0]).state, 'processing');

  leihu.songs = [{ id: 'cccccccccc', title: 't', source_url: 'https://www.youtube.com/watch?v=3znMCsScCxo', steps: done }];
  await L.refresh();
  posts.length = 0;
  await L.prepare(entry(sheet[0]));
  await L.prepare(entry(sheet[0]));
  assert.deepStrictEqual(posts, [{ url: 'http://127.0.0.1:8765/api/songs/cccccccccc/variant', body: { key: -2, speed: 1 } }]);
});

test('everything shows offline while Leihu is not running', async () => {
  leihu.up = false;
  await L.refresh();
  const st = L.getStatus();
  assert.strictEqual(st.online, false);
  assert.ok(Object.values(st.songs).every(s => s.state === 'offline'));
  leihu.up = true;
});

test('Sing opens a ready song at its sheet key, only when Leihu supports it', async () => {
  leihu.songs = [{ id: 'aaaaaaaaaa', title: 't', source_url: 'https://www.youtube.com/watch?v=3znMCsScCxo', steps: done }];
  leihu.jobs = [];
  leihu.remote = false;
  await L.refresh();
  assert.strictEqual(L.getStatus().canOpen, false);
  await assert.rejects(L.open(entry(sheet[0])), /does not support/);

  leihu.remote = true;
  await L.refresh();
  assert.strictEqual(L.getStatus().canOpen, true);
  posts.length = 0;
  assert.strictEqual(await L.open(entry(sheet[0])), -2);
  assert.strictEqual(await L.open({ ...entry(sheet[0]), key: '1.5' }), 0);
  assert.deepStrictEqual(posts.map(p => p.body), [{ id: 'aaaaaaaaaa', key: -2 }, { id: 'aaaaaaaaaa', key: 0 }]);
  assert.ok(posts.every(p => p.url === 'http://127.0.0.1:8765/api/remote/open'));
  await assert.rejects(L.open(entry(sheet[2])), /not ready/);
});
