const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const childProcess = require('child_process');
const { stubModule } = require('./helpers');

// Everything stays in a temp folder: the finder's state file and a fake Leihu install.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'link-finder-test-'));
fs.mkdirSync(path.join(tmp, 'python'));
fs.writeFileSync(path.join(tmp, 'python', 'python.exe'), '');
Object.assign(process.env, {
  LINK_SEARCH_STATE: path.join(tmp, 'link-search.json'),
  GOOGLE_SHEET_ID: 'sheet', SHEET_SONG_COLUMN: 'title', SHEET_ARTIST_COLUMN: 'artist',
});

// Fake Google Sheets: tabs edited in place by the tests. A tab's grid is exactly as
// wide as its header row, so adding a column needs the grid to grow first.
let sheet;
const writes = [];
const grows = [];
const appends = [];
let canWrite = true;
let protectedRange = false;
const tabOf = range => range.match(/^'(.*)'!/)[1].replace(/''/g, "'");
const google = {
  auth: { GoogleAuth: class { async getClient() { return {}; } } },
  sheets: () => ({ spreadsheets: {
    get: async () => ({ data: { sheets: Object.keys(sheet).map((title, i) => ({
      properties: { title, sheetId: 100 + i, gridProperties: { columnCount: sheet[title][0].length } },
    })) } }),
    batchUpdate: async ({ requestBody }) => { grows.push(...requestBody.requests); return {}; },
    values: {
      batchGet: async ({ ranges }) => ({ data: { valueRanges: ranges.map(r => ({ values: sheet[tabOf(r)] })) } }),
      get: async ({ range }) => ({ data: { values: range === 'A1' ? [['title']] : sheet[tabOf(range)] } }),
      append: async ({ range, requestBody }) => {
        appends.push({ range, values: requestBody.values });
        sheet[tabOf(range)].push(...requestBody.values);
        return {};
      },
      update: async () => {
        if (!canWrite) { const e = new Error('The caller does not have permission'); e.code = 403; throw e; }
        return {};
      },
      batchUpdate: async ({ requestBody }) => {
        if (protectedRange) throw new Error('You are trying to edit a protected cell or object.');
        writes.push(...requestBody.data);
        return {};
      },
    },
  } }),
};
const gPath = require.resolve('googleapis');
require.cache[gPath] = { id: gPath, filename: gPath, loaded: true, exports: { google } };

const aPath = require.resolve('axios');
require.cache[aPath] = { id: aPath, filename: aPath, loaded: true, exports: {
  get: async url => { if (url.endsWith('/api/status')) return { data: { root: tmp } }; throw new Error('offline'); },
  post: async () => ({ data: {} }),
} };
stubModule('sheets.js', { getSongs: () => [] });
stubModule('queue.js', { getState: () => ({ nowPlaying: null, queue: [] }) });

// Fake tools/find-videos.py: answers each song it is sent with `results[title]`.
let sent = [];
const results = {};
const spawnMock = test.mock.method(childProcess, 'spawn', () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stderr = new EventEmitter();
  let input = '';
  child.stdin = {
    write: s => { input += s; },
    end: () => setImmediate(() => {
      for (const line of input.trim().split('\n')) {
        const song = JSON.parse(line);
        sent.push(song.title);
        child.stdout.emit('data', JSON.stringify({ key: song.key, ...results[song.title] }) + '\n');
      }
      child.emit('close', 0);
    }),
  };
  child.kill = () => child.emit('close', 0);
  setImmediate(() => child.stdout.emit('data', '{"ready": true}\n'));
  return child;
});

console.log = console.error = () => {};
const F = require('../server/link-finder');

// A: clean "- Topic" upload of the right length → confident. C: only a fan upload → needs a look.
const raw = (t, channel) => ({
  title_n: t, artist_n: 'x',
  lyrics: [{ source: 'NetEase', track: t, artist: 'x', duration: 200, synced: true, track_n: t, artist_n: 'x' }],
  videos: [{ id: `${t}`.repeat(11).slice(0, 11), duration: 201, title: t, channel, views: 10, title_n: t, channel_n: channel.toLowerCase().replace(/[^a-z0-9]/g, '') }],
  errors: [],
});
results.a = raw('a', 'x - Topic');
results.c = raw('c', 'fan');
results.e = raw('e', 'x - Topic');
results.f = raw('f', 'fan');
const waitForJob = async () => { while (F.getJob().running) await new Promise(r => setImmediate(r)); };

test('only songs with an empty link cell are searched, and a restart resumes', async () => {
  sheet = { '國語': [['title', 'artist', 'YTLink'], ['a', 'x', ''], ['b', 'x', 'https://youtu.be/bbbbbbbbbbb'], ['c', 'x', '']] };
  await F.start({ limit: 1 });
  await waitForJob();
  assert.deepStrictEqual(sent, ['a']);
  sent = [];
  await F.start();
  await waitForJob();
  assert.deepStrictEqual(sent, ['c']);   // 'a' was already searched, 'b' has a link
  const view = F.getView();
  assert.deepStrictEqual(view.songs.map(s => [s.title, s.status]), [['a', 'confident'], ['c', 'review']]);
});

test('"accept all confident" accepts only the confident picks', () => {
  assert.strictEqual(F.acceptConfident(), 1);
  const a = F.getView().songs.find(s => s.title === 'a');
  assert.strictEqual(a.decision, 'accepted');
  assert.strictEqual(a.videoId, 'aaaaaaaaaaa');
});

test('Editor access is unknown until checked, and the result is kept for this sheet', async () => {
  assert.strictEqual(F.getView().access, null);
  canWrite = false;
  assert.strictEqual((await F.checkAccess()).canEdit, false);
  assert.match(F.getView().access.error, /Editor/);
  canWrite = true;
  assert.strictEqual((await F.checkAccess()).canEdit, true);
  process.env.GOOGLE_SHEET_ID = 'another-sheet';
  assert.strictEqual(F.getView().access, null);   // a different sheet needs its own check
  process.env.GOOGLE_SHEET_ID = 'sheet';
  assert.strictEqual(F.getView().access.canEdit, true);
});

test('saving without Editor access explains how to fix it and writes nothing', async () => {
  canWrite = false;   // access was taken away after the check
  await assert.rejects(F.save(), /Editor/);
  assert.strictEqual(writes.length, 0);
  assert.strictEqual(F.getView().access.canEdit, false);
  canWrite = true;
});

test('a protected range gets a readable error, and nothing counts as written', async () => {
  protectedRange = true;
  await assert.rejects(F.save(), /protected.*Protect sheets and ranges/);
  protectedRange = false;
  assert.strictEqual(F.getView().songs.find(s => s.title === 'a').decision, 'accepted');
});

test('saving writes only into empty cells, at the row where the song is now', async () => {
  const c = F.getView().songs.find(s => s.title === 'c');
  F.decide(c.key, 'accepted', 'https://www.youtube.com/watch?v=ccccccccccc&t=5');
  // Since the search: a row was inserted above "a", and the streamer filled "c" by hand
  sheet['國語'].splice(1, 0, ['new song', 'x', '']);
  sheet['國語'][4][2] = 'https://youtu.be/handfilled1';

  const r = await F.save();
  assert.deepStrictEqual(r, { written: 1, skipped: 1, createdIn: [] });
  assert.deepStrictEqual(writes, [{ range: "'國語'!C3", values: [['https://www.youtube.com/watch?v=aaaaaaaaaaa']] }]);
  assert.deepStrictEqual(F.getView().songs, []);   // both done: one written, one left as the streamer filled it
  assert.strictEqual(F.getView().filled, 1);
});

test('a skipped filled cell is written on a later save once the streamer clears it', async () => {
  writes.length = 0;
  let r = await F.save();   // still filled: left alone again
  assert.deepStrictEqual(r, { written: 0, skipped: 1, createdIn: [] });
  assert.deepStrictEqual(writes, []);

  sheet['國語'][4][2] = '';
  r = await F.save();
  assert.deepStrictEqual(r, { written: 1, skipped: 0, createdIn: [] });
  assert.deepStrictEqual(writes, [{ range: "'國語'!C5", values: [['https://www.youtube.com/watch?v=ccccccccccc']] }]);
  assert.strictEqual(F.getView().filled, 0);
});

test('a saved link that was later cleared from the sheet comes back for review', async () => {
  sheet['國語'][2][2] = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';   // what the saves wrote
  sheet['國語'][4][2] = 'https://www.youtube.com/watch?v=ccccccccccc';
  sheet['國語'][2][2] = '';   // then the streamer cleared "a"
  sent = [];
  await F.start();
  await waitForJob();
  assert.ok(!sent.includes('a'), 'its earlier search results are reused');
  const a = F.getView().songs.find(s => s.title === 'a');
  assert.ok(a, '"a" is listed again');
  assert.strictEqual(a.decision, null);
  assert.strictEqual(a.status, 'confident');
  assert.strictEqual(a.noteCode, 'noteLinkCleared');
  assert.ok(!F.getView().songs.some(s => s.title === 'c'), 'links still in the sheet stay done');
});

test('pasted links are accepted in any form, other text is refused', () => {
  sheet = { '國語': [['title', 'artist', 'YTLink'], ['d', 'x', '']] };
  F._setState({ songs: { k: { tab: '國語', row: 2, title: 'd', artist: 'x', raw: raw('d', 'fan'), decision: null, written: false } } });
  F.decide('k', 'accepted', 'youtu.be/dddddddddd1?si=x');
  assert.strictEqual(F.getView().songs[0].videoId, 'dddddddddd1');
  assert.throws(() => F.decide('k', 'accepted', 'not a link'), /not a YouTube/);
});

test('a tab without the YTLink column gets one when its first links are saved', async () => {
  sheet = { '日語': [['title', 'artist'], ['e', 'x'], ['f', 'x']] };
  F._setState({ songs: {} });
  sent = [];
  await F.start();
  await waitForJob();
  assert.deepStrictEqual(sent, ['e', 'f']);   // searched even though the tab has no link column yet

  const e = F.getView().songs.find(s => s.title === 'e');
  F.decide(e.key, 'accepted', 'eeeeeeeeeee');
  writes.length = 0;
  const r = await F.save();
  assert.deepStrictEqual(r, { written: 1, skipped: 0, createdIn: ['日語'] });
  assert.deepStrictEqual(grows, [{ appendDimension: { sheetId: 100, dimension: 'COLUMNS', length: 1 } }]);
  assert.deepStrictEqual(writes, [
    { range: "'日語'!C1", values: [['YTLink']] },
    { range: "'日語'!C2", values: [['https://www.youtube.com/watch?v=eeeeeeeeeee']] },
  ]);
});

// ── Songs not on the sheet ──

const lyricOf = (source, track, artist, duration, track_n, artist_n) =>
  ({ source, track, artist, duration, synced: true, track_n, artist_n });
results['晴天 周董'] = {
  title_n: '晴天周董', artist_n: '',
  lyrics: [
    lyricOf('網易雲音樂', '晴天', '周杰伦', 269, '晴天', '周杰伦'),
    lyricOf('LRCLIB', '晴天', '周杰倫', 269, '晴天', '周杰伦'),
    lyricOf('網易雲音樂', '晴天', '某翻唱', 250, '晴天', '某翻唱'),
    lyricOf('網易雲音樂', '晴天娃娃', '別人', 200, '晴天娃娃', '别人'),   // neither contains the other: ignored
  ],
  videos: [
    { id: 'jaychou0001', title: '周杰倫 Jay Chou【晴天 Sunny Day】Official MV', channel: '周杰倫 Jay Chou', duration: 270, views: 5e8,
      title_n: '周杰伦jaychou晴天sunnydayofficialmv', channel_n: '周杰伦jaychou' },
    { id: 'cover000001', title: '晴天 cover', channel: 'fan', duration: 250, views: 10, title_n: '晴天cover', channel_n: 'fan' },
  ],
  errors: [],
};
// The second search, by the identified title + artist, finds the "- Topic" upload
results['晴天'] = {
  title_n: '晴天', artist_n: '周杰伦', lyrics: [], errors: [],
  videos: [{ id: 'jaytopic001', title: '晴天', channel: '周杰倫 - Topic', duration: 269, views: 1e6, title_n: '晴天', channel_n: '周杰伦topic' }],
};
results['zzz'] = {
  title_n: 'zzz', artist_n: '', lyrics: [], errors: [],
  videos: [{ id: 'zzzzzzzzzzz', title: 'something', channel: 'c', duration: 200, views: 1, title_n: 'something', channel_n: 'c' }],
};

test('an off-list request is identified from the lyric sites, and its videos scored', async () => {
  sent = [];
  const r = await F.identify(' 晴天 周董 ');
  // The viewer didn't type the artist's name: searched again by title + artist
  assert.deepStrictEqual(sent, ['晴天 周董', '晴天']);
  // The original singer's title wins over a cover's; LRCLIB's 繁體 spelling is shown
  assert.strictEqual(r.title, '晴天');
  assert.strictEqual(r.artist, '周杰倫');
  assert.strictEqual(r.status, 'confident');
  assert.deepStrictEqual(r.candidates.map(c => c.id).slice(0, 2), ['jaytopic001', 'jaychou0001']);
  assert.strictEqual(r.tab, '');

  results['晴天 周杰倫'] = { ...results['晴天 周董'], title_n: '晴天周杰伦' };
  sent = [];
  const typed = await F.identify('晴天 周杰倫');   // artist typed: one search is enough
  assert.deepStrictEqual(sent, ['晴天 周杰倫']);
  assert.strictEqual(typed.artist, '周杰倫');

  const none = await F.identify('zzz');   // no lyric result fits: the text itself, nothing confident
  assert.deepStrictEqual([none.title, none.artist, none.status], ['zzz', '', 'none']);
  assert.strictEqual(none.candidates[0].id, 'zzzzzzzzzzz');
});

test('kana means a Japanese song; Chinese characters alone stay automatic', () => {
  assert.strictEqual(F.guessTab('メリッサ Porno Graffitti'), '日語');
  assert.strictEqual(F.guessTab('晴天 周杰倫'), '');
});

test('an off-list song is added to the practice tab with its link, once', async () => {
  sheet = { '國語': [['title', 'artist', 'YTLink'], ['a', 'x', '']], '待練勿點': [['title', 'artist']] };
  writes.length = grows.length = appends.length = 0;
  canWrite = true;
  let r = await F.addToSheet({ title: '晴天', artist: '周杰倫', videoId: 'jaychou0001' });
  assert.deepStrictEqual(r, { tab: '待練勿點', added: true });
  assert.deepStrictEqual(grows, [{ appendDimension: { sheetId: 101, dimension: 'COLUMNS', length: 1 } }]);
  assert.deepStrictEqual(writes, [{ range: "'待練勿點'!C1", values: [['YTLink']] }]);
  assert.deepStrictEqual(appends, [{ range: "'待練勿點'!A1", values: [['晴天', '周杰倫', 'https://www.youtube.com/watch?v=jaychou0001']] }]);

  r = await F.addToSheet({ title: '晴天', artist: '周杰倫', videoId: 'jaychou0001' });
  assert.deepStrictEqual(r, { tab: '待練勿點', added: false });
  assert.strictEqual(appends.length, 1);
});

test('adding to the sheet explains a missing practice tab and needs Editor access', async () => {
  const saved = process.env.EXCLUDED_TABS;
  try {
    process.env.EXCLUDED_TABS = '草稿';
    await assert.rejects(F.addToSheet({ title: 't', artist: '' }), e => e.messageCode === 'practiceTabMissing');
    process.env.EXCLUDED_TABS = '';
    await assert.rejects(F.addToSheet({ title: 't', artist: '' }), e => e.messageCode === 'noPracticeTab');
  } finally {
    if (saved == null) delete process.env.EXCLUDED_TABS; else process.env.EXCLUDED_TABS = saved;
  }
  canWrite = false;
  await assert.rejects(F.addToSheet({ title: 't', artist: '' }), e => e.messageCode === 'noEditor');
  canWrite = true;
});

test("Leihu's Python: packaged app first, then a source install's .venv; LEIHU_PYTHON replaces the search", async () => {
  const packaged = path.join(tmp, 'python', 'python.exe');
  const venv = path.join(tmp, '.venv', 'Scripts', 'python.exe');
  const saved = process.env.LEIHU_PYTHON;
  delete process.env.LEIHU_PYTHON;
  fs.mkdirSync(path.dirname(venv), { recursive: true });
  fs.writeFileSync(venv, '');
  try {
    assert.deepStrictEqual(await F.leihuPython(), { root: tmp, python: packaged });
    fs.renameSync(path.join(tmp, 'python'), path.join(tmp, 'python-off'));
    assert.deepStrictEqual(await F.leihuPython(), { root: tmp, python: venv });
    fs.rmSync(path.join(tmp, '.venv'), { recursive: true });
    await assert.rejects(F.leihuPython(), e => e.messageCode === 'leihuPythonMissing');

    process.env.LEIHU_PYTHON = path.join(tmp, 'python-off', 'python.exe');
    assert.deepStrictEqual(await F.leihuPython(), { root: tmp, python: process.env.LEIHU_PYTHON });
    process.env.LEIHU_PYTHON = path.join(tmp, 'no-such', 'python.exe');
    fs.renameSync(path.join(tmp, 'python-off'), path.join(tmp, 'python'));
    // a wrong LEIHU_PYTHON is reported, even though the packaged Python exists
    await assert.rejects(F.leihuPython(), e => e.messageCode === 'leihuPythonEnvMissing' && e.messageParams.path === process.env.LEIHU_PYTHON);
  } finally {
    if (saved == null) delete process.env.LEIHU_PYTHON; else process.env.LEIHU_PYTHON = saved;
    if (!fs.existsSync(path.join(tmp, 'python'))) fs.renameSync(path.join(tmp, 'python-off'), path.join(tmp, 'python'));
    fs.rmSync(path.join(tmp, '.venv'), { recursive: true, force: true });
  }
});

test.after(() => {
  spawnMock.mock.restore();
  fs.rmSync(tmp, { recursive: true, force: true });
});
