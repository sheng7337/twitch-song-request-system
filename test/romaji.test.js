const test = require('node:test');
const assert = require('node:assert');
const { romanizedTitleMatch: match, kanaToRomaji } = require('../server/romaji');

test('kana are read in Hepburn romaji', () => {
  assert.strictEqual(kanaToRomaji('ハナミズキ'), 'hanamizuki');
  assert.strictEqual(kanaToRomaji('きょう'), 'kyou');
  assert.strictEqual(kanaToRomaji('しゃしん'), 'shashin');
});

test('漢字 titles match their pinyin or Japanese reading', () => {
  assert.ok(match('四照花', 'Shishouka (Chinese Version)'));   // Japanese reading, 國語 song
  assert.ok(match('七里香', 'Qi Li Xiang'));
  assert.ok(match('對不起，我愛你', 'Dui Bu Qi, Wo Ai Ni'));
  assert.ok(match('千本桜', 'Senbonzakura'));                  // voicing: sakura → zakura
  assert.ok(match('学校', 'Gakkou no Uta'));                   // doubled consonant
});

test('mixed 漢字 and かな titles, with okurigana and particles', () => {
  assert.ok(match('夜に駆ける', 'Yoru ni Kakeru'));
  assert.ok(match('打上花火', 'Uchiage Hanabi'));              // okurigana left out
  assert.ok(match('未來へ', 'Mirai e'));
  assert.ok(match('ひまわりの約束', 'Himawari no Yakusoku'));
});

test('only whole words spelling the whole title match', () => {
  assert.ok(!match('ひまわりの約束', 'Himawari'));
  assert.ok(!match('四照花', 'Shishamo live'));
  assert.ok(!match('小幸運', 'A Little Happiness'));           // translations don't count
  assert.ok(!match('花', 'Hana'));                             // one character is too short to trust
  assert.ok(!match('woshang', 'woshang'));                     // nothing to romanize
});
