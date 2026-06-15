// server/random.js
// Picks a random song from the song list for Channel Points random reward.
//
// Modes (set RANDOM_PICK_MODE in .env):
//   "pure"     — truly random pick from all eligible songs
//   "weighted" — songs not played recently are more likely to be picked

const { getSongs } = require('./sheets');
const config = require('./config');
const { getHistory, getLastRequestedAt } = require('./history');

const MS_PER_DAY = 86400000;

// How long a song stays off the random-pick pool after being requested,
// configurable at runtime via the dashboard (RANDOM_COOLDOWN_DAYS in .env).
// Defaults to 7 days if unset; 0 = no cooldown.
const DEFAULT_COOLDOWN_DAYS = 7;

function getCooldownMs() {
  const raw = process.env.RANDOM_COOLDOWN_DAYS;
  const days = raw == null || raw === '' ? DEFAULT_COOLDOWN_DAYS : parseFloat(raw);
  return Number.isFinite(days) && days > 0 ? days * MS_PER_DAY : 0;
}

function getEligibleSongs(excludeTitles = []) {
  const songs = getSongs();
  const excludeSet = new Set(excludeTitles.map(t => t.toLowerCase().trim()));
  const cooldownMs = getCooldownMs();
  const now = Date.now();

  return songs.filter(s => {
    const title = s.title.toLowerCase().trim();
    if (excludeSet.has(title)) return false;

    if (cooldownMs > 0) {
      const lastRequestedAt = getLastRequestedAt(title);
      if (lastRequestedAt) {
        const lastDate = new Date(lastRequestedAt.replace(' ', 'T') + 'Z');
        if (now - lastDate.getTime() < cooldownMs) return false;
      }
    }

    return true;
  });
}

function pickPure(songs) {
  if (songs.length === 0) return null;
  return songs[Math.floor(Math.random() * songs.length)];
}

function pickWeighted(songs) {
  if (songs.length === 0) return null;

  const history = getHistory();
  const now = Date.now();

  // Assign a weight to each song — higher = more likely to be picked
  const weighted = songs.map(song => {
    const rec = history[song.title.toLowerCase().trim()];
    let weight;

    if (!rec || !rec.last_requested_at) {
      // Never requested — highest weight
      weight = config.RANDOM_NEVER_REQUESTED_WEIGHT;
    } else {
      const lastDate = new Date(rec.last_requested_at.replace(' ', 'T') + 'Z');
      const daysAgo = (now - lastDate.getTime()) / MS_PER_DAY;
      // More days ago = higher weight, capped at 180
      weight = Math.min(config.RANDOM_MAX_DAYS_WEIGHT, Math.max(1, Math.floor(daysAgo)));
    }

    return { song, weight };
  });

  // Weighted random selection
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const { song, weight } of weighted) {
    rand -= weight;
    if (rand <= 0) return song;
  }
  return weighted[weighted.length - 1].song;
}

function pickRandom(excludeTitles = []) {
  const mode = (process.env.RANDOM_PICK_MODE || 'weighted').toLowerCase();
  const eligible = getEligibleSongs(excludeTitles);

  if (eligible.length === 0) return null;

  const picked = mode === 'pure' ? pickPure(eligible) : pickWeighted(eligible);
  console.log(`[random] Picked "${picked?.title}" (mode: ${mode}, pool: ${eligible.length} songs)`);
  return picked;
}

module.exports = { pickRandom };
