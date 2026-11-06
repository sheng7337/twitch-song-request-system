const test = require('node:test');
const assert = require('node:assert');

test.mock.timers.enable({ apis: ['setTimeout'] });
console.log = () => {};
console.warn = () => {};

const mediaQueue = require('../server/media-queue');
const sent = [];
mediaQueue.init(msg => sent.push(msg));
const last = () => sent[sent.length - 1];

test('a duplicate end signal from a second clip player does not skip ahead', () => {
  mediaQueue.enqueue({ title: 'A', kind: 'video', duration: 10 });
  mediaQueue.enqueue({ title: 'B', kind: 'video', duration: 10 });
  mediaQueue.enqueue({ title: 'C', kind: 'video', duration: 10 });
  const idA = last().mediaId;
  mediaQueue.onEnded(idA);
  mediaQueue.onEnded(idA);
  assert.strictEqual(last().title, 'B');
});

test('the watchdog moves on when no clip player reports the end', () => {
  test.mock.timers.tick(10_000 + 3_000 + 15_000 - 1);
  assert.strictEqual(last().title, 'B');
  test.mock.timers.tick(1);
  assert.strictEqual(last().title, 'C');
});

test('!stop clears the queue and cancels the watchdog', () => {
  mediaQueue.enqueue({ title: 'D', kind: 'video', duration: 10 });
  mediaQueue.stopAll();
  const count = sent.length;
  test.mock.timers.tick(10 * 60_000);
  assert.strictEqual(sent.length, count);
  assert.strictEqual(last().type, 'media-stop');
});

test('a mode holding clips: the one on screen finishes, new ones wait, letting go plays them', () => {
  mediaQueue.enqueue({ title: 'E', kind: 'video', duration: 10 });
  mediaQueue.setHold(true);
  assert.strictEqual(mediaQueue.isHeld(), true);
  for (const title of ['F', 'G', 'H', 'I']) mediaQueue.enqueue({ title, kind: 'video', duration: 10 });   // more than 3 while held
  mediaQueue.onEnded(last().mediaId);
  assert.strictEqual(last().title, 'E');
  const count = sent.length;
  test.mock.timers.tick(10 * 60_000);
  assert.strictEqual(sent.length, count);
  mediaQueue.setHold(false);
  assert.strictEqual(last().title, 'F');
  for (const title of ['G', 'H', 'I']) {
    mediaQueue.onEnded(last().mediaId);
    assert.strictEqual(last().title, title);
  }
  mediaQueue.stopAll();
});
