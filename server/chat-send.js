// server/chat-send.js
// Posting to chat from the Chat tab, as the account authorized in setup (Helix POST /chat/messages,
// scope user:write:chat — setups from before it authorize again). A reply names the message it
// answers. The message comes back through EventSub's chat like any other, so it's logged from there.

const axios = require('axios');
const { ensureFreshToken } = require('./twitch');
const { UserError } = require('./messages');

const SCOPE = 'user:write:chat';
const MAX_LENGTH = 500;   // Twitch's limit, in characters
const CHECK_MAX_AGE_MS = 5 * 60 * 1000;

let allowedAt = 0;   // when the token was last seen with the scope (a missing one is checked every time)

// Whether the token has the scope. If Twitch can't be asked, let the streamer try: sending says why it failed.
async function canSend() {
  if (Date.now() - allowedAt < CHECK_MAX_AGE_MS) return true;
  try {
    await ensureFreshToken();
    const { data } = await axios.get('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${process.env.TWITCH_USER_ACCESS_TOKEN}` }, timeout: 10000,
    });
    if (!(data.scopes || []).includes(SCOPE)) return false;
    allowedAt = Date.now();
    return true;
  } catch (err) {
    console.error('[chat-send] Could not check the Twitch permission:', err.response?.data?.message || err.message);
    return true;
  }
}

// { id } of the sent message; replyTo = the message ID it answers
async function send(text, replyTo) {
  const message = String(text || '').trim();
  if (!message) throw new UserError('chatEmpty', {}, 'Type a message first.');
  if ([...message].length > MAX_LENGTH) throw new UserError('chatTooLong', { max: MAX_LENGTH }, `Chat messages can be at most ${MAX_LENGTH} characters.`);
  await ensureFreshToken();
  const broadcaster = process.env.TWITCH_BROADCASTER_ID;
  let data;
  try {
    ({ data } = await axios.post('https://api.twitch.tv/helix/chat/messages', {
      broadcaster_id: broadcaster, sender_id: broadcaster, message,
      ...(replyTo ? { reply_parent_message_id: String(replyTo) } : {}),
    }, {
      headers: {
        'Client-Id': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${process.env.TWITCH_USER_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }));
  } catch (err) {
    const reason = err.response?.data?.message || err.message;
    if (err.response?.status === 401) {
      allowedAt = 0;
      throw new UserError('chatNoPermission', {}, 'The app may not post in chat yet — authorize again.');
    }
    throw new UserError('chatSendFailed', { message: reason }, `Twitch did not take the message: ${reason}`);
  }
  const sent = data.data?.[0] || {};
  if (!sent.is_sent) {
    const reason = sent.drop_reason?.message || sent.drop_reason?.code || '';
    throw new UserError('chatDropped', { reason }, `Twitch did not post it: ${reason}`);
  }
  return { id: sent.message_id };
}

module.exports = { canSend, send, MAX_LENGTH };
