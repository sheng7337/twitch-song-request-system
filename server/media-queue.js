const MAX_QUEUE = 3;

let queue = [];
let playing = false;
let broadcast = null;

function init(broadcastRaw) {
  broadcast = broadcastRaw;
}

function enqueue(payload) {
  if (!playing) {
    playing = true;
    broadcast(payload);
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

function onEnded() {
  if (queue.length > 0) {
    const next = queue.shift();
    broadcast(next);
    console.log(`[media-queue] Playing next: "${next.title}" (${queue.length} remaining)`);
  } else {
    playing = false;
    console.log('[media-queue] Queue empty');
  }
}

function stopAll() {
  const had = queue.length;
  queue = [];
  playing = false;
  broadcast({ type: 'media-stop' });
  console.log(`[media-queue] Stopped and cleared (dropped ${had} queued)`);
}

module.exports = { init, enqueue, onEnded, stopAll };
