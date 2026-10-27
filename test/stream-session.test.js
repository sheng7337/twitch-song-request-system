const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { stubModule } = require('./helpers');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-session-'));
process.env.STREAM_SESSION_FILE = path.join(tmp, 'stream-session.json');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
stubModule('twitch.js', { ensureFreshToken: async () => {} });
const session = require('../server/stream-session');

test('a session runs from go-live to the next go-live; ending the stream keeps it', () => {
  const changes = [];
  session.init(s => changes.push(s));
  session.onEvent('stream.online', { started_at: '2026-10-26T12:00:00Z' });
  session.onEvent('stream.offline', {});
  assert.deepStrictEqual(session.get(), { startedAt: Date.parse('2026-10-26T12:00:00Z'), live: false });
  session.onEvent('stream.online', { started_at: '2026-10-27T12:00:00Z' });
  assert.deepStrictEqual(changes.map(c => c.live), [true, false, true]);
  assert.strictEqual(JSON.parse(fs.readFileSync(process.env.STREAM_SESSION_FILE, 'utf8')).startedAt, Date.parse('2026-10-27T12:00:00Z'), 'kept for a restart');
});
