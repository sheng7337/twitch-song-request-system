// server/matcher.js
// Fuzzy-matches a viewer's request text against your Google Sheet song list.

const Fuse = require('fuse.js');
const config = require('./config');
const { getSongs } = require('./sheets');

// Options loaded from config.js
const AUTO_ACCEPT_THRESHOLD = config.AUTO_ACCEPT_THRESHOLD;

function getFuseOptions() {
  return {
    keys: [
      { name: 'title', weight: config.MATCH_TITLE_WEIGHT },
      { name: 'artist', weight: config.MATCH_ARTIST_WEIGHT },
    ],
    threshold: config.MATCH_THRESHOLD,
    distance: config.MATCH_DISTANCE,
    minMatchCharLength: config.MATCH_MIN_CHARS,
    includeScore: true,
  };
}

const MAX_CANDIDATES = 5;

function matchSong(requestText) {
  const songs = getSongs();

  if (songs.length === 0) {
    return { matched: false, confident: false, reason: 'Song list is empty' };
  }

  // ── Fix 1: Exact title match (case-insensitive) ───────────────────────────
  // Users often copy song names directly from the list, so an exact hit should
  // bypass fuzzy scoring entirely and go straight to the queue.
  const needle = requestText.trim().toLowerCase();
  const exactMatches = songs.filter(s => s.title.toLowerCase() === needle);

  if (exactMatches.length === 1) {
    return {
      matched: true,
      confident: true,
      song: exactMatches[0],
      confidence: 100,
      originalRequest: requestText,
    };
  }

  if (exactMatches.length > 1) {
    // Same title, different artists — broadcaster picks which one
    return {
      matched: true,
      confident: false,
      candidates: exactMatches.map(s => ({ ...s, confidence: 100 })),
      song: exactMatches[0],
      confidence: 100,
      originalRequest: requestText,
    };
  }

  // ── Fuzzy matching ────────────────────────────────────────────────────────
  const fuse = new Fuse(songs, getFuseOptions());
  const results = fuse.search(requestText.trim());

  if (results.length === 0) {
    return {
      matched: false,
      confident: false,
      reason: `"${requestText}" did not match any song in your list`,
    };
  }

  // ── Fix 2: Length-ratio penalty ───────────────────────────────────────────
  // Fuse.js scores a prefix match near-perfectly regardless of how much shorter
  // the query is than the title (e.g. "彩虹" vs "彩虹金剛" → 100%).  Scale the
  // confidence by query_length / title_length so a short query cannot
  // auto-accept a much longer title.
  function adjustedConfidence(rawScore, songTitle) {
    const raw = Math.round((1 - rawScore) * 100);
    const ratio = Math.min(1, needle.length / songTitle.length);
    return Math.round(raw * ratio);
  }

  const best = results[0];
  const topConfidence = adjustedConfidence(best.score, best.item.title);

  // Collect all results that still cross the threshold after adjustment
  const candidates = results
    .slice(0, MAX_CANDIDATES + 1)
    .map(r => ({ ...r.item, confidence: adjustedConfidence(r.score, r.item.title) }))
    .filter(c => c.confidence >= AUTO_ACCEPT_THRESHOLD)
    .slice(0, MAX_CANDIDATES);

  // Multiple confident candidates — let broadcaster pick
  if (candidates.length > 1) {
    return {
      matched: true,
      confident: false,
      candidates,
      song: best.item,
      confidence: topConfidence,
      originalRequest: requestText,
    };
  }

  // Single confident match — auto-accept
  if (topConfidence >= AUTO_ACCEPT_THRESHOLD) {
    return {
      matched: true,
      confident: true,
      song: best.item,
      confidence: topConfidence,
      originalRequest: requestText,
    };
  }

  // Weak or no match
  return {
    matched: true,
    confident: false,
    song: best.item,
    confidence: topConfidence,
    originalRequest: requestText,
  };
}

module.exports = { matchSong, AUTO_ACCEPT_THRESHOLD };
