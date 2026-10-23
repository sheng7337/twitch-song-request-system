// server/song-notes.js
// Song notes on the stream overlay: when chat names a sheet song, the song overlay briefly says
// when it was last sung, so viewers know whether to request it. Within the random cooldown
// (RANDOM_COOLDOWN_DAYS, ⚙ Settings) the note suggests another song; otherwise it says the song
// can be requested (or was never sung). Each song shows at most once per PER_SONG_MS, so a chat
// that keeps naming it doesn't keep covering the overlay. Needs the request history sheet.
// SONG_NOTES=0 (the Chat tab's switch) stops the overlay notes; songs are still marked `recent`.
//
// check(record) runs on each chat record before it's kept (chat-log.js addChat): it marks the
// record's songs `recent` (within the cooldown) and `onStream` (a note was sent for it), and
// sends { type: 'song-note', title, artist, days, recent } to the overlays (days: null = never sung).

const { getCooldownMs } = require('./random');

const DAY_MS = 86400000;
const PER_SONG_MS = 10 * 60 * 1000;

let send = () => {};
const shownAt = new Map();   // title (lowercase) → when its note was last sent

function init(sendFn) {
  send = sendFn || send;
}

// On unless SONG_NOTES=0
function enabled() {
  return process.env.SONG_NOTES !== '0';
}

function check(rec) {
  if (!rec.songs) return;
  const cooldown = getCooldownMs();
  for (const s of rec.songs) {
    if (s.lastAt === undefined) continue;   // history not loaded: nothing to say
    const days = s.lastAt === null ? null : Math.max(0, Math.floor((rec.at - s.lastAt) / DAY_MS));
    const recent = s.lastAt !== null && cooldown > 0 && rec.at - s.lastAt < cooldown;
    if (recent) s.recent = true;
    if (!enabled()) continue;
    const key = s.title.toLowerCase();
    if (rec.at - (shownAt.get(key) || -Infinity) < PER_SONG_MS) continue;
    shownAt.set(key, rec.at);
    s.onStream = true;
    send({ type: 'song-note', title: s.title, artist: s.artist, days, recent });
    console.log(`[song-note] Chat named "${s.title}" — ${days === null ? 'never sung' : `sung ${days} day(s) ago`}${recent ? ' (within the cooldown)' : ''}`);
  }
}

module.exports = { init, check, enabled, PER_SONG_MS };
