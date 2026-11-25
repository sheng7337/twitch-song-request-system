// server/clip-level.js
// Evens out Twitch clips' volume (!so, !watch). /api/clip-stream has the whole clip in memory before
// it sends it to the clip player anyway; ffmpeg measures it there (EBU R128, the audio only: about
// 75 ms for a 30-s 1080p clip), and the response says how far to turn it up or down (X-Clip-Gain-Db).
// The clip player applies that and a compressor + limiter, which turn down loud moments (a scream).
//
// What's measured is the clip's talking level: the median of its short-term (3-s) loudness, leaving
// out silence. Not the overall loudness, which one loud moment pulls up: a clip of quiet talking and
// one scream would then hardly be turned up, its talking left quiet. The scream is the compressor's.
//
// No ffmpeg, a clip with no sound, a measurement over 5 s: no gain (the compressor still works), so a
// clip is never held up or lost. Gains are kept per clip file, so a clip played again starts at once.
// Off in Chat ⚙ → Shoutout clips (CLIP_LEVEL=0): nothing measured, the clip plays as it is.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const TARGET_LUFS = -18;          // where talking in a clip ends up; the limiter keeps peaks below -1 dBFS
const MAX_UP_DB = 12;             // a near-silent clip is turned up only this much
const MAX_DOWN_DB = -20;
const SILENT_LUFS = -50;          // quieter 3-s stretches are silence or near it: not talking
const TIMEOUT_MS = 5000;
const CACHE_MAX = 200;

const cache = new Map();          // clip file (path without the signature) → gain in dB, or null

function enabled() { return process.env.CLIP_LEVEL !== '0'; }
const ffmpegPath = () => process.env.FFMPEG_PATH || 'ffmpeg';

// ffmpeg's ebur128 frame lines (stderr), ten a second: "t: 2.9  M: -20.1 S: -20.3  I: -20.0 LUFS …"
// → the short-term loudness of each
function shortTerm(text) {
  return [...String(text).matchAll(/\bS:\s*(-?\d+(?:\.\d+)?)/g)].map(m => Number(m[1])).filter(Number.isFinite);
}

// The talking level: the median short-term loudness, silence left out; null when it's all silence
function talkingLevel(values) {
  const v = values.filter(x => x > SILENT_LUFS).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  return Math.round((v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2) * 10) / 10;
}

function gainFor(lufs) {
  if (lufs == null || lufs < SILENT_LUFS) return null;
  const db = TARGET_LUFS - lufs;
  return Math.round(Math.min(MAX_UP_DB, Math.max(MAX_DOWN_DB, db)) * 10) / 10;
}

// The clip (an MP4 or joined MPEG-TS) → its talking level in LUFS, or null.
// A file rather than stdin: an MP4 may keep its index at the end, which ffmpeg can't reach in a pipe.
function measure(body, ext) {
  const file = path.join(os.tmpdir(), `clip-level-${crypto.randomBytes(6).toString('hex')}.${ext}`);
  return new Promise((resolve) => {
    let done = false, rest = '';
    const values = [];
    const finish = (lufs) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fs.rm(file, { force: true }, () => {});
      resolve(lufs);
    };
    let child = null;
    const timer = setTimeout(() => { try { child && child.kill(); } catch {} finish(null); }, TIMEOUT_MS);
    try {
      fs.writeFileSync(file, body);
      child = spawn(ffmpegPath(), ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'ebur128', '-f', 'null', '-'],
        { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (err) {
      return finish(null);
    }
    // line by line: a long clip's frame log is long
    child.stderr.on('data', (d) => {
      const lines = (rest + d).split(/\r?\n/);
      rest = lines.pop();
      for (const line of lines) if (line.includes(' S:')) values.push(...shortTerm(line));
    });
    child.on('error', () => finish(null));   // no ffmpeg
    child.on('close', (code) => {
      if (rest.includes(' S:')) values.push(...shortTerm(rest));
      finish(code === 0 && values.length ? talkingLevel(values) : null);
    });
  });
}

// For /api/clip-stream: { level: 'on' | 'off' | 'unmeasured', gainDb }
async function levelFor(url, body, ext) {
  if (!enabled()) return { level: 'off', gainDb: 0 };
  let key;
  try { key = new URL(url).pathname; } catch { key = url.split('?')[0]; }
  if (!cache.has(key)) {
    const started = Date.now();
    const lufs = await measure(body, ext);
    const gainDb = gainFor(lufs);
    console.log(lufs == null
      ? `[clip-level] Not measured (${Date.now() - started} ms): plays as it is, loud moments still turned down`
      : `[clip-level] Talking at ${lufs} LUFS → ${gainDb == null ? 'silent, no change' : `${gainDb > 0 ? '+' : ''}${gainDb} dB`} (${Date.now() - started} ms)`);
    if (lufs == null) return { level: 'unmeasured', gainDb: 0 };   // not kept: may work next time
    cache.set(key, gainDb);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  }
  const gainDb = cache.get(key);
  return { level: gainDb == null ? 'unmeasured' : 'on', gainDb: gainDb ?? 0 };
}

module.exports = { levelFor, measure, shortTerm, talkingLevel, gainFor, enabled, TARGET_LUFS, _cache: cache };
