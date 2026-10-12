const path = require('path');

// Replaces a server module before anything requires it, so tests never touch
// Google Sheets, Twitch or the real .env.
function stubModule(serverRelPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', 'server', serverRelPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

function song(title, artist = '', tab = '國語', key = '') {
  return { title, artist, key, tab };
}

module.exports = { stubModule, song };
