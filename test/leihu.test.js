const test = require('node:test');
const assert = require('node:assert');
const { stubModule } = require('./helpers');

// Fake Leihu Singsing API: GET returns `leihu`, POSTs are recorded.
const leihu = { up: true, songs: [], jobs: [], remote: false, candidates: [], search: [] };
const posts = [];
const searches = [];
const axiosStub = {
  get: async (url, opts = {}) => {
    if (!leihu.up) throw new Error('connect ECONNREFUSED');
    if (url.endsWith('/api/songs')) return { data: leihu.songs };
    if (url.endsWith('/api/status')) return { data: { jobs: leihu.jobs, ...(leihu.remote ? { remote: { seq: 0 } } : {}) } };
    if (url.endsWith('/lyrics/candidates')) return { data: { results: leihu.candidates } };
    if (url.endsWith('/lyrics/search')) { searches.push(opts.params.q); return { data: { results: leihu.search } }; }
    throw new Error('unexpected GET ' + url);
  },
  post: async (url, body) => { posts.push({ url, body }); return { data: url.endsWith('/api/youtube') ? { id: 'newsong001' } : {} }; },
  patch: async (url, body) => { posts.push({ url, body, method: 'PATCH' }); return { data: {} }; },
};
const axiosPath = require.resolve('axios');
require.cache[axiosPath] = { id: axiosPath, filename: axiosPath, loaded: true, exports: axiosStub };

const sheet = [
  { title: '很愛很愛你', artist: '劉若英', key: '-2', url: 'https://youtu.be/3znMCsScCxo?t=30', tab: '國語' },
  { title: '空色デイズ', artist: '中川翔子', key: '', url: 'https://www.youtube.com/watch?v=vVGa8I0Atcg&list=PL1', tab: '日語' },
  { title: 'No Link', artist: 'x', key: '', url: '', tab: '台語' },
];
const queueState = { nowPlaying: null, queue: [] };
stubModule('sheets.js', { getSongs: () => sheet });
stubModule('queue.js', { getState: () => queueState });
console.log = console.error = () => {};
const L = require('../server/leihu');

const done = { import: true, separate: true, pitch: true, lyrics: true };
const LYR = 'la la la';
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
    { id: 'aaaaaaaaaa', title: 'YouTube title 1', source_url: 'https://www.youtube.com/watch?v=3znMCsScCxo', steps: done, lyrics_text: LYR },
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
  assert.deepStrictEqual(posts, [
    { url: 'http://127.0.0.1:8765/api/youtube', body: { url: 'https://www.youtube.com/watch?v=3znMCsScCxo' } },
    { url: 'http://127.0.0.1:8765/api/songs/newsong001', body: { lyrics_language: 'zh' }, method: 'PATCH' },
  ]);
  assert.strictEqual(statusOf(sheet[0]).state, 'processing');

  leihu.songs = [{ id: 'cccccccccc', title: 't', source_url: 'https://www.youtube.com/watch?v=3znMCsScCxo', steps: done, lyrics_text: LYR }];
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
  leihu.songs = [{ id: 'aaaaaaaaaa', title: 't', source_url: 'https://www.youtube.com/watch?v=3znMCsScCxo', steps: done, lyrics_text: LYR }];
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

test('a processed song with blank lyrics shows as no lyrics, but can still be sung', async () => {
  leihu.songs = [{ id: 'aaaaaaaaaa', title: 't', source_url: 'https://www.youtube.com/watch?v=3znMCsScCxo', steps: done, lyrics_text: '' }];
  leihu.jobs = [];
  leihu.remote = true;
  await L.refresh();
  assert.strictEqual(statusOf(sheet[0]).state, 'nolyrics');
  posts.length = 0;
  assert.strictEqual(await L.open(entry(sheet[0])), -2);
});

test('the recognition language comes from the sheet tab; unlisted tabs stay automatic', async () => {
  assert.strictEqual(L.tabLanguage('國語'), 'zh');
  assert.strictEqual(L.tabLanguage('日語'), 'ja');
  assert.strictEqual(L.tabLanguage('台語'), null);
  posts.length = 0;
  await L.importVideo('dQw4w9WgXcQ', '台語');
  assert.deepStrictEqual(posts.map(p => p.url), ['http://127.0.0.1:8765/api/youtube']);
});

test('blank lyrics of a song we imported are filled with a fitting online lyric', async () => {
  const lyric = (track, artist, diff, synced = '[00:01.00]la') => ({ source: '網易雲音樂', track, artist, diff, synced, plain: 'la' });
  const vid = 'Shishouka01';
  leihu.songs = [{ id: 'dddddddddd', title: 'Shishouka (Chinese Version)', source_url: `https://youtu.be/${vid}`, steps: done, lyrics_text: '' }];
  leihu.jobs = [];
  // Leihu searched by the YouTube title: nothing that fits
  leihu.candidates = [lyric('四照花', '一青窈', 25), lyric('Shishouka', '一青窈', 0, '')];
  leihu.search = [lyric('四照花', '別人', 0), lyric('四照花 (Chinese Ver.)', '一青窈', 1), lyric('四照花', '一青窈', 2)];
  await L.importVideo(vid, '國語', { title: '四照花', artist: '一青窈' });
  await L.refresh();

  posts.length = 0;
  await L.fillMissingLyrics();
  await L.fillMissingLyrics();   // once per song
  assert.deepStrictEqual(searches, ['四照花 一青窈']);
  assert.deepStrictEqual(posts, [{
    url: 'http://127.0.0.1:8765/api/songs/dddddddddd/lyrics/apply',
    body: { candidate: lyric('四照花 (Chinese Ver.)', '一青窈', 1) },
  }]);
});

test("lyrics Leihu set, and songs we didn't import, are left alone", async () => {
  leihu.candidates = [{ source: 'LRCLIB', track: '很愛很愛你', artist: '劉若英', diff: 0, synced: '[00:01.00]la', plain: 'la' }];
  leihu.songs = [
    { id: 'eeeeeeeeee', title: 't', source_url: 'https://youtu.be/importedOK1', steps: done, lyrics_text: LYR },
    { id: 'ffffffffff', title: 't', source_url: 'https://youtu.be/notImported', steps: done, lyrics_text: '' },
  ];
  await L.importVideo('importedOK1', '國語', { title: '很愛很愛你', artist: '劉若英' });
  await L.refresh();
  posts.length = 0;
  await L.fillMissingLyrics();
  assert.deepStrictEqual(posts, []);
});

test('recognized lyrics Leihu flagged are replaced by a fitting online lyric, even in other character forms', async () => {
  // The sheet writes 来/實, Leihu's lyric 來/実; Leihu found every title character in the YouTube title
  sheet.push({ title: '春よ、来い', artist: '松任谷由實', key: '0', url: 'https://www.youtube.com/watch?v=qX7pFYH9O04', tab: '日語' });
  const lyric = (similarity, diff = 0) => ({ source: 'LRCLIB', track: '春よ、來い', artist: '松任谷由実', diff, similarity, title_match: 1, synced: '[00:21.66]淡き光立つ', plain: '淡き光立つ' });
  const song = (id, more) => ({ id, title: '松任谷由実 - 春よ、来い', source_url: 'https://www.youtube.com/watch?v=qX7pFYH9O04', steps: done, lyrics_text: LYR, ...more });
  leihu.search = [];
  leihu.candidates = [lyric(0.3), lyric(0.79, 0.1), lyric(0.79, 6.6)];
  leihu.songs = [song('gggggggggg', { lyrics_source: 'whisper', lyrics_pending: true })];
  await L.refresh();
  posts.length = 0;
  await L.fillMissingLyrics();
  assert.deepStrictEqual(posts, [{ url: 'http://127.0.0.1:8765/api/songs/gggggggggg/lyrics/apply', body: { candidate: lyric(0.79, 0.1) } }]);

  // Left alone: lyrics picked in Leihu, recognition kept by the streamer, or words that disagree
  leihu.songs = [
    song('hhhhhhhhhh', { lyrics_source: 'manual', lyrics_pending: false }),
    song('iiiiiiiiii', { lyrics_source: 'whisper', lyrics_pending: false }),
    song('jjjjjjjjjj', { lyrics_source: 'whisper', lyrics_pending: true }),
  ];
  leihu.candidates = [lyric(0.3)];
  await L.refresh();
  posts.length = 0;
  await L.fillMissingLyrics();
  assert.deepStrictEqual(posts, []);
  sheet.pop();
});

test("a failed import shows Leihu's reason, and YouTube's bot check is recognized", async () => {
  queueState.queue = [entry(sheet[0])];
  leihu.songs = [{ id: 'gggggggggg', title: 't', source_url: 'https://www.youtube.com/watch?v=3znMCsScCxo', steps: { import: false } }];
  // Leihu cuts yt-dlp's message to its last characters
  leihu.jobs = [{ song: 'gggggggggg', status: 'error', error: 'YouTube 下載失敗：s://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp  for how to manually pass cookies.' }];
  await L.refresh();
  assert.strictEqual(statusOf(sheet[0]).state, 'failed');
  assert.strictEqual(statusOf(sheet[0]).failure.blocked, true);

  leihu.jobs = [{ song: 'gggggggggg', status: 'error', error: '找不到 ffmpeg，無法轉換 YouTube 音訊' }];
  await L.refresh();
  assert.deepStrictEqual(statusOf(sheet[0]).failure, { reason: '找不到 ffmpeg，無法轉換 YouTube 音訊', blocked: false });
  leihu.jobs = [];
});
