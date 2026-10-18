// server/link-score.js
// Picks the YouTube video that best matches a song's lyric version, from what
// tools/find-videos.py found. Pure functions — no I/O — so they're easy to test.
//
// The best video is the recording the online lyrics were timed for: then Leihu
// Singsing uses those timed lyrics as-is (track length within 3 s). Within ±25 s
// Leihu can still re-time them to the vocal, so such videos are a fallback.
// Text fields ending in _n are already normalized by Leihu (simplified Chinese,
// lowercase, letters and digits only).

const config = require('./config');

const EXACT_S = 3;      // Leihu uses timed lyrics unchanged within this length difference
const WORKABLE_S = 25;  // Leihu re-times lyrics up to ±25 s offset…
const MIN_RATIO = 0.8;  // …and a 0.8–1.25 length ratio
const MAX_RATIO = 1.25;
const SAME_S = 3;       // durations this close count as the same recording

// Versions of a song that don't fit a backing track, by video title.
const PENALTIES = [
  { tag: 'instrumental', points: -80, re: /伴奏|純音樂|纯音乐|instrumental|off\s*vocal|\binst\b|karaoke\s*伴奏|オフボーカル/i },
  { tag: 'compilation', points: -80, re: /top\s*\d+|耐久|精選|精选|必聽|必听|合輯|合辑|medley|playlist|串燒|串烧|\d+\s*首|[《「『][^》」』]*\+[^》」』]*[》」』]/i },
  { tag: 'live', points: -60, re: /\blive\b|ライブ|演唱會|演唱会|現場|现场|直拍|concert|歌會|歌会|巡迴|巡回|純享|纯享|\btour\b|音樂會|音乐会/i },
  // TV shows: singing contests, variety shows, award nights, news
  { tag: 'tv show', points: -60, re: /歌手\s*20\d\d|第\s*\d+\s*[期集]|綜藝|综艺|紅人榜|红人榜|紅白|红白|大賞|大赏|金曲獎|金曲奖|音樂大師|好聲音|好声音|新聞|新闻/i },
  { tag: 'cover', points: -60, re: /cover|翻唱|歌ってみた|唱看看|外國人唱/i },
  { tag: 'remix', points: -50, re: /remix|\bdj\b|8d|sped\s*up|slowed|nightcore|reverb|抖音|加速/i },
  { tag: 'karaoke', points: -15, re: /ktv|伴唱|卡拉\s*ok|カラオケ|karaoke/i },
  // Fan edits often cut or loop the audio
  { tag: 'fan edit', points: -25, re: /\bmad\b|\bamv\b|\bmmd\b|【mad】|【amv】/i },
];

// Other-language versions are different recordings — unless that language is the
// sheet tab's (a 日文版 is right for the 日語 tab). Tabs not listed accept none.
const LANGUAGE_VERSIONS = [
  { tabs: ['日語'], re: /日文版|日語版|日语版|日本語ver/i },
  { tabs: ['台語'], re: /台語版|台语版|閩南語版|闽南语版/ },
  { tabs: ['國語'], re: /國語版|国语版|華語版|华语版|中文版/ },
  { tabs: [], re: /英文版|english\s*ver|韓文版|韩文版|粵語版|粤语版/i },
];

// Record label channels count as official uploads.
const LABEL_RE = /唱片|records|環球|环球|universal|sony|索尼|華納|华纳|warner|avex|相信音樂|滾石|滚石|豪記|豪记|華研|华研|寰亞|寰亚|種子音樂|添翼|vevo/i;

function isTopic(channel) {
  return / - Topic$/.test(channel || '');
}

// Reference length of the lyric version: lyric results with exactly the song's
// title (artist-matching ones preferred), clustered; the length with the most
// support from other lyric results and from the videos wins.
function referenceDuration(raw) {
  const lyrics = (raw.lyrics || []).filter(l => l.duration > 0 && l.track_n && l.track_n === raw.title_n);
  if (!lyrics.length) return null;
  const byArtist = raw.artist_n ? lyrics.filter(l => artistMatches(raw.artist_n, l.artist_n)) : [];
  const pool = byArtist.length ? byArtist : lyrics;
  const videos = (raw.videos || []).filter(v => v.duration > 0 && v.title_n.includes(raw.title_n));
  let best = null;
  for (const l of pool) {
    const support = pool.filter(o => Math.abs(o.duration - l.duration) <= SAME_S).length
      + 0.5 * videos.filter(v => Math.abs(v.duration - l.duration) <= SAME_S).length
      + (l.synced ? 0.1 : 0);
    if (!best || support > best.support) best = { duration: l.duration, support };
  }
  return Math.round(best.duration);
}

function artistMatches(artistN, textN) {
  return !!(artistN && textN && (textN.includes(artistN) || artistN.includes(textN)));
}

// The sheet's artist plus how the lyric sites spell it for this recording (e.g. the
// sheet says 夏川里美, the sites and her channel say 夏川りみ). Only lyric results with
// the exact title and the reference length count, so other singers' versions don't.
function artistAliases(raw, ref) {
  const names = new Set(raw.artist_n ? [raw.artist_n] : []);
  if (ref) {
    for (const l of raw.lyrics || []) {
      if (l.track_n === raw.title_n && l.artist_n && Math.abs(l.duration - ref) <= SAME_S) names.add(l.artist_n);
    }
  }
  return [...names];
}

// 'exact' | 'workable' | 'off' | null (no reference length)
function lengthTier(duration, ref) {
  if (!ref || !duration) return null;
  const diff = Math.abs(duration - ref);
  if (diff <= EXACT_S) return 'exact';
  const ratio = duration / ref;
  if (diff <= WORKABLE_S && ratio >= MIN_RATIO && ratio <= MAX_RATIO) return 'workable';
  return 'off';
}

function scoreVideo(v, raw, ref, aliases = artistAliases(raw, ref), tab = '') {
  const reasons = [];
  let score = 0;
  const tier = lengthTier(v.duration, ref);
  const diff = ref && v.duration ? Math.round(Math.abs(v.duration - ref)) : null;
  if (tier === 'exact') score += 50 - diff * 3;
  else if (tier === 'workable') score += 30 - (diff - EXACT_S);
  else if (tier === 'off') score -= 100;

  const titleMatch = !!raw.title_n && v.title_n.includes(raw.title_n);
  score += titleMatch ? 25 : -40;
  if (!titleMatch) reasons.push('title differs');
  const topic = isTopic(v.channel);
  const artistChannel = aliases.some(a => artistMatches(a, v.channel_n));
  const artistMatch = artistChannel || aliases.some(a => v.title_n.includes(a));
  if (artistMatch) score += 10;
  const official = topic || artistChannel || LABEL_RE.test(v.channel) || /official|官方/i.test(`${v.title} ${v.channel}`);
  if (topic) score += 25;
  else if (official) score += 12;
  for (const p of PENALTIES) {
    if (p.re.test(v.title)) { score += p.points; reasons.push(p.tag); }
  }
  if (LANGUAGE_VERSIONS.some(l => !l.tabs.includes(tab) && l.re.test(v.title))) {
    score -= 40;
    reasons.push('other language');
  }
  score += Math.min(5, Math.log10((v.views || 0) + 1));
  return {
    id: v.id, title: v.title, channel: v.channel, duration: v.duration, views: v.views ?? null,
    diff, tier, topic, official, titleMatch, artistMatch, reasons, score: Math.round(score * 10) / 10,
  };
}

// Result for one song:
//   status 'confident' — top video is an exact-length, clean upload of this title by
//                         this artist that is official, or a fan upload with at least
//                         config.LINK_CONFIDENT_FAN_VIEWS views
//          'review'    — something plausible, needs a look
//          'none'      — nothing usable found
function scoreSong(raw, { tab = '', fanViews = config.LINK_CONFIDENT_FAN_VIEWS } = {}) {
  const ref = referenceDuration(raw);
  const aliases = artistAliases(raw, ref);
  const scored = (raw.videos || [])
    .filter(v => v.id && v.duration)
    .map(v => scoreVideo(v, raw, ref, aliases, tab))
    .sort((a, b) => b.score - a.score);
  // Another language's version is a different recording — never offered as a pick
  const usable = scored.filter(c => c.titleMatch && c.tier !== 'off' && !c.reasons.includes('other language'));
  const top = usable[0];
  let status = 'none';
  if (top) {
    const clean = top.tier === 'exact' && !top.reasons.length && (top.artistMatch || top.topic);
    const trusted = top.official || (fanViews > 0 && (top.views || 0) >= fanViews);
    status = clean && trusted ? 'confident' : 'review';
  }
  return {
    status,
    refDuration: ref,
    lyricSources: [...new Set((raw.lyrics || []).filter(l => l.track_n === raw.title_n).map(l => l.source))],
    candidates: (usable.length ? usable : scored).slice(0, 3),
  };
}

module.exports = { scoreSong, scoreVideo, referenceDuration, artistAliases, lengthTier, EXACT_S, WORKABLE_S };
