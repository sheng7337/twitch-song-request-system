// server/config.js
// ─────────────────────────────────────────────────────────────────────────────
// All non-secret tuneable options in one place.
// Credentials and IDs stay in .env — this file is for behaviour settings.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {

  // ── Google Sheets ──────────────────────────────────────────────────────────

  // Tabs left out of requests, random picks and the link finder (e.g. practice/draft
  // tabs): EXCLUDED_TABS in .env, comma-separated. Unset = the practice tab 待練勿點;
  // set but empty = every tab is used. Read on each use, so .env changes apply at once.
  get EXCLUDED_TABS() {
    const v = process.env.EXCLUDED_TABS;
    if (v == null) return ['待練勿點'];
    return v.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  },

  // Header of the YouTube link column. It isn't set up by hand: the link finder
  // (dashboard → 🔗 links) creates it in a tab the first time it saves links
  // there, and fills it. Leihu Singsing matches songs to backing tracks by it.
  YT_LINK_HEADER: 'YTLink',

  // The link finder marks a pick "confident" when it's an official upload of the
  // right length — or a fan upload (e.g. a lyric video) of the right length with
  // at least this many views. Lower = fewer songs to review, more fan uploads.
  LINK_CONFIDENT_FAN_VIEWS: 1000000,

  // How often to refresh the song list from Google Sheets (milliseconds)
  SHEET_REFRESH_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes


  // ── Song Matching ──────────────────────────────────────────────────────────

  // Confidence % at or above which a match goes straight to queue.
  // Below this threshold → sent to Pending for manual review.
  AUTO_ACCEPT_THRESHOLD: 80,

  // Fuse.js fuzzy match settings
  // threshold: 0 = exact match only, 1 = match anything (0.4 is a good balance)
  // distance: how far apart characters can be and still match
  MATCH_THRESHOLD: 0.4,
  MATCH_DISTANCE: 100,
  MATCH_MIN_CHARS: 2,

  // How much title vs artist name contributes to the match score (must sum to 1.0)
  MATCH_TITLE_WEIGHT:  0.8,
  MATCH_ARTIST_WEIGHT: 0.2,


  // ── Random Song Pick ───────────────────────────────────────────────────────

  // Weight given to songs that have never been requested (higher = more likely)
  RANDOM_NEVER_REQUESTED_WEIGHT: 365,

  // Maximum weight for songs based on days since last request
  RANDOM_MAX_DAYS_WEIGHT: 180,


  // ── Leihu Singsing ─────────────────────────────────────────────────────────

  // Lyrics recognition language Leihu uses for songs imported from each sheet tab
  // (zh, ja, en, ko, yue). Tabs not listed use Leihu's automatic detection —
  // e.g. 台語, which no recognition language fits. Needs Leihu 1.4.7+.
  LEIHU_TAB_LANGUAGES: { '國語': 'zh', '日語': 'ja' },

  // Overlay look and scroll speed are set in overlay/index.html
  // (CSS variables in <style>, SCROLL_PX_PER_SEC in <script>).

};
