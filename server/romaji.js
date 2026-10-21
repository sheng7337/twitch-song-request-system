// server/romaji.js
// Does a video title spell a song's 漢字/かな title in Latin letters? Official
// uploads are sometimes romanized: 一青窈's channel has 四照花 as "Shishouka", a
// "- Topic" channel may have ハナミズキ as "Hanamizuki".
//
// Each 漢字 may be read in pinyin or in any Japanese on/kun reading (data/han-readings.json,
// built from Unicode's Unihan database by tools/build-han-readings.js); かな are read as
// written. Both sides are reduced to a loose form first, so Hepburn/Kunrei spellings,
// long vowels, doubled consonants and voicing (rendaku) don't matter.

// Loaded on first use, so tools/build-han-readings.js can use kanaToRomaji before the file exists
let han = null;
const hanReadings = () => han || (han = require('./data/han-readings.json'));

const KANA = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho', ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o', ん: 'n', ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゎ: 'wa',
};
const SMALL_Y = { ゃ: 'a', ゅ: 'u', ょ: 'o' };

// Katakana → hiragana, by code point.
function toHiragana(s) {
  return s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// かな/カナ → Hepburn romaji. っ and ー leave nothing: loose() ignores doubling and long vowels anyway.
function kanaToRomaji(s) {
  let out = '';
  for (const c of toHiragana(s)) {
    if (SMALL_Y[c]) {
      // きゃ → kya, しゃ → sha, ちゃ → cha, じゃ → ja
      out = /(sh|ch|j)i$/.test(out) ? out.slice(0, -1) + SMALL_Y[c] : out.replace(/i$/, '') + 'y' + SMALL_Y[c];
    } else if (KANA[c]) out += KANA[c];
  }
  return out;
}

// Loose spelling: Latin letters only, Hepburn → Kunrei-like, voiced → unvoiced, no doubled
// letters, ou/ei as one vowel. Pinyin passes through it too (sh/zh etc. only get looser).
function loose(s) {
  return s.normalize('NFD').toLowerCase().replace(/[^a-z]/g, '')
    .replace(/tch/g, 'ch').replace(/shi/g, 'si').replace(/chi/g, 'ti').replace(/tsu/g, 'tu').replace(/fu/g, 'hu')
    .replace(/ji/g, 'zi').replace(/sh/g, 'sy').replace(/ch/g, 'ty').replace(/j/g, 'zy')
    .replace(/m(?=[bp])/g, 'n')
    .replace(/g/g, 'k').replace(/z/g, 's').replace(/d/g, 't').replace(/[bp]/g, 'h')
    .replace(/ou/g, 'o').replace(/ei/g, 'e').replace(/([a-z])\1+/g, '$1');
}

// Verb readings in their joining form, as compounds write them without okurigana:
// 打 utsu → uchi (打上花火 Uchiage Hanabi), 上 ageru → age.
const JOINING = [[/tsu$/, 'chi'], [/su$/, 'shi'], [/([kgmbnr])u$/, '$1i'], [/([aeiou])u$/, '$1i']];

// Spellings of one 漢字: pinyin readings as they are; Japanese readings also cut short
// before a doubled consonant (学 gaku + 校 kou = gakkou → "ga" + "kou") and as verb stems.
// With `stems` (the 漢字 is followed by かな) also every shorter run of whole syllables:
// Unihan's kun readings include the okurigana (駆 "kakeru"), which the title writes again
// (駆ける → "ka" + "keru").
function hanSpellings(c, stems = false) {
  const [pinyin = '', japanese = ''] = (hanReadings()[c] || '').split('|');
  const out = new Set(pinyin.split(' ').map(loose));
  for (const r of japanese.split(' ').filter(Boolean)) {
    out.add(loose(r));
    const short = r.match(/^(.+?)(ku|ki|tsu|chi)$/);
    if (short) out.add(loose(short[1]));
    if (r.length >= 3) {
      if (/[ei]ru$/.test(r)) out.add(loose(r.slice(0, -2)));
      const rule = JOINING.find(([re]) => re.test(r));
      if (rule) out.add(loose(r.replace(...rule)));
    }
    if (stems) {
      for (const m of r.matchAll(/[aeiou]|n(?![aeiouy])/g)) out.add(loose(r.slice(0, m.index + 1)));
    }
  }
  out.delete('');
  return [...out];
}

// The title as a list of pieces, each a list of possible loose spellings; null if it has
// fewer than two 漢字/かな (nothing to romanize, or too short to match safely).
function titlePieces(title) {
  const pieces = [];
  let kana = '';
  let latin = '';
  let count = 0;
  let lastHan = null;   // the 漢字 that made the last piece, while nothing else follows it
  const flush = () => {
    // は and へ may be the particles "wa" and "e" (未来へ Mirai e)
    if (kana) pieces.push([...new Set([kana, kana.replace(/は/g, 'わ').replace(/へ/g, 'え')].map(k => loose(kanaToRomaji(k))))]);
    if (latin) pieces.push([loose(latin)]);
    kana = latin = '';
  };
  for (const c of title || '') {
    if (/[ぁ-ゖァ-ヶー]/.test(c)) {
      if (latin) flush();
      // okurigana: the 漢字 before it may be spelled by a stem of its reading
      if (lastHan) pieces[pieces.length - 1] = hanSpellings(lastHan, true);
      kana += c;
      count++;
    } else if (/[a-z0-9]/i.test(c)) {
      if (kana) flush();
      latin += c;
    } else if (hanReadings()[c]) {
      flush();
      pieces.push(hanSpellings(c));
      count++;
    } else if (/\p{Script=Han}/u.test(c)) {
      return null;   // a 漢字 we can't read: no romanized match
    } else {
      flush();
    }
    lastHan = !kana && !latin && hanReadings()[c] ? c : null;
  }
  flush();
  const filtered = pieces.map(p => p.filter(Boolean)).filter(p => p.length);
  return count >= 2 && filtered.length ? filtered : null;
}

// Can `text` be spelled exactly as the pieces, one spelling per piece, in order?
function spells(text, pieces) {
  let ends = new Set([0]);
  for (const options of pieces) {
    const next = new Set();
    for (const i of ends) {
      for (const o of options) if (text.startsWith(o, i)) next.add(i + o.length);
    }
    if (!next.size) return false;
    ends = next;
  }
  return ends.has(text.length);
}

// True when a run of whole Latin words in the video title spells the song title,
// e.g. "Shishouka (Chinese Version)" for 四照花. Song titles without 漢字/かな never match here.
function romanizedTitleMatch(songTitle, videoTitle) {
  const pieces = titlePieces(songTitle);
  if (!pieces) return false;
  const words = (videoTitle || '').normalize('NFD').toLowerCase().replace(/\p{M}/gu, '')
    .split(/[^a-z0-9]+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j <= words.length; j++) {
      const text = loose(words.slice(i, j).join(''));
      if (text.length >= 4 && spells(text, pieces)) return true;
    }
  }
  return false;
}

module.exports = { romanizedTitleMatch, kanaToRomaji, loose };
