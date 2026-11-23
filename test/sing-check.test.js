const test = require('node:test');
const assert = require('node:assert');
const sc = require('../server/sing-check');

const SING = { id: 'a', name: 'Sing', icon: '🎤', holdClips: true };   // saved before the tick: counts by holdClips
const TALK = { id: 'b', name: 'Talk', icon: '💬' };
const BREAK = { id: 'c', name: 'Break', icon: '☕', holdClips: true, sing: false };

test('isSingMode: the tick, or holding clips for modes saved before it', () => {
  assert.strictEqual(sc.isSingMode(SING), true);
  assert.strictEqual(sc.isSingMode(TALK), false);
  assert.strictEqual(sc.isSingMode(BREAK), false);
  assert.strictEqual(sc.isSingMode({ sing: true }), true);
  assert.strictEqual(sc.isSingMode(null), false);
});

test('reminds only while Leihu plays outside a singing mode, once per change', () => {
  const sent = [];
  sc.init(m => sent.push(m));
  sc.setModes('b', [SING, TALK, BREAK]);
  sc.setPlayback({ playing: false, sid: 's1', title: 'Lemon' });
  assert.strictEqual(sc.state().wrong, false);

  sc.setPlayback({ playing: true, sid: 's1', title: 'Lemon' });
  const s = sc.state();
  assert.strictEqual(s.wrong, true);
  assert.deepStrictEqual(s.active, { name: 'Talk', icon: '💬' });
  assert.deepStrictEqual(s.sing.map(m => m.id), ['a']);
  const n = sent.length;
  sc.setPlayback({ playing: true, sid: 's1', title: 'Lemon' });   // the same: nothing new sent
  assert.strictEqual(sent.length, n);

  sc.setModes('a', [SING, TALK, BREAK]);   // switched to singing
  assert.strictEqual(sc.state().wrong, false);
  assert.strictEqual(sent.at(-1).wrong, false);

  sc.setModes(null, [SING, TALK]);   // no mode on counts as not singing
  assert.strictEqual(sc.state().wrong, true);
  assert.strictEqual(sc.state().active, null);

  sc.setModes('b', [TALK]);   // no singing mode at all: no reminder
  assert.strictEqual(sc.state().wrong, false);

  sc.setModes('b', [SING, TALK]);
  sc.setPlayback(null);   // Leihu gone
  assert.strictEqual(sc.state().wrong, false);
});
