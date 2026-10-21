const test = require('node:test');
const assert = require('node:assert');
const config = require('../server/config');

test('excluded tabs come from .env, comma-separated, with the practice tab as default', () => {
  const saved = process.env.EXCLUDED_TABS;
  try {
    delete process.env.EXCLUDED_TABS;
    assert.deepStrictEqual(config.EXCLUDED_TABS, ['待練勿點']);
    process.env.EXCLUDED_TABS = ' 待練勿點 , 草稿，Draft ,';
    assert.deepStrictEqual(config.EXCLUDED_TABS, ['待練勿點', '草稿', 'Draft']);
    process.env.EXCLUDED_TABS = '';
    assert.deepStrictEqual(config.EXCLUDED_TABS, []);
  } finally {
    if (saved == null) delete process.env.EXCLUDED_TABS; else process.env.EXCLUDED_TABS = saved;
  }
});
