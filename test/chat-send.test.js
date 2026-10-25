const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const { stubModule } = require('./helpers');

// Twitch is faked: nothing is posted to a real chat
stubModule('twitch.js', { ensureFreshToken: async () => {} });
const chatSend = require('../server/chat-send');
process.env.TWITCH_BROADCASTER_ID = '42';
const realPost = axios.post, realGet = axios.get;
test.after(() => { axios.post = realPost; axios.get = realGet; });

function twitchSays(result) {
  const posted = [];
  axios.post = async (url, body) => {
    posted.push({ url, body });
    if (result instanceof Error) throw result;
    return { data: { data: [result] } };
  };
  return posted;
}

test('posts as the broadcaster, as a reply when given one', async () => {
  const posted = twitchSays({ message_id: 'm1', is_sent: true });
  assert.deepStrictEqual(await chatSend.send('  hi chat  '), { id: 'm1' });
  await chatSend.send('thanks!', 'parent-1');
  assert.deepStrictEqual(posted.map(p => p.body), [
    { broadcaster_id: '42', sender_id: '42', message: 'hi chat' },
    { broadcaster_id: '42', sender_id: '42', message: 'thanks!', reply_parent_message_id: 'parent-1' },
  ]);
  assert.match(posted[0].url, /\/helix\/chat\/messages$/);
});

test('says why a message was not posted', async () => {
  twitchSays({ message_id: '', is_sent: false, drop_reason: { code: 'msg_duplicate', message: 'duplicate message' } });
  await assert.rejects(chatSend.send('again'), { messageCode: 'chatDropped', messageParams: { reason: 'duplicate message' } });
  await assert.rejects(chatSend.send('   '), { messageCode: 'chatEmpty' });
  await assert.rejects(chatSend.send('字'.repeat(501)), { messageCode: 'chatTooLong' });
  twitchSays(Object.assign(new Error('401'), { response: { status: 401, data: { message: 'Missing scope: user:write:chat' } } }));
  await assert.rejects(chatSend.send('hello'), { messageCode: 'chatNoPermission' });
});

test('the message box is on only with the user:write:chat permission', async () => {
  axios.get = async () => ({ data: { scopes: ['user:read:chat'] } });
  assert.strictEqual(await chatSend.canSend(), false);
  axios.get = async () => ({ data: { scopes: ['user:read:chat', 'user:write:chat'] } });
  assert.strictEqual(await chatSend.canSend(), true);
});
