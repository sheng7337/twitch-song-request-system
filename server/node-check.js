// server/node-check.js — is this Node.js recent enough to have the latest security fixes?
//
// The minimum per release line is `secureNode` in package.json: when Node.js ships security
// fixes, raise it there (one place). Node.js itself is never installed for the user — the start
// scripts and the dashboard only tell them what to install.
//
// Run directly (start.ps1 / start_zh.ps1): prints "ok", or "outdated <current> <minimum>",
// for the script to show in its own language.

const { secureNode } = require('../package.json');

function compare(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

// { version, minimum, outdated }. A release line we don't list (older ones, or the odd-numbered
// short-lived lines) counts as outdated, with the newest listed line as the minimum; a line
// newer than every listed one is fine.
function nodeStatus(version = process.versions.node) {
  const lines = Object.keys(secureNode).map(Number).sort((a, b) => a - b);
  const major = Number(version.split('.')[0]);
  if (secureNode[major]) {
    return { version, minimum: secureNode[major], outdated: compare(version, secureNode[major]) < 0 };
  }
  if (major > lines[lines.length - 1]) return { version, minimum: null, outdated: false };
  return { version, minimum: secureNode[lines[lines.length - 1]], outdated: true };
}

if (require.main === module) {
  const s = nodeStatus();
  console.log(s.outdated ? `outdated ${s.version} ${s.minimum}` : 'ok');
}

module.exports = { nodeStatus };
