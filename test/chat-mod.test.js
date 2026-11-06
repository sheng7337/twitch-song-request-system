const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const { stubModule } = require('./helpers');

// Twitch is faked: nobody is banned, raided or pinned for real
stubModule('twitch.js', { ensureFreshToken: async () => {} });
const chatMod = require('../server/chat-mod');
process.env.TWITCH_BROADCASTER_ID = '42';
const realRequest = axios.request, realGet = axios.get;
test.after(() => { axios.request = realRequest; axios.get = realGet; });

const USERS = { kuma: { id: '7', login: 'kuma', display_name: 'Kuma' }, me: { id: '42', login: 'me', display_name: 'Me' } };

function twitchError(status, message) {
  return Object.assign(new Error(message), { response: { status, data: { message } } });
}

// Fakes Helix: /users answers from USERS; `reply(call)` answers the rest (an Error is thrown)
function fakeTwitch(reply = () => ({})) {
  const calls = [];
  axios.request = async (cfg) => {
    const path = cfg.url.replace('https://api.twitch.tv/helix', '');
    if (path === '/users') return { data: { data: USERS[cfg.params.login] ? [USERS[cfg.params.login]] : [] } };
    const call = { method: cfg.method, path, params: cfg.params, data: cfg.data };
    calls.push(call);
    const result = reply(call);
    if (result instanceof Error) throw result;
    return { data: result };
  };
  return calls;
}

test('bans, times out and unbans by channel name', async () => {
  const calls = fakeTwitch(c => c.method === 'post' ? { data: [{ end_time: c.data.data.duration ? '2026-11-05T10:10:00Z' : null }] } : {});
  assert.deepStrictEqual(await chatMod.ban('@Kuma', { reason: 'spam' }), { name: 'Kuma', until: null });
  assert.deepStrictEqual(await chatMod.ban('kuma', { seconds: 600 }), { name: 'Kuma', until: Date.parse('2026-11-05T10:10:00Z') });
  assert.deepStrictEqual(await chatMod.unban('kuma'), { name: 'Kuma' });
  assert.deepStrictEqual(calls.map(c => [c.method, c.path, c.data]), [
    ['post', '/moderation/bans', { data: { user_id: '7', reason: 'spam' } }],
    ['post', '/moderation/bans', { data: { user_id: '7', reason: '', duration: 600 } }],
    ['delete', '/moderation/bans', undefined],
  ]);
  assert.deepStrictEqual(calls[2].params, { broadcaster_id: '42', moderator_id: '42', user_id: '7' });
});

test('says why a ban or unban did not happen', async () => {
  fakeTwitch();
  await assert.rejects(chatMod.ban('nobody_here'), { messageCode: 'modUserNotFound', messageParams: { login: 'nobody_here' } });
  await assert.rejects(chatMod.ban('bad name!'), { messageCode: 'modUserNotFound' });
  await assert.rejects(chatMod.ban('kuma', { seconds: 0 }), { messageCode: 'modBadDuration' });
  await assert.rejects(chatMod.ban('kuma', { seconds: 15 * 86400 }), { messageCode: 'modBadDuration' });
  await assert.rejects(chatMod.ban('kuma', { reason: 'x'.repeat(501) }), { messageCode: 'modReasonTooLong' });
  fakeTwitch(() => twitchError(400, 'user is already banned'));
  await assert.rejects(chatMod.ban('kuma'), { messageCode: 'modAlreadyBanned', messageParams: { name: 'Kuma' } });
  fakeTwitch(() => twitchError(400, 'The user specified in the user_id field may not be banned.'));
  await assert.rejects(chatMod.ban('kuma'), { messageCode: 'modCantBan' });
  fakeTwitch(() => twitchError(400, 'user is not banned'));
  await assert.rejects(chatMod.unban('kuma'), { messageCode: 'modNotBanned' });
  fakeTwitch(() => twitchError(401, 'Missing scope: moderator:manage:banned_users'));
  await assert.rejects(chatMod.unban('kuma'), { messageCode: 'modNoPermission' });
  fakeTwitch(() => twitchError(429, 'Too Many Requests'));
  await assert.rejects(chatMod.ban('kuma'), { messageCode: 'modTooFast' });
  fakeTwitch(() => twitchError(400, 'something new'));
  await assert.rejects(chatMod.ban('kuma'), { messageCode: 'modFailed', messageParams: { message: 'something new' } });
});

test('Twitch Shoutout: only while live, never to yourself', async () => {
  const calls = fakeTwitch();
  await chatMod.twitchShoutout('7');
  assert.deepStrictEqual(calls[0].params, { from_broadcaster_id: '42', to_broadcaster_id: '7', moderator_id: '42' });
  await assert.rejects(chatMod.twitchShoutout('42'), { messageCode: 'shoutoutSelf' });
  fakeTwitch(() => twitchError(400, 'The broadcaster is not streaming live or does not have one or more viewers.'));
  await assert.rejects(chatMod.twitchShoutout('7'), { messageCode: 'shoutoutNotLive' });
});

test('raids, cancels, and says why not', async () => {
  const calls = fakeTwitch(c => c.method === 'post' ? { data: [{ created_at: '2026-11-05T10:00:00Z', is_mature: false }] } : {});
  assert.deepStrictEqual(await chatMod.raid('kuma'), { name: 'Kuma', login: 'kuma', createdAt: Date.parse('2026-11-05T10:00:00Z') });
  assert.deepStrictEqual(await chatMod.cancelRaid(), { ok: true });
  assert.deepStrictEqual(calls.map(c => [c.method, c.path, c.params]), [
    ['post', '/raids', { from_broadcaster_id: '42', to_broadcaster_id: '7' }],
    ['delete', '/raids', { broadcaster_id: '42' }],
  ]);
  await assert.rejects(chatMod.raid('me'), { messageCode: 'modRaidSelf' });
  fakeTwitch(() => twitchError(409, 'The broadcaster is already in the process of raiding another channel.'));
  await assert.rejects(chatMod.raid('kuma'), { messageCode: 'modRaidBusy' });
  fakeTwitch(() => twitchError(400, 'The targeted channel doesn\'t accept raids from this broadcaster.'));
  await assert.rejects(chatMod.raid('kuma'), { messageCode: 'modRaidRefused', messageParams: { name: 'Kuma' } });
  fakeTwitch(() => twitchError(404, 'No pending raid'));
  await assert.rejects(chatMod.cancelRaid(), { messageCode: 'modNoRaid' });
});

test('a channel to raid: live or not, and its viewers', async () => {
  fakeTwitch(() => ({ data: [{ viewer_count: 12, game_name: 'Just Chatting' }] }));
  assert.deepStrictEqual(await chatMod.channel('Kuma'), { login: 'kuma', name: 'Kuma', live: true, viewers: 12, game: 'Just Chatting' });
  fakeTwitch(() => ({ data: [] }));
  assert.strictEqual((await chatMod.channel('kuma')).live, false);
});

test('pins for a while or until the stream ends, unpins, reads the pinned message', async () => {
  const pin = { message_id: 'm1', sender_user_login: 'kuma', sender_user_name: 'Kuma', message: { text: 'hi' }, ends_at: '2026-11-05T10:05:00Z' };
  const calls = fakeTwitch(c => c.method === 'get' ? { data: [pin] } : {});
  assert.deepStrictEqual(await chatMod.pin('m1', 300), { id: 'm1', name: 'Kuma', login: 'kuma', text: 'hi', endsAt: Date.parse('2026-11-05T10:05:00Z') });
  await chatMod.pin('m1');
  await chatMod.unpin('m1');
  assert.deepStrictEqual(calls.filter(c => c.method !== 'get').map(c => [c.method, c.params]), [
    ['put', { broadcaster_id: '42', moderator_id: '42', message_id: 'm1', duration_seconds: 300 }],
    ['put', { broadcaster_id: '42', moderator_id: '42', message_id: 'm1' }],
    ['delete', { broadcaster_id: '42', moderator_id: '42', message_id: 'm1' }],
  ]);
  await assert.rejects(chatMod.pin('m1', 10), { messageCode: 'pinBadDuration' });
  await assert.rejects(chatMod.pin('m1', 3600), { messageCode: 'pinBadDuration' });
  fakeTwitch(() => twitchError(404, 'not found'));
  await assert.rejects(chatMod.pin('m2'), { messageCode: 'pinNotFound' });
  await assert.rejects(chatMod.unpin('m2'), { messageCode: 'pinGone' });
  assert.strictEqual(await chatMod.pinned(), null);
  fakeTwitch(() => ({ data: [] }));
  assert.strictEqual(await chatMod.pinned(), null);
});

test('which buttons the token allows, read again after authorizing again', async () => {
  process.env.TWITCH_USER_ACCESS_TOKEN = 'old';
  axios.get = async () => ({ data: { scopes: ['user:write:chat', 'channel:manage:raids'] } });
  assert.deepStrictEqual(await chatMod.permissions(), { ban: false, shoutout: false, raid: true, pin: false });
  process.env.TWITCH_USER_ACCESS_TOKEN = 'new';
  axios.get = async () => ({ data: { scopes: Object.values(chatMod.SCOPES) } });
  assert.deepStrictEqual(await chatMod.permissions(), { ban: true, shoutout: true, raid: true, pin: true });
});
