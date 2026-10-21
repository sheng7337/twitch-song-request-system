// shared/i18n.js — language helper for the web pages: English ('en') and
// Traditional Chinese, Taiwan ('zh-TW').
//
// Each page registers its own string table, I18N.register({ en: {...}, 'zh-TW': {...} }),
// and looks strings up with I18N.t('group.key', { name: value }). A string can hold
// {name} placeholders, or be a function of the params (plurals, longer sentences).
// Fixed markup is translated through attributes, filled in by I18N.apply():
//   data-i18n="key"              → textContent
//   data-i18n-html="key"         → innerHTML (only for our own strings with <b> etc.)
//   data-i18n-title / -placeholder / -aria-label="key" → that attribute
//
// Streamer pages share one saved choice (localStorage 'ui_lang'); the first visit follows
// the browser language. OBS pages (overlay, clip player) get theirs from the server's
// overlay-language setting instead and don't save it.
//
// Also loadable from Node (module.exports) so tests can compare the tables.

(function (root) {
  const LANGS = ['en', 'zh-TW'];
  const STORE_KEY = 'ui_lang';
  const tables = { en: {}, 'zh-TW': {} };
  const listeners = [];

  function storageGet(k) { try { return root.localStorage.getItem(k); } catch { return null; } }
  function storageSet(k, v) { try { root.localStorage.setItem(k, v); } catch { /* private mode */ } }

  // ?lang= → saved choice (the setup wizard's older key too) → browser language
  function detect() {
    try {
      const fromUrl = new URLSearchParams(root.location.search).get('lang');
      if (LANGS.includes(fromUrl)) return fromUrl;
    } catch { /* not in a browser */ }
    const saved = storageGet(STORE_KEY) || storageGet('setup_lang');
    if (LANGS.includes(saved)) return saved;
    const browser = (root.navigator && root.navigator.language) || '';
    return /^zh/i.test(browser) ? 'zh-TW' : 'en';
  }

  let lang = root.document ? detect() : 'en';

  function merge(into, from) {
    for (const [k, v] of Object.entries(from)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) merge(into[k] = into[k] || {}, v);
      else into[k] = v;
    }
  }

  function register(table) {
    for (const l of LANGS) if (table[l]) merge(tables[l], table[l]);
  }

  function lookup(l, key) {
    let v = tables[l];
    for (const part of key.split('.')) {
      if (v == null) return undefined;
      v = v[part];
    }
    return v;
  }

  function has(key) {
    return lookup(lang, key) !== undefined || lookup('en', key) !== undefined;
  }

  function format(v, params) {
    if (typeof v === 'function') return String(v(params || {}));
    return String(v).replace(/\{(\w+)\}/g, (m, name) => (params && name in params ? String(params[name]) : m));
  }

  // Plain text. Falls back to English, then to the key itself.
  function t(key, params) {
    const v = lookup(lang, key) ?? lookup('en', key);
    return v === undefined ? key : format(v, params);
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // For innerHTML: our string may contain markup, the params (song titles, names) are escaped.
  function tHtml(key, params) {
    const safe = {};
    for (const [k, v] of Object.entries(params || {})) safe[k] = escapeHtml(v);
    return t(key, safe);
  }

  // A message from our server: its `code` translated when we know it, else its English text.
  function server(data, fallbackKey) {
    if (data && data.code && has('server.' + data.code)) return t('server.' + data.code, data.params || {});
    if (data && data.error) return data.error;
    return fallbackKey ? t(fallbackKey) : '';
  }

  function apply(scope) {
    const rootEl = scope || root.document;
    if (!rootEl) return;
    for (const el of rootEl.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of rootEl.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
    for (const [attr, data] of [['title', 'i18nTitle'], ['placeholder', 'i18nPlaceholder'], ['aria-label', 'i18nAriaLabel']]) {
      for (const el of rootEl.querySelectorAll(`[data-i18n-${attr}]`)) el.setAttribute(attr, t(el.dataset[data]));
    }
  }

  // OBS pages pass `save: false` (their language comes from the server setting) and
  // `tagPage: false`: the page's lang attribute changes which system font Chromium picks for
  // Chinese characters (OBS's browser falls back to serif 細明體 under zh-TW), so the overlay
  // keeps lang="en" and renders Chinese exactly as the English version does.
  function setLang(l, { save = true, tagPage = true } = {}) {
    if (!LANGS.includes(l)) return;
    const changed = l !== lang;
    lang = l;
    if (save) storageSet(STORE_KEY, l);
    if (root.document) {
      if (tagPage) root.document.documentElement.lang = l;
      apply();
      for (const el of root.document.querySelectorAll('.lang-switch')) renderSwitch(el);
    }
    if (changed) for (const fn of listeners) fn(l);
  }

  function getLang() { return lang; }
  function onChange(fn) { listeners.push(fn); }

  // EN / 中文 buttons, put into any element with class "lang-switch".
  function renderSwitch(el) {
    el.innerHTML = LANGS.map(l =>
      `<button type="button" class="lang-btn${l === lang ? ' active' : ''}" data-lang="${l}" aria-pressed="${l === lang}">${l === 'en' ? 'EN' : '中文'}</button>`).join('');
    el.onclick = (e) => { const b = e.target.closest('[data-lang]'); if (b) setLang(b.dataset.lang); };
  }

  // Call once the page's tables are registered: translates the markup and the switches.
  function init() {
    if (!root.document) return;
    root.document.documentElement.lang = lang;
    apply();
    for (const el of root.document.querySelectorAll('.lang-switch')) renderSwitch(el);
  }

  const api = { LANGS, register, t, tHtml, has, server, apply, setLang, getLang, onChange, init, escapeHtml, _tables: tables };
  root.I18N = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
