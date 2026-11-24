const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-'));
process.env.BOT_FILE = path.join(dir, 'bot.json');
process.env.TWITCH_BROADCASTER_ID = '1';
process.env.GOOGLE_SHEET_ID = 'SHEET';
const bot = require('../server/bot');

const posted = [];
let session = { live: true, startedAt: Date.now() - 83 * 60000 };
let lang = 'en';
bot.init({
  send: async (text) => { posted.push(text); return { id: 'sent' + posted.length }; },
  session: () => session,
  language: () => lang,
  reserved: () => ['!so ', '!tk', '!watch ', '!stop'],
});
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
test.beforeEach(() => { posted.length = 0; lang = 'en'; session = { live: true, startedAt: Date.now() - 83 * 60000 }; bot._reset(); });

let n = 0;
const chat = (text, { login = 'mika', id = 'u' + login, badges = [] } = {}) => ({
  message_id: 'm' + (++n), chatter_user_id: id, chatter_user_login: login, chatter_user_name: login[0].toUpperCase() + login.slice(1),
  broadcaster_user_name: 'Leihu', message: { text }, badges: badges.map(set_id => ({ set_id })),
});

test('the default !歌單 answers with the sheet link, by name or alias, in any case', async () => {
  assert.strictEqual(await bot.onChat(chat('!歌單')), '🎵 https://docs.google.com/spreadsheets/d/SHEET');
  assert.strictEqual(await bot.onChat(chat('!SONGS please', { login: 'kuma' })), null, 'the 5 s cooldown');
  bot._reset();
  assert.strictEqual(await bot.onChat(chat('!SONGS please')), '🎵 https://docs.google.com/spreadsheets/d/SHEET');
  assert.strictEqual(await bot.onChat(chat('hello !歌單')), null, 'only at the start');
  assert.strictEqual(await bot.onChat(chat('!歌單x')), null, 'the whole word');
  assert.deepStrictEqual(posted.length, 2);
});

test('variables: user, touser, query, count, channel, pick, random; a viewer\'s $(…) stays as typed', async () => {
  bot.addCommand({ name: 'hug', response: '$(user) hugs $(touser)! ($(count)) [$(query)] on $(channel)', cooldown: 0 });
  assert.strictEqual(await bot.onChat(chat('!hug @Kuma  tight')), 'Mika hugs Kuma! (1) [@Kuma tight] on Leihu');
  assert.strictEqual(await bot.onChat(chat('!hug')), 'Mika hugs Mika! (2) [] on Leihu');
  assert.strictEqual(await bot.onChat(chat('!hug $(count)')), 'Mika hugs $(count)! (3) [$(count)] on Leihu');
  const roll = bot.addCommand({ name: '!roll', response: '$(random 5-7) $(pick a | b)', cooldown: 0 });
  for (let i = 0; i < 20; i++) assert.match(await bot.expand(roll.response), /^[5-7] [ab]$/);
  assert.match(await bot.expand('$(random)'), /^\d+$/);
  assert.strictEqual(await bot.expand('$(nope) $(user'), '$(nope) $(user', 'unknown ones are left alone');
});

test('$(uptime) and follow ages in the viewers\' language', async () => {
  assert.strictEqual(await bot.expand('$(uptime)'), '1 h 23 min');
  lang = 'zh-TW';
  assert.strictEqual(await bot.expand('$(uptime)'), '1 小時 23 分鐘');
  session = { live: false, startedAt: 1 };
  assert.strictEqual(await bot.expand('$(uptime)'), '現在沒有在直播');
  const day = 86400000;
  const now = Date.parse('2026-11-24T12:00:00');
  assert.strictEqual(bot.age(Date.parse('2026-11-24T08:00:00'), now), '今天');
  assert.strictEqual(bot.age(now - 3 * day, now), '3 天');
  assert.strictEqual(bot.age(Date.parse('2026-08-20T12:00:00'), now), '3 個月 4 天');
  lang = 'en';
  assert.strictEqual(bot.age(Date.parse('2024-09-01T12:00:00'), now), '2 years 2 months');
  assert.strictEqual(bot.age(Date.parse('2025-11-24T12:00:00'), now), '1 year');
});

test('who may use it, and cooldowns: the command\'s and each viewer\'s', async () => {
  bot.addCommand({ name: '!modonly', response: 'ok', level: 'mod', cooldown: 0 });
  bot.addCommand({ name: '!subs', response: 'ok', level: 'sub', cooldown: 0 });
  assert.strictEqual(await bot.onChat(chat('!modonly')), null);
  assert.strictEqual(await bot.onChat(chat('!modonly', { badges: ['vip'] })), null);
  assert.strictEqual(await bot.onChat(chat('!modonly', { badges: ['moderator'] })), 'ok');
  assert.strictEqual(await bot.onChat(chat('!subs', { badges: ['founder'] })), 'ok');
  assert.strictEqual(await bot.onChat(chat('!subs', { badges: ['vip'] })), 'ok', 'a VIP counts as more than a sub');
  assert.strictEqual(await bot.onChat(chat('!subs')), null);

  bot.addCommand({ name: '!once', response: 'ok', cooldown: 0, userCooldown: 60 });
  assert.strictEqual(await bot.onChat(chat('!once')), 'ok');
  assert.strictEqual(await bot.onChat(chat('!once')), null, 'Mika again');
  assert.strictEqual(await bot.onChat(chat('!once', { login: 'kuma' })), 'ok', 'someone else');
  bot.updateCommand(bot.status().commands.find(c => c.name === '!once').id, { on: false });
  assert.strictEqual(await bot.onChat(chat('!once', { login: 'tora' })), null, 'switched off');
});

test('at most 10 replies in 30 s, whatever the cooldowns', async () => {
  bot.addCommand({ name: '!spam', response: 'x', cooldown: 0 });
  for (let i = 0; i < 12; i++) await bot.onChat(chat('!spam', { login: 'v' + i }));
  assert.strictEqual(posted.length, 10);
});

test('names: "!" is added, one word, not twice, not the app\'s own commands', () => {
  assert.strictEqual(bot.addCommand({ name: ' Lurk ', aliases: 'away, !afk 潛水', response: 'x' }).name, '!lurk');
  assert.deepStrictEqual(bot.status().commands.at(-1).aliases, ['!away', '!afk', '!潛水']);
  const code = fn => { try { fn(); } catch (err) { return err.messageCode; } return null; };
  assert.strictEqual(code(() => bot.addCommand({ name: 'two words' })), 'botBadName');
  assert.strictEqual(code(() => bot.addCommand({ name: '' })), 'botNameMissing');
  assert.strictEqual(code(() => bot.addCommand({ name: '!afk' })), 'botNameTaken');
  assert.strictEqual(code(() => bot.addCommand({ name: '!x', aliases: '!songs' })), 'botNameTaken');
  assert.strictEqual(code(() => bot.addCommand({ name: '!tk' })), 'botNameReserved');
  assert.strictEqual(code(() => bot.addCommand({ name: '!tkx' })), 'botNameReserved', '!tk would take it first');
  assert.strictEqual(code(() => bot.addCommand({ name: '!so' })), 'botNameReserved');
  assert.strictEqual(code(() => bot.addCommand({ name: '!sora' })), null, '"!so " needs the space');
  assert.strictEqual(code(() => bot.addCommand({ name: '!x', response: 'a'.repeat(501) })), 'botTooLong');
});

test('the bot\'s own messages are told apart, by ID or by text before the ID is back', async () => {
  bot.addCommand({ name: '!echo', response: '$(query)', cooldown: 0 });
  await bot.onChat(chat('!echo !stop'));
  assert.deepStrictEqual(posted, ['!stop']);
  // what came back first: the text; then a message with the same words typed by the streamer
  assert.strictEqual(bot.isOwn(chat('!stop', { id: '1', login: 'leihu' })), true);
  assert.strictEqual(bot.isOwn(chat('!stop', { id: '1', login: 'leihu' })), false);
  assert.strictEqual(bot.isOwn(chat('!stop', { login: 'mika' })), false, 'only the streamer\'s account posts for the bot');
  await bot.onChat(chat('!echo hi'));
  assert.strictEqual(bot.isOwn({ ...chat('different', { id: '1' }), message_id: 'sent2' }), true, 'by ID');
});

test('timers: after their minutes and chat lines, live only, one at a time, staggered', async () => {
  const start = Date.now();
  session = { live: false, startedAt: null };
  const a = bot.addTimer({ message: 'A $(sheet)', minutes: 20, minLines: 2 });
  const b = bot.addTimer({ message: 'B', minutes: 20, minLines: 0, liveOnly: false });
  await bot.tick(start);
  assert.strictEqual(await bot.tick(start + 21 * 60000), 'B', 'offline: only the one that runs offline');
  session = { live: true, startedAt: start + 22 * 60000 };
  assert.strictEqual(await bot.tick(start + 22 * 60000), null, 'going live starts them over');
  assert.strictEqual(await bot.tick(start + 43 * 60000), 'B', 'A has no chat lines yet');
  await bot.onChat(chat('hi'));
  await bot.onChat(chat('hello'));
  assert.strictEqual(await bot.tick(start + 44 * 60000), null, 'two minutes between timers');
  assert.strictEqual(await bot.tick(start + 45 * 60000), 'A https://docs.google.com/spreadsheets/d/SHEET');
  assert.deepStrictEqual(posted, ['B', 'B', 'A https://docs.google.com/spreadsheets/d/SHEET']);
  bot.updateTimer(a.id, { on: false });
  bot.remove(b.id);
  assert.strictEqual(await bot.tick(start + 200 * 60000), null);
});

test('settings are saved to bot.json and read back', () => {
  bot.addCommand({ name: '!saved', response: 'yes', level: 'vip', cooldown: 9999 });
  const saved = JSON.parse(fs.readFileSync(process.env.BOT_FILE, 'utf8'));
  const c = saved.commands.find(x => x.name === '!saved');
  assert.deepStrictEqual([c.level, c.cooldown, c.on], ['vip', 3600, true]);
});
