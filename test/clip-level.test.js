const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const level = require('../server/clip-level');

const hasFfmpeg = !spawnSync('ffmpeg', ['-version'], { windowsHide: true }).error;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-level-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

// A 3-second 1 kHz tone at the given volume, as a clip file would come (MPEG-TS or MP4)
function tone(db, ext) {
  const out = path.join(dir, `tone${db}.${ext}`);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=3',
    '-af', `volume=${db}dB`, '-c:a', 'aac', ...(ext === 'ts' ? ['-f', 'mpegts'] : []), out], { windowsHide: true });
  assert.strictEqual(r.status, 0, String(r.stderr));
  return fs.readFileSync(out);
}

test('the talking level: the middle of the short-term loudness, silence left out; the gain to the target', () => {
  const stderr = '[Parsed_ebur128_0 @ 0] t: 0.1 M: -120.7 S: -120.7 I: -70.0 LUFS\n[Parsed_ebur128_0 @ 0] t: 2.9 M: -20.1 S: -20.3 I: -20.0 LUFS\n  Integrated loudness:\n    I:         -23.4 LUFS';
  assert.deepStrictEqual(level.shortTerm(stderr), [-120.7, -20.3], 'the frames, not the summary');
  // quiet talking with one scream: the talking, not the scream, sets the level
  assert.strictEqual(level.talkingLevel([-120, -60, -30, -31, -29, -30, -30, -8, -9]), -30);
  assert.strictEqual(level.talkingLevel([-30, -20]), -25);
  assert.strictEqual(level.talkingLevel([-120, -70]), null, 'all silence');
  assert.strictEqual(level.gainFor(-23.4), 5.4);
  assert.strictEqual(level.gainFor(-8), -10);
  assert.strictEqual(level.gainFor(-45), 12, 'a quiet clip is turned up only so far');
  assert.strictEqual(level.gainFor(-55), null, 'silence: nothing to even out');
  assert.strictEqual(level.gainFor(null), null);
});

test('a clip is measured, the result kept; off: not measured', { skip: !hasFfmpeg && 'no ffmpeg' }, async () => {
  const quiet = tone(-10, 'ts');   // lavfi's sine is at -18 dBFS: about -31 LUFS
  const lufs = await level.measure(quiet, 'ts');
  assert.ok(lufs > -34 && lufs < -28, `about -31 LUFS, got ${lufs}`);
  assert.ok(await level.measure(tone(12, 'mp4'), 'mp4') > lufs + 18, 'an MP4 too, much louder');

  const url = 'https://production.assets.clips.twitchcdn.net/v2/media/abc/video.mp4?sig=1&token=x';
  const first = await level.levelFor(url, quiet, 'ts');
  assert.strictEqual(first.level, 'on');
  assert.ok(first.gainDb > 11 && first.gainDb <= 12, `turned up: ${first.gainDb}`);
  const again = await level.levelFor(url.replace('sig=1', 'sig=2'), Buffer.from('not a clip'), 'ts');
  assert.deepStrictEqual(again, first, 'the same clip file, a new signature: kept, not measured again');

  process.env.CLIP_LEVEL = '0';
  try {
    assert.deepStrictEqual(await level.levelFor('https://x/other.mp4', quiet, 'mp4'), { level: 'off', gainDb: 0 });
  } finally { delete process.env.CLIP_LEVEL; }
});

test('not a clip, or no ffmpeg: plays as measured nothing, and is tried again next time', async () => {
  const saved = process.env.FFMPEG_PATH;
  process.env.FFMPEG_PATH = path.join(dir, 'no-such-ffmpeg.exe');
  try {
    assert.deepStrictEqual(await level.levelFor('https://x/none.mp4', Buffer.from('x'), 'mp4'), { level: 'unmeasured', gainDb: 0 });
    assert.ok(!level._cache.has('/none.mp4'));
  } finally { if (saved == null) delete process.env.FFMPEG_PATH; else process.env.FFMPEG_PATH = saved; }
});
