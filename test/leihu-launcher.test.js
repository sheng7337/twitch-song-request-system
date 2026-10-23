const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

// Leihu's folder is remembered in a temp file, never the real leihu-home.json
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'leihu-launch-'));
process.env.LEIHU_HOME_FILE = path.join(tmp, 'leihu-home.json');
delete process.env.LEIHU_ROOT;
process.env.LOCALAPPDATA = path.join(tmp, 'no-local-app-data');
console.log = console.error = () => {};
const launcher = require('../server/leihu-launcher');

// A fake Leihu install: "pythonw" is Node itself, and app.py is a tiny server that answers
// /api/songs on LIANTAI_PORT, like Leihu's app.py run with --no-browser.
const root = path.join(tmp, 'Leihu');
const pyDir = path.join(root, process.platform === 'win32' ? 'python' : path.join('.venv', 'bin'));
const pyName = process.platform === 'win32' ? 'pythonw.exe' : 'python';
fs.mkdirSync(pyDir, { recursive: true });
try { fs.linkSync(process.execPath, path.join(pyDir, pyName)); } catch { fs.copyFileSync(process.execPath, path.join(pyDir, pyName)); }
fs.writeFileSync(path.join(root, 'app.py'), `
  require('http').createServer((req, res) => res.end(JSON.stringify([]))).listen(Number(process.env.LIANTAI_PORT), '127.0.0.1');
  console.log('args ' + process.argv.slice(2).join(' '));
`);

const freePort = () => new Promise(resolve => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
});

test.after(async () => {
  launcher.stop();
  await new Promise(r => setTimeout(r, 300));   // let the fake Leihu exit before its folder goes
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test("without a known folder, starting Leihu says how to fix it", async () => {
  const base = `http://127.0.0.1:${await freePort()}`;
  await assert.rejects(launcher.start(base), e => e.messageCode === 'leihuNotFound');
});

test("Leihu's folder is remembered, and Leihu starts there without its window and closes on request", async () => {
  launcher.remember(root);
  assert.strictEqual(launcher.findRoot(), root);
  assert.strictEqual(launcher.findPython(root), path.join(pyDir, pyName));

  const base = `http://127.0.0.1:${await freePort()}`;
  try {
    assert.deepStrictEqual(await launcher.start(base), { started: true });
    assert.deepStrictEqual(launcher.status(), { launched: true, starting: false });
    // Tied to this process, without a browser, logging to Leihu's logs/app.log
    await new Promise(r => setTimeout(r, 200));
    assert.match(fs.readFileSync(path.join(root, 'logs', 'app.log'), 'utf8'), new RegExp(`args --no-browser --parent-pid ${process.pid}`));

    // Already running: nothing more is started
    assert.deepStrictEqual(await launcher.start(base), { started: false });
  } finally {
    assert.strictEqual(launcher.stop(), true);
  }
  assert.deepStrictEqual(launcher.status(), { launched: false, starting: false });
  assert.strictEqual(launcher.stop(), false, 'a Leihu the song queue did not start is left alone');
});

test('a Leihu that exits during start is reported with its log folder', async () => {
  const broken = path.join(tmp, 'Broken');
  fs.mkdirSync(path.dirname(path.join(broken, path.relative(root, pyDir), pyName)), { recursive: true });
  fs.copyFileSync(path.join(pyDir, pyName), path.join(broken, path.relative(root, pyDir), pyName));
  fs.writeFileSync(path.join(broken, 'app.py'), 'process.exit(1)');
  process.env.LEIHU_ROOT = broken;
  try {
    const base = `http://127.0.0.1:${await freePort()}`;
    await assert.rejects(launcher.start(base), e => e.messageCode === 'leihuStartFailed' && e.messageParams.root === broken);
  } finally {
    delete process.env.LEIHU_ROOT;
  }
});
