const MAX_QUEUE = 3;
// Extra wait on top of an item's expected length before the server stops
// waiting for the clip player (e.g. none is open) and moves on by itself.
const WATCHDOG_GRACE_MS = 15000;
const YOUTUBE_MAX_MS = 10 * 60 * 1000; // matches the clip player's YouTube cap

let queue = [];
let current = null; // item on screen, or null when idle
let nextId = 0;
let watchdog = null;
let broadcast = null;

function init(broadcastRaw) {
  broadcast = broadcastRaw;
}

function expectedDurationMs(payload) {
  if (payload.kind === 'youtube') return YOUTUBE_MAX_MS;
  if (payload.kind === 'sponsor-card') {
    // !tk: one list; !endingtk: groups, each starting on a new page under its heading
    const groups = payload.groups || [{ people: payload.broadcasters || [] }];
    const pages = groups.reduce((n, g) => n + Math.ceil(g.people.length / 4), 0);
    return 2000 + pages * 11000 + groups.length * 1500; // a page shows at most ~10.5s, a heading change 1.2s
  }
  return ((payload.duration || 30) + 3) * 1000;
}

function play(payload) {
  current = { ...payload, mediaId: ++nextId };
  broadcast(current);
  clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    console.warn(`[media-queue] No end signal for "${current.title}" — moving on`);
    advance();
  }, expectedDurationMs(current) + WATCHDOG_GRACE_MS);
}

function advance() {
  clearTimeout(watchdog);
  watchdog = null;
  current = null;
  if (queue.length > 0) {
    const next = queue.shift();
    play(next);
    console.log(`[media-queue] Playing next: "${next.title}" (${queue.length} remaining)`);
  } else {
    console.log('[media-queue] Queue empty');
  }
}

function enqueue(payload) {
  if (!current) {
    play(payload);
    console.log(`[media-queue] Playing: "${payload.title}"`);
    return;
  }
  if (queue.length >= MAX_QUEUE) {
    console.log(`[media-queue] Queue full (${MAX_QUEUE}/${MAX_QUEUE}), dropping: "${payload.title}"`);
    return;
  }
  queue.push(payload);
  console.log(`[media-queue] Queued (${queue.length}/${MAX_QUEUE}): "${payload.title}"`);
}

// A second clip player (e.g. OBS plus a preview tab) reports the same item
// ending; matching on mediaId stops that duplicate from skipping the next one.
// A missing id comes from a clip player page loaded before this change.
function onEnded(mediaId) {
  if (!current) return;
  if (mediaId != null && mediaId !== current.mediaId) return;
  advance();
}

function stopAll() {
  const had = queue.length;
  queue = [];
  clearTimeout(watchdog);
  watchdog = null;
  current = null;
  broadcast({ type: 'media-stop' });
  console.log(`[media-queue] Stopped and cleared (dropped ${had} queued)`);
}

module.exports = { init, enqueue, onEnded, stopAll };
