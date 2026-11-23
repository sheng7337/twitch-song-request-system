// server/song-tabs.js
// Which sheet tabs each use takes. Every tab is read (sheets.js), so Leihu prepares and the 🔗 link
// finder searches them all. Then:
//   - the practice tab (PRACTICE_TAB, Song Queue ⚙): where Pending's "＋ Add to" puts songs; never
//     requested or drawn, so songs still being practised stay out of the stream
//   - 🎤 song requests (TWITCH_REWARD_TABS, a JSON list, 🎟️ Rewards tab): the tabs a request is matched
//     against; a song in another tab is off the list (Pending)
//   - each 🎲 random reward (its `tabs` in TWITCH_RANDOM_REWARDS): the tabs it draws from
// An empty list = every tab but the practice tab, so a tab added to the sheet later is in.
// Also how the random reward picks (RANDOM_PICK_MODE).
//
// Before 2026.11-4, EXCLUDED_TABS listed the tabs left out of everything, the first being where
// "＋ Add to" put songs. migrate() turns it into the above once.

const { UserError } = require('./messages');

const PICK_MODES = ['weighted', 'pure'];
const DEFAULT_PRACTICE_TAB = '待練勿點';

function pickMode(env = process.env) {
  const mode = String(env.RANDOM_PICK_MODE || '').toLowerCase();
  return PICK_MODES.includes(mode) ? mode : 'weighted';
}

function parsePickMode(mode) {
  if (!PICK_MODES.includes(mode)) throw new UserError('pickModeBad', {}, `randomPickMode must be one of ${PICK_MODES.join(', ')}`);
  return mode;
}

const legacyList = v => String(v).split(/[,，]/).map(s => s.trim()).filter(Boolean);

// The practice tab, or '' for none. Until migrated: the first of EXCLUDED_TABS.
function practiceTab(env = process.env) {
  if (env.PRACTICE_TAB != null) return String(env.PRACTICE_TAB).trim();
  if (env.EXCLUDED_TABS != null) return legacyList(env.EXCLUDED_TABS)[0] || '';
  return DEFAULT_PRACTICE_TAB;
}

// The tabs 🎤 song requests take ([] = every tab but the practice tab)
function requestTabs(env = process.env) {
  try { const l = JSON.parse(env.TWITCH_REWARD_TABS || '[]'); return Array.isArray(l) ? l.map(String) : []; } catch { return []; }
}

// Is a song in `tab` in a use that takes `chosen` tabs ([] = every tab but the practice tab)?
function takes(tab, chosen, env = process.env) {
  if (tab === practiceTab(env)) return false;
  return !(chosen && chosen.length) || chosen.includes(tab);
}

const canRequest = (tab, env = process.env) => takes(tab, requestTabs(env), env);

// A list of tab names from the dashboard: trimmed, no repeats
function cleanTabs(tabs) {
  if (!Array.isArray(tabs)) throw new UserError('tabsBad', {}, 'tabs must be a list of tab names');
  return [...new Set(tabs.map(n => String(n).trim()).filter(Boolean))];
}

// The practice tab to save: one of the sheet's tabs, or '' for none
function parsePracticeTab(name, sheetTabs) {
  const tab = String(name ?? '').trim();
  if (tab && !sheetTabs.includes(tab)) throw new UserError('practiceTabMissing', { tab }, `The tab "${tab}" is not in the song sheet`);
  return tab;
}

// EXCLUDED_TABS (before 2026.11-4) → the .env values that keep the same tabs in each use, or {} when
// there's nothing to move. Its first tab becomes the practice tab; the others were left out of
// requests and random picks too, so 🎤 and each 🎲 that took every tab get every other tab, by name.
function migrate(env, sheetTabs) {
  if (env.PRACTICE_TAB != null || env.EXCLUDED_TABS == null) return {};
  const [first = '', ...others] = legacyList(env.EXCLUDED_TABS);
  const values = { PRACTICE_TAB: first };
  if (others.length && sheetTabs.length) {
    const rest = sheetTabs.filter(t => t !== first && !others.includes(t));
    if (!requestTabs(env).length) values.TWITCH_REWARD_TABS = JSON.stringify(rest);
    let random = [];
    try { random = JSON.parse(env.TWITCH_RANDOM_REWARDS || '[]'); } catch {}
    if (Array.isArray(random) && random.some(r => !(r.tabs && r.tabs.length))) {
      values.TWITCH_RANDOM_REWARDS = JSON.stringify(random.map(r => r.tabs && r.tabs.length ? r : { ...r, tabs: rest }));
    }
  }
  return values;
}

module.exports = {
  PICK_MODES, DEFAULT_PRACTICE_TAB, pickMode, parsePickMode,
  practiceTab, requestTabs, takes, canRequest, cleanTabs, parsePracticeTab, migrate,
};
