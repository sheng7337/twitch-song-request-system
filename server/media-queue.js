const MAX_QUEUE = 3;
const MAX_HELD = 10;   // while a mode holds clips (modes.js), e.g. during a song
// Extra wait on top of an item's expected length before the server stops
// waiting for the clip player (e.g. none is open) and moves on by itself.
const WATCHDOG_GRACE_MS = 15000;
const YOUTUBE_MAX_MS = 10 * 60 * 1000; // matches the clip player's YouTube cap

let queue = [];
let current = null; // item on screen, or null when idle
let nextId = 0;
let watchdog = null;
let broadcast = null;
let held = false;   // true: nothing new starts; the queue waits

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
  if (held) {
    if (queue.length) console.log(`[media-queue] Holding ${queue.length} until the mode changes`);
  } else if (queue.length > 0) {
    const next = queue.shift();
    play(next);
    console.log(`[media-queue] Playing next: "${next.title}" (${queue.length} remaining)`);
  } else {
    console.log('[media-queue] Queue empty');
  }
}

function enqueue(payload) {
  if (!current && !held) {
    play(payload);
    console.log(`[media-queue] Playing: "${payload.title}"`);
    return;
  }
  const max = held ? MAX_HELD : MAX_QUEUE;
  if (queue.length >= max) {
    console.log(`[media-queue] Queue full (${max}/${max}), dropping: "${payload.title}"`);
    return;
  }
  queue.push(payload);
  console.log(`[media-queue] Queued (${queue.length}/${max})${held ? ' — held' : ''}: "${payload.title}"`);
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

// Holding: what plays now finishes, new items wait (up to MAX_HELD); letting go plays them in turn
function setHold(on) {
  held = !!on;
  if (!held && !current && queue.length) advance();
}

const isHeld = () => held;

module.exports = { init, enqueue, onEnded, stopAll, setHold, isHeld };
