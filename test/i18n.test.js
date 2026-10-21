const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const I18N = require('../shared/i18n');

const TABLES = {
  'shared/i18n-server.js': require('../shared/i18n-server'),
  'shared/i18n-viewer.js': require('../shared/i18n-viewer'),
  'dashboard/i18n-dashboard.js': require('../dashboard/i18n-dashboard'),
  'dashboard/i18n-links.js': require('../dashboard/i18n-links'),
};

// The setup wizard keeps its own table (STRINGS in setup/i18n.js)
function wizardStrings() {
  const ctx = vm.createContext({ I18N: { getLang: () => 'en', setLang() {} } });
  vm.runInContext(read('setup/i18n.js') + '\n;this.__strings = STRINGS;', ctx);
  return ctx.__strings;
}

// Every leaf as "key → value"
function leaves(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) leaves(v, key, out);
    else out[key] = v;
  }
  return out;
}
const placeholders = v => typeof v === 'string' ? [...v.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort() : null;

test('every string table has the same keys and placeholders in English and Chinese', () => {
  for (const [file, table] of Object.entries({ ...TABLES, 'setup/i18n.js': wizardStrings() })) {
    const en = leaves(table.en);
    const zh = leaves(table['zh-TW']);
    assert.deepStrictEqual(Object.keys(zh).sort(), Object.keys(en).sort(), `${file}: keys differ`);
    for (const key of Object.keys(en)) {
      assert.strictEqual(typeof zh[key], typeof en[key], `${file}: ${key} is a ${typeof en[key]} in English`);
      if (Array.isArray(en[key])) assert.strictEqual(zh[key].length, en[key].length, `${file}: ${key} has a different number of lines`);
      assert.deepStrictEqual(placeholders(zh[key]), placeholders(en[key]), `${file}: ${key} placeholders differ`);
    }
  }
});

test('every key a page uses exists', () => {
  for (const t of Object.values(TABLES)) I18N.register(t);
  const pages = ['dashboard/index.html', 'dashboard/links.html', 'overlay/index.html', 'clip-player/index.html'];
  for (const page of pages) {
    const src = read(page);
    const keys = [
      ...[...src.matchAll(/data-i18n(?:-html|-title|-placeholder|-aria-label)?="([\w.-]+)"/g)].map(m => m[1]),
      ...[...src.matchAll(/\b(?:t|tHtml|I18N\.t)\('([\w.]+)'/g)].map(m => m[1]),
    ];
    assert.ok(keys.length, `${page}: no translated strings found`);
    // 'group.' + variable is a dynamic key; its variants are checked by the tables' own test
    for (const key of keys.filter(k => !k.endsWith('.'))) assert.ok(I18N.has(key), `${page}: missing string "${key}"`);
  }
});

test('every message code the server sends has a translation', () => {
  const server = leaves(TABLES['shared/i18n-server.js'].en.server);
  const files = fs.readdirSync(path.join(ROOT, 'server')).filter(f => f.endsWith('.js')).map(f => `server/${f}`);
  const codes = new Set();
  for (const f of files) {
    const src = read(f);
    for (const m of src.matchAll(/(?:new UserError|message|setNote)\((?:s, |d\.s, )?'(\w+)'/g)) codes.add(m[1]);
    for (const m of src.matchAll(/(?:noteCode|errorCode): '(\w+)'/g)) codes.add(m[1]);
  }
  assert.ok(codes.size > 20, 'expected to find the server message codes');
  for (const code of codes) assert.ok(code in server, `no translation for server message "${code}"`);
});

test('strings fill in placeholders, fall back to English, and escape for HTML', () => {
  I18N.register({ en: { x: { hi: 'hi {name}', only: 'english only' } }, 'zh-TW': { x: { hi: '你好 {name}' } } });
  I18N.setLang('zh-TW');
  assert.strictEqual(I18N.t('x.hi', { name: 'A' }), '你好 A');
  assert.strictEqual(I18N.t('x.only'), 'english only');
  assert.strictEqual(I18N.tHtml('x.hi', { name: '<b>' }), '你好 &lt;b&gt;');
  assert.strictEqual(I18N.server({ error: 'raw', code: 'notYouTube' }), '這不是 YouTube 影片連結');
  assert.strictEqual(I18N.server({ error: 'raw English' }), 'raw English');
  I18N.setLang('en');
});
