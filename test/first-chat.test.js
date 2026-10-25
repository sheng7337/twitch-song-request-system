const test = require('node:test');
const assert = require('node:assert');
const { parseLine } = require('../server/first-chat');

test('reads the first-msg flag and message id from an IRC line', () => {
  const line = '@badge-info=;first-msg=1;id=8f2a-11;user-id=42 :viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #chan :hello there';
  const { tags, command } = parseLine(line);
  assert.strictEqual(command, 'PRIVMSG');
  assert.strictEqual(tags['first-msg'], '1');
  assert.strictEqual(tags.id, '8f2a-11');
  assert.deepStrictEqual(parseLine('PING :tmi.twitch.tv'), { tags: {}, command: 'PING', rest: 'PING :tmi.twitch.tv' });
});
