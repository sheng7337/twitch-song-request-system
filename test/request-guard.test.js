const test = require('node:test');
const assert = require('node:assert');
const { isAllowedRequest } = require('../server/request-guard');

const req = (host, origin) => ({ headers: { host, ...(origin !== undefined && { origin }) } });

test('allows non-browser clients with no Origin', () => {
  assert.ok(isAllowedRequest(req('localhost:3000')));
});

test('allows same-origin requests on local hosts', () => {
  for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000', '192.168.1.5:3000', 'streampc:3000', 'streampc.local:3000']) {
    assert.ok(isAllowedRequest(req(host, `http://${host}`)), host);
  }
});

test('blocks cross-site requests', () => {
  assert.ok(!isAllowedRequest(req('localhost:3000', 'https://evil.example')));
  assert.ok(!isAllowedRequest(req('localhost:3000', 'null')));
});

test('blocks DNS rebinding (public domain in Host)', () => {
  assert.ok(!isAllowedRequest(req('evil.example:3000', 'http://evil.example:3000')));
  assert.ok(!isAllowedRequest(req('evil.example:3000')));
});
