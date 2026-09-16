// server/shoutout-history.js
// In-memory store for broadcasters shouted out since the last !tk.
// getAndClear() returns all entries and resets the list.

const history = []; // { login, displayName, avatarUrl }

function addShoutout(login, displayName, avatarUrl) {
  if (!history.find(h => h.login.toLowerCase() === login.toLowerCase())) {
    history.push({ login, displayName, avatarUrl });
    console.log(`[shoutout-history] Added: ${displayName} (${history.length} total)`);
  }
}

function getAndClear() {
  return history.splice(0);
}

module.exports = { addShoutout, getAndClear };
