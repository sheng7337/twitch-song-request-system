// server/stream-window.js
// Opens the dashboard in its own browser window for streaming: Chrome (or Edge) started with a
// data folder of its own runs as a separate copy of the browser, so OBS's Application Audio
// Capture can take the Leihu tab's sound from that window alone — other tabs and the everyday
// browser stay out of the stream. Logins, bookmarks and extensions aren't shared; the dashboard
// needs none of them.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { UserError } = require('./messages');

function dataDir() {
  return path.join(process.env.LOCALAPPDATA || '', 'SongRequestDashboard', 'stream-window');
}

// Chrome first, then Edge (always on Windows)
function findBrowser() {
  if (process.platform !== 'win32') return null;
  const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const exes = ['Google\\Chrome\\Application\\chrome.exe', 'Microsoft\\Edge\\Application\\msedge.exe'];
  for (const exe of exes) {
    for (const root of roots) {
      const p = path.join(root, exe);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

// Opening it again while it's open just brings up another window of the same copy
function open(url) {
  const browser = findBrowser();
  if (!browser) throw new UserError('streamWindowNoBrowser', {}, 'Chrome or Edge was not found on this PC');
  fs.mkdirSync(dataDir(), { recursive: true });
  const proc = spawn(browser, [`--user-data-dir=${dataDir()}`, '--no-first-run', '--no-default-browser-check',
    `--app=${url}`], { detached: true, stdio: 'ignore' });
  proc.on('error', err => console.error('[stream-window] Could not open the stream window:', err.message));
  proc.unref();
  console.log(`[stream-window] Opened the dashboard in its own window (${path.basename(browser)})`);
  return { browser: path.basename(browser, '.exe') };
}

// Links the stream window can't use — the setup wizard and Twitch's own pages need your usual
// browser's Twitch login — open there instead. Only those two, so a page can't open anything else.
function isForUsualBrowser(url, port) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol === 'https:' && ['twitch.tv', 'www.twitch.tv', 'dashboard.twitch.tv'].includes(u.hostname)) return true;
  return u.protocol === 'http:' && u.host === `localhost:${port}` && (u.pathname === '/setup' || u.pathname.startsWith('/setup/'));
}

function openInUsualBrowser(url, port) {
  if (!isForUsualBrowser(url, port)) throw new UserError('streamWindowLink', {}, "That link can't be opened from here");
  if (process.platform !== 'win32') throw new UserError('streamWindowNoBrowser', {}, 'Chrome or Edge was not found on this PC');
  // Windows' "open this link" handler: the default browser. (explorer.exe <url> opens File Explorer
  // instead for some links.) No shell, so ? and & in the link stay as they are.
  spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  return { ok: true };
}

module.exports = { open, findBrowser, openInUsualBrowser, isForUsualBrowser };
