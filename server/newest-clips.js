// server/newest-clips.js
// A broadcaster's newest clips, for !so. Twitch's GET /clips can't sort by date: it returns the most-viewed
// first. So this walks back through date windows (the last 30 days, then 30–90 days ago, …), reading each
// window's pages, until it has enough, then keeps the newest. A window needs both started_at and ended_at:
// with started_at alone Twitch reads only one week from it.
//
// Which clips !so picks from (SHOUTOUT_CLIPS in .env, the Chat tab's ⚙): 'newest' = a random one of the
// newest 50 (default); 'top' = a random one of the 20 most viewed (Twitch's first page, as before).
//
// get(params) → Twitch's response body ({ data, pagination }); params has broadcaster_id, first,
// started_at, ended_at and after (the page cursor).

const DAY = 24 * 60 * 60 * 1000;
const WINDOWS_DAYS = [30, 90, 365, 3 * 365];          // window edges, in days back from now; then back to CLIPS_BEGAN
const CLIPS_BEGAN = Date.parse('2016-01-01T00:00:00Z'); // before Twitch had clips
const PAGE = 100;                                      // Twitch's largest page
const MAX_PAGES = 5;                                   // per window, so a huge channel can't cost many calls

async function newestClips(get, broadcasterId, count = 50, now = Date.now()) {
  const edges = [now, ...WINDOWS_DAYS.map(d => now - d * DAY), CLIPS_BEGAN];
  const found = [];
  const seen = new Set();
  for (let w = 0; w + 1 < edges.length && found.length < count; w++) {
    let after;
    for (let p = 0; p < MAX_PAGES; p++) {
      const body = await get({
        broadcaster_id: broadcasterId, first: PAGE,
        started_at: new Date(edges[w + 1]).toISOString(), ended_at: new Date(edges[w]).toISOString(),
        ...(after ? { after } : {}),
      });
      for (const c of body?.data || []) if (!seen.has(c.id)) { seen.add(c.id); found.push(c); }
      after = body?.pagination?.cursor;
      if (!after || !(body?.data || []).length) break;
    }
  }
  return found.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, count);
}

const CLIP_POOLS = ['newest', 'top'];

function clipPool(env = process.env) {
  const v = String(env.SHOUTOUT_CLIPS || '').toLowerCase();
  return CLIP_POOLS.includes(v) ? v : 'newest';
}

module.exports = { newestClips, clipPool, CLIP_POOLS };
