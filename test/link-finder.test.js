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
      get: async () => ({ data: { values: [['title']] } }),
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

test.after(() => {
  spawnMock.mock.restore();
  fs.rmSync(tmp, { recursive: true, force: true });
});
