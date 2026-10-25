// server/first-chat.js
// Which chat messages are a viewer's first in the channel. EventSub's chat events don't say so
// (their user_intro is only Twitch's "introduce yourself" prompt), but Twitch's IRC chat tags
// every first message with first-msg=1. So: a read-only, anonymous IRC connection (justinfan,
// no login or permission), joined to the channel. IRC's message id is EventSub's message_id.

const WebSocket = require('ws');

const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';
const RETRY_MAX_MS = 60000;

let ws = null;
let login = null;
let onFirst = () => {};
let retryMs = 2000;
let retryTimer = null;

// "@a=1;b=x :nick!… PRIVMSG #chan :text" → { tags: {a:'1', b:'x'}, command: 'PRIVMSG' }
function parseLine(line) {
  let rest = line;
  const tags = {};
  if (rest.startsWith('@')) {
    const sp = rest.indexOf(' ');
    for (const kv of rest.slice(1, sp).split(';')) {
      const eq = kv.indexOf('=');
      if (eq > 0) tags[kv.slice(0, eq)] = kv.slice(eq + 1);
    }
    rest = rest.slice(sp + 1);
  }
  if (rest.startsWith(':')) rest = rest.slice(rest.indexOf(' ') + 1);
  return { tags, command: rest.split(' ')[0], rest };
}

function retry() {
  if (retryTimer || !login) return;
  retryTimer = setTimeout(() => { retryTimer = null; open(); }, retryMs);
  retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
}

function open() {
  if (ws || !login) return;
  const sock = ws = new WebSocket(IRC_URL);
  sock.on('open', () => {
    sock.send('CAP REQ :twitch.tv/tags');
    sock.send(`NICK justinfan${Math.floor(10000 + Math.random() * 89999)}`);
    sock.send(`JOIN #${login}`);
  });
  sock.on('message', (data) => {
    for (const line of String(data).split('\r\n')) {
      if (!line) continue;
      const { tags, command, rest } = parseLine(line);
      if (command === 'PING') sock.send(`PONG ${rest.slice(5)}`);
      else if (command === 'JOIN') { retryMs = 2000; console.log(`[first-chat] Watching #${login} for first-time chatters`); }
      else if (command === 'RECONNECT') sock.close();
      else if (command === 'PRIVMSG' && tags['first-msg'] === '1' && tags.id) onFirst(tags.id);
    }
  });
  sock.on('error', (err) => console.error('[first-chat] Twitch chat connection:', err.message));
  sock.on('close', () => {
    if (ws === sock) ws = null;
    retry();
  });
}

// `getLogin` resolves the channel's login; `handler(messageId)` gets each first message
async function start(getLogin, handler) {
  onFirst = handler || onFirst;
  const name = String(await getLogin() || '').toLowerCase();
  if (!name) return;
  if (name !== login && ws) { login = name; ws.close(); return; }   // reopens on the new channel
  login = name;
  open();
}

module.exports = { start, parseLine };
