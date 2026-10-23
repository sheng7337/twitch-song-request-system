// server/leihu-launcher.js
// Starts Leihu Singsing without its own window, so it shows only in the dashboard's Leihu tab.
// It runs Leihu's app.py the way Leihu's desktop.py does (--no-browser, log in Leihu's
// logs/app.log), with --parent-pid of this process: Leihu closes when the song queue closes.
// Leihu's own shortcut still works alongside: its desktop.py reuses a running server.
//
// Leihu's folder: LEIHU_ROOT in .env, else the folder Leihu reported last time it ran
// (leihu.js calls remember(), kept in leihu-home.json), else Leihu's default install folder.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const { UserError } = require('./messages');

const HOME_PATH = process.env.LEIHU_HOME_FILE || path.join(__dirname, '..', 'leihu-home.json');   // tests use a temp file
const START_TIMEOUT_MS = 120000;   // first start loads the AI models' libraries

let child = null;      // Leihu's server, when this process started it
let starting = null;   // promise of a start in progress

function savedRoot() {
  try { return JSON.parse(fs.readFileSync(HOME_PATH, 'utf8')).root || null; } catch { return null; }
}

// Leihu's /api/status reports its folder; keep it for the next start.
function remember(root) {
  if (!root || root === savedRoot()) return;
  try { fs.writeFileSync(HOME_PATH, JSON.stringify({ root }, null, 2)); } catch (err) {
    console.error('[leihu] Could not save Leihu\'s folder:', err.message);
  }
}

function findRoot() {
  const local = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'LeihuLiantai');
  return [(process.env.LEIHU_ROOT || '').trim(), savedRoot(), local]
    .find(r => r && fs.existsSync(path.join(r, 'app.py'))) || null;
}

// pythonw: no console window. Packaged Leihu ships python\; a source install runs from .venv or venv.
function findPython(root) {
  const candidates = process.platform === 'win32'
    ? ['python\\pythonw.exe', '.venv\\Scripts\\pythonw.exe', 'venv\\Scripts\\pythonw.exe',
      'python\\python.exe', '.venv\\Scripts\\python.exe', 'venv\\Scripts\\python.exe']
    : ['.venv/bin/python', 'venv/bin/python'];
  return candidates.map(p => path.join(root, p)).find(p => fs.existsSync(p)) || null;
}

async function reachable(baseUrl) {
  try {
    await axios.get(`${baseUrl}/api/songs`, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

// Starts Leihu unless it already runs. Resolves when Leihu answers.
async function start(baseUrl) {
  if (starting) return starting;
  if (await reachable(baseUrl)) return { started: false };
  starting = launch(baseUrl).finally(() => { starting = null; });
  return starting;
}

async function launch(baseUrl) {
  const root = findRoot();
  if (!root) throw new UserError('leihuNotFound', {}, 'Leihu Singsing was not found — open it once from its own shortcut, or set LEIHU_ROOT in .env');
  const python = findPython(root);
  if (!python) throw new UserError('leihuPythonMissing', { root }, `Leihu Singsing's Python was not found in ${root}`);
  const port = new URL(baseUrl).port || '8765';
  fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
  const log = fs.openSync(path.join(root, 'logs', 'app.log'), 'a');
  try {
    child = spawn(python, [path.join(root, 'app.py'), '--no-browser', '--parent-pid', String(process.pid)], {
      cwd: root, windowsHide: true, stdio: ['ignore', log, log],
      env: { ...process.env, LIANTAI_PORT: port, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
    });
  } finally {
    fs.closeSync(log);
  }
  const proc = child;
  let exited = false;
  proc.on('exit', () => { exited = true; if (child === proc) child = null; });
  proc.on('error', () => { exited = true; if (child === proc) child = null; });
  console.log(`[leihu] Starting Leihu Singsing without its window (${root})`);
  const end = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < end) {
    if (exited) break;
    if (await reachable(baseUrl)) return { started: true };
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!exited) proc.kill();
  throw new UserError('leihuStartFailed', { root }, `Leihu Singsing did not start — see logs\\app.log in ${root}`);
}

// Closes Leihu, only when this process started it.
function stop() {
  if (!child) return false;
  child.kill();
  child = null;
  console.log('[leihu] Closed Leihu Singsing');
  return true;
}

// For the dashboard: { launched } — this process started Leihu (and can close it); { starting }.
function status() {
  return { launched: !!child, starting: !!starting };
}

module.exports = { start, stop, status, remember, findRoot, findPython };
