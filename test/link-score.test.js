const test = require('node:test');
const assert = require('node:assert');
const { scoreSong, referenceDuration, lengthTier } = require('../server/link-score');

// Shaped like tools/find-videos.py output (_n fields already normalized).
const lyric = (duration, track_n = 'woshang', artist_n = 'aa', source = 'NetEase') =>
  ({ source, track: track_n, artist: artist_n, duration, synced: true, track_n, artist_n });
const video = (id, duration, title, channel = 'someone', extra = {}) =>
  ({ id, duration, title, channel, views: 1000, title_n: title.toLowerCase().replace(/[^a-z0-9]/g, ''), channel_n: channel.toLowerCase().replace(/[^a-z0-9]/g, ''), ...extra });
const song = (lyrics, videos) => ({ title_n: 'woshang', artist_n: 'aa', lyrics, videos });

test('the reference length follows the artist-matching lyric results, not other versions', () => {
  const raw = song([
    lyric(284, 'woshang', 'aa'), lyric(285, 'woshang', 'aa'),
    lyric(292, 'woshang', 'otherartist'),        // original singer's version
    lyric(447, 'woshangdj', 'aa'),               // DJ version: different title
    lyric(250, 'anothersong', 'aa'),             // another song by the artist
  ], []);
  assert.strictEqual(referenceDuration(raw), 284);
  assert.strictEqual(referenceDuration(song([lyric(200, 'other')], [])), null);
});

test('length tiers follow what Leihu can use', () => {
  assert.strictEqual(lengthTier(287, 284), 'exact');      // ≤3 s: timed lyrics used as-is
  assert.strictEqual(lengthTier(300, 284), 'workable');   // Leihu re-times
  assert.strictEqual(lengthTier(159, 266), 'off');        // short edit
  assert.strictEqual(lengthTier(300, null), null);
});

test('an exact-length "- Topic" upload is a confident pick', () => {
  const r = scoreSong(song([lyric(284)], [
    video('fanupload01', 284, 'aa woshang lyrics', 'fan'),
    video('topicupld01', 285, 'woshang', 'aa - Topic'),
  ]));
  assert.strictEqual(r.status, 'confident');
  assert.strictEqual(r.candidates[0].id, 'topicupld01');
});

test('live, cover, instrumental and TV versions never win over the recording', () => {
  const r = scoreSong(song([lyric(284)], [
    video('liveversion', 284, 'aa woshang live 2020', 'aa official'),
    video('coverversio', 284, 'woshang cover', 'aa official'),
    video('instrumenta', 284, 'woshang instrumental', 'aa official'),
    video('fanlyricvid', 285, 'aa woshang lyrics', 'fan'),
  ]));
  assert.strictEqual(r.candidates[0].id, 'fanlyricvid');
  assert.strictEqual(r.status, 'review');   // a fan upload is plausible, but needs a look
});

test('videos of a different length or title are not offered', () => {
  const r = scoreSong(song([lyric(266)], [
    video('shortmvedit', 159, 'aa woshang official music video', 'aa'),
    video('othersong01', 266, 'aa anothersong', 'aa'),
  ]));
  assert.strictEqual(r.status, 'none');
});

test('the artist spelling from the lyric sites counts as the artist', () => {
  // Sheet says "aa"; the lyric sites and the channel spell it "bb" for this recording
  const raw = { title_n: 'woshang', artist_n: 'aa', lyrics: [lyric(258, 'woshang', 'bb')], videos: [
    video('officialbb1', 258, 'bb woshang music video', 'bb'),
  ] };
  const r = scoreSong(raw);
  assert.ok(r.candidates[0].official && r.candidates[0].artistMatch);
  assert.strictEqual(r.status, 'confident');
});

test('without online lyrics nothing is confident', () => {
  const r = scoreSong(song([], [video('topicupld01', 285, 'woshang', 'aa - Topic')]));
  assert.strictEqual(r.refDuration, null);
  assert.strictEqual(r.status, 'review');
});

test("another language's version is never offered, unless it is the sheet tab's language", () => {
  const raw = song([lyric(300)], [video('jpversion01', 300, 'woshang 日文版', 'fan'), video('original001', 300, 'woshang', 'fan')]);
  assert.deepStrictEqual(scoreSong(raw, { tab: '國語' }).candidates.map(c => c.id), ['original001']);
  assert.ok(scoreSong(raw, { tab: '日語' }).candidates.some(c => c.id === 'jpversion01'));
});

test('an exact-length fan upload is confident only with very high views', () => {
  const fan = views => song([lyric(284)], [video('fanlyricvid', 285, 'aa woshang lyrics', 'fan', { views })]);
  assert.strictEqual(scoreSong(fan(999999), { fanViews: 1000000 }).status, 'review');
  assert.strictEqual(scoreSong(fan(1000000), { fanViews: 1000000 }).status, 'confident');
  // still not when the artist isn't named, or it's a live version
  const noArtist = song([lyric(284)], [video('fanlyricvid', 285, 'woshang lyrics', 'fan', { views: 5e6 })]);
  assert.strictEqual(scoreSong(noArtist, { fanViews: 1000000 }).status, 'review');
  const live = song([lyric(284)], [video('fanliveclip', 285, 'aa woshang live', 'fan', { views: 5e6 })]);
  assert.notStrictEqual(scoreSong(live, { fanViews: 1000000 }).status, 'confident');
  // 0 turns the rule off
  assert.strictEqual(scoreSong(fan(5e6), { fanViews: 0 }).status, 'review');
});

test('a romanized title of the right length is offered, but never confident', () => {
  const raw = { title_n: '四照花', artist_n: '一青窈', lyrics: [lyric(332, '四照花', '一青窈')], videos: [
    video('romanized01', 333, 'Shishouka (Chinese Version)', '一青窈', { title_n: 'shishoukachineseversion', channel_n: '一青窈', views: 11233 }),
    video('japanese001', 355, '四照花（日文版）', 'fan', { title_n: '四照花日文版' }),
  ] };
  const r = scoreSong(raw, { tab: '國語', title: '四照花' });
  assert.deepStrictEqual(r.candidates.map(c => c.id), ['romanized01']);
  assert.ok(r.candidates[0].reasons.includes('romanized title'));
  assert.strictEqual(r.status, 'review');
  assert.strictEqual(scoreSong(raw, { tab: '國語' }).status, 'none');   // without the sheet title: no match
});
