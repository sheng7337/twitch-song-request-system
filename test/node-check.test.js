const test = require('node:test');
const assert = require('node:assert');
const { nodeStatus } = require('../server/node-check');
const { secureNode } = require('../package.json');

test('a Node.js release line is outdated below its minimum, fine at or above it', () => {
  const [line, min] = Object.entries(secureNode)[0];
  const [, minor, patch] = min.split('.').map(Number);
  assert.strictEqual(nodeStatus(min).outdated, false);
  assert.strictEqual(nodeStatus(`${line}.${minor}.${patch + 1}`).outdated, false);
  assert.strictEqual(nodeStatus(`${line}.${minor + 1}.0`).outdated, false);
  const older = patch > 0 ? `${line}.${minor}.${patch - 1}` : `${line}.${minor - 1}.99`;
  assert.deepStrictEqual(nodeStatus(older), { version: older, minimum: min, outdated: true });
  assert.strictEqual(nodeStatus(`${line}.${minor}.${patch}0`).outdated, false);   // numeric, not text, comparison
});

test('unlisted older or odd release lines are outdated; newer lines are fine', () => {
  const lines = Object.keys(secureNode).map(Number).sort((a, b) => a - b);
  const newest = secureNode[lines[lines.length - 1]];
  assert.deepStrictEqual(nodeStatus('18.20.0'), { version: '18.20.0', minimum: newest, outdated: true });
  assert.strictEqual(nodeStatus(`${lines[0] + 1}.0.0`).outdated, true);
  assert.deepStrictEqual(nodeStatus(`${lines[lines.length - 1] + 2}.0.0`).outdated, false);
});
