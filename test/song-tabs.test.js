const test = require('node:test');
const assert = require('node:assert');
const songTabs = require('../server/song-tabs');

test('the random pick mode is weighted unless .env says pure', () => {
  assert.strictEqual(songTabs.pickMode({}), 'weighted');
  assert.strictEqual(songTabs.pickMode({ RANDOM_PICK_MODE: 'Pure' }), 'pure');
  assert.strictEqual(songTabs.pickMode({ RANDOM_PICK_MODE: 'odd' }), 'weighted');
  assert.strictEqual(songTabs.parsePickMode('pure'), 'pure');
  assert.throws(() => songTabs.parsePickMode('odd'), { messageCode: 'pickModeBad' });
});

test('the practice tab: PRACTICE_TAB, else the first of the old EXCLUDED_TABS, else 待練勿點', () => {
  assert.strictEqual(songTabs.practiceTab({}), '待練勿點');
  assert.strictEqual(songTabs.practiceTab({ PRACTICE_TAB: ' 草稿 ' }), '草稿');
  assert.strictEqual(songTabs.practiceTab({ PRACTICE_TAB: '' }), '');
  assert.strictEqual(songTabs.practiceTab({ EXCLUDED_TABS: '練習，Draft' }), '練習');
  assert.strictEqual(songTabs.practiceTab({ EXCLUDED_TABS: '' }), '');
  assert.strictEqual(songTabs.practiceTab({ PRACTICE_TAB: 'A', EXCLUDED_TABS: 'B' }), 'A');
});

test('requests and random picks take the chosen tabs, or every tab but the practice tab', () => {
  const env = { PRACTICE_TAB: '待練勿點' };
  assert.strictEqual(songTabs.canRequest('日語', env), true);
  assert.strictEqual(songTabs.canRequest('待練勿點', env), false);
  const chosen = { ...env, TWITCH_REWARD_TABS: '["國語"]' };
  assert.strictEqual(songTabs.canRequest('國語', chosen), true);
  assert.strictEqual(songTabs.canRequest('日語', chosen), false);
  assert.strictEqual(songTabs.takes('日語', [], env), true);
  assert.strictEqual(songTabs.takes('日語', ['English'], env), false);
  assert.strictEqual(songTabs.takes('待練勿點', ['待練勿點'], env), false);   // never the practice tab
  assert.deepStrictEqual(songTabs.requestTabs({ TWITCH_REWARD_TABS: 'oops' }), []);
});

test('the practice tab saved is one of the sheet\'s tabs, or none', () => {
  assert.strictEqual(songTabs.parsePracticeTab(' 草稿 ', ['國語', '草稿']), '草稿');
  assert.strictEqual(songTabs.parsePracticeTab('', ['國語']), '');
  assert.throws(() => songTabs.parsePracticeTab('沒有', ['國語']), { messageCode: 'practiceTabMissing' });
  assert.deepStrictEqual(songTabs.cleanTabs([' 日語 ', '日語', '']), ['日語']);
  assert.throws(() => songTabs.cleanTabs('日語'), { messageCode: 'tabsBad' });
});

test('EXCLUDED_TABS moves once: its first tab is the practice tab, the others stay out by name', () => {
  const tabs = ['國語', '日語', '草稿', '待練勿點'];
  assert.deepStrictEqual(songTabs.migrate({}, tabs), {});
  assert.deepStrictEqual(songTabs.migrate({ PRACTICE_TAB: 'x', EXCLUDED_TABS: 'y' }, tabs), {});
  assert.deepStrictEqual(songTabs.migrate({ EXCLUDED_TABS: '待練勿點' }, tabs), { PRACTICE_TAB: '待練勿點' });
  assert.deepStrictEqual(songTabs.migrate({ EXCLUDED_TABS: '' }, tabs), { PRACTICE_TAB: '' });
  const v = songTabs.migrate({
    EXCLUDED_TABS: '待練勿點,草稿',
    TWITCH_RANDOM_REWARDS: JSON.stringify([{ id: 'a', tabs: [] }, { id: 'b', tabs: ['日語'] }]),
  }, tabs);
  assert.strictEqual(v.PRACTICE_TAB, '待練勿點');
  assert.deepStrictEqual(JSON.parse(v.TWITCH_REWARD_TABS), ['國語', '日語']);
  assert.deepStrictEqual(JSON.parse(v.TWITCH_RANDOM_REWARDS), [{ id: 'a', tabs: ['國語', '日語'] }, { id: 'b', tabs: ['日語'] }]);
  // 🎤 tabs already chosen stay
  assert.strictEqual(songTabs.migrate({ EXCLUDED_TABS: '待練勿點,草稿', TWITCH_REWARD_TABS: '["日語"]' }, tabs).TWITCH_REWARD_TABS, undefined);
});
