// tools/build-han-readings.js
// Builds server/data/han-readings.json — pinyin and Japanese readings of every 漢字 —
// from Unicode's Unihan database, for the link finder's romanized-title matching.
//
//   1. Download https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip and unzip it
//   2. node tools/build-han-readings.js path/to/Unihan_Readings.txt
//
// Unihan data © Unicode, Inc., used under the Unicode License
// (https://www.unicode.org/terms_of_use.html).

const fs = require('fs');
const path = require('path');
const { kanaToRomaji } = require('../server/romaji');

const PINYIN = ['kMandarin', 'kHanyuPinyin', 'kTGHZ2013', 'kXHC1983'];
const JAPANESE = ['kJapanese', 'kJapaneseOn', 'kJapaneseKun'];

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tools/build-han-readings.js path/to/Unihan_Readings.txt');
  process.exit(1);
}

// char → { pinyin: Set, japanese: Set }
const readings = {};
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  const [cp, field, value] = line.trim().split('\t');
  const pinyin = PINYIN.includes(field);
  if (!value || (!pinyin && !JAPANESE.includes(field))) continue;
  // Main CJK blocks only (U+3400–9FFF, compatibility F900–FAFF); song titles don't use the rare extensions
  const code = parseInt(cp.slice(2), 16);
  if (code > 0xffff) continue;
  const char = String.fromCodePoint(code);
  const entry = readings[char] || (readings[char] = { pinyin: new Set(), japanese: new Set() });
  // kHanyuPinyin "10710.160:sì,shì" — the readings follow the colon
  const words = pinyin ? value.split(/\s+/).map(v => v.replace(/^.*:/, '')).join(',').split(',') : value.split(/\s+/);
  for (const w of words) {
    const r = field === 'kJapanese' ? kanaToRomaji(w) : w.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    if (/^[a-z]+$/.test(r)) entry[pinyin ? 'pinyin' : 'japanese'].add(r);
  }
}

// "pinyin readings|Japanese readings", e.g. 四: "si shi|shi shitsu shichi yo yotsu yon yotabi"
const out = {};
for (const char of Object.keys(readings).sort()) {
  const { pinyin, japanese } = readings[char];
  if (pinyin.size || japanese.size) out[char] = `${[...pinyin].join(' ')}|${[...japanese].join(' ')}`;
}
const dest = path.join(__dirname, '..', 'server', 'data', 'han-readings.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));
console.log(`${Object.keys(out).length} characters → ${dest}`);
