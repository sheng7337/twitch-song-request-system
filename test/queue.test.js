const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Queue state goes to a temp file, never the real queue-state.json
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-'));
process.env.QUEUE_STATE_FILE = path.join(tmp, 'queue-state.json');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const q = require('../server/queue');

const settled = [];
q.setRedemptionHook((r, action) => settled.push([r.id, action]));
const r = (id) => ({ id, rewardId: 'song-reward' });

function reset() {
  q.clearQueue();
  while (q.getState().pending.length) q.deleteSong('pending', 0);
  while (q.getState().playedSongs.length) q.deleteSong('played', 0);
  settled.length = 0;
}

test('a requested song is done when finished, refunded when removed', () => {
  reset();
  q.addSong({ title: 'A', requester: 'x', redemption: r('a') });
  q.addSong({ title: 'B', requester: 'y', redemption: r('b') });
  q.addSong({ title: 'C', requester: 'z' });   // added by hand: nothing to settle
  q.deleteSong('queue', 0);
  q.skipSong();
  q.skipSong();
  assert.deepStrictEqual(settled, [['b', 'refund'], ['a', 'done']]);
  assert.ok(q.getState().playedSongs.every(s => !s.redemption), 'played songs no longer carry it');

  q.moveSong('played', 0, 'nowPlaying', 0);   // sung again
  q.skipSong();
  assert.strictEqual(settled.length, 2, 'done once only');
});

test('a redemption done or refunded in the chat or on Twitch is not settled again by its song', () => {
  reset();
  q.addSong({ title: 'A', requester: 'x', redemption: r('a') });
  q.addSong({ title: 'B', requester: 'y', redemption: r('b') });
  q.forgetRedemption('a');
  q.forgetRedemption('b');
  q.skipSong();
  q.deleteSong('nowPlaying');
  assert.deepStrictEqual(settled, []);
});

test('pending requests keep their redemption when accepted, moved or redrawn; dismissed ones are refunded', () => {
  reset();
  q.addPending({ requester: 'x', originalRequest: '晴天?', confidence: 60, redemption: r('p1') });
  q.addPending({ requester: 'y', originalRequest: '???', confidence: null, redemption: r('p2') });
  q.addPending({ requester: 'z', originalRequest: 'cand', confidence: 90, candidates: [{ title: 'C1' }], redemption: r('p3') });
  q.acceptPending(0, '晴天', '周杰倫');
  q.deleteSong('pending', 0);
  q.moveSong('pending', 0, 'queue', 0);
  assert.deepStrictEqual(settled, [['p2', 'refund']]);

  q.moveSong('queue', 0, 'pending', 0);   // dragged back to pending for editing
  q.moveSong('pending', 0, 'queue', 0);
  q.redrawSong('queue', 0, { title: 'R', requester: 'z', redemption: q.getState().queue[0].redemption });
  q.moveSong('queue', 0, 'played', 0);
  q.deleteSong('nowPlaying');
  assert.deepStrictEqual(settled, [['p2', 'refund'], ['p3', 'done'], ['p1', 'refund']]);
});
