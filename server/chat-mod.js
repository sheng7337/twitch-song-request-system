// server/chat-mod.js
// The Chat tab's moderation buttons, as the account authorized in setup (Helix): ban / timeout and
// unban (moderator:manage:banned_users), Twitch's own Shoutout (moderator:manage:shoutouts), raid and
// cancel (channel:manage:raids), pin and unpin a message (moderator:manage:chat_messages). Setups from
// before these scopes authorize again; until then the buttons say so. Twitch's refusals become
// UserErrors the dashboard shows translated.

const axios = require('axios');
const { ensureFreshToken } = require('./twitch');
const { UserError } = require('./messages');

const TWITCH_API = 'https://api.twitch.tv/helix';
const SCOPES = {
  ban: 'moderator:manage:banned_users',
  shoutout: 'moderator:manage:shoutouts',
  raid: 'channel:manage:raids',
  pin: 'moderator:manage:chat_messages',
};
const CHECK_MAX_AGE_MS = 5 * 60 * 1000;
const TIMEOUT_MAX_S = 14 * 24 * 3600;   // Twitch's longest timeout
const PIN_MIN_S = 30, PIN_MAX_S = 1800;
const REASON_MAX = 500;

let scopes = null, scopesAt = 0, scopesToken = null;   // the token's scopes, and which token they were read for

// { ban, shoutout, raid, pin }: whether the token has each scope. If Twitch can't be asked, let the
// streamer try: the action says why it failed.
async function permissions() {
  const token = process.env.TWITCH_USER_ACCESS_TOKEN;
  if (!scopes || scopesToken !== token || Date.now() - scopesAt > CHECK_MAX_AGE_MS) {
    try {
      await ensureFreshToken();
      const { data } = await axios.get('https://id.twitch.tv/oauth2/validate', {
        headers: { Authorization: `OAuth ${process.env.TWITCH_USER_ACCESS_TOKEN}` }, timeout: 10000,
      });
      scopes = data.scopes || [];
      scopesAt = Date.now();
      scopesToken = process.env.TWITCH_USER_ACCESS_TOKEN;
    } catch (err) {
      console.error('[chat-mod] Could not check the Twitch permissions:', err.response?.data?.message || err.message);
      if (!scopes) return Object.fromEntries(Object.keys(SCOPES).map(k => [k, true]));
    }
  }
  return Object.fromEntries(Object.entries(SCOPES).map(([k, s]) => [k, scopes.includes(s)]));
}

// A Helix call; a failure comes back as an Error with `status` and Twitch's `reason`
async function helix(method, path, { params, data } = {}) {
  await ensureFreshToken();
  try {
    const res = await axios.request({
      method, url: TWITCH_API + path, params, data, timeout: 10000,
      headers: {
        'Client-Id': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${process.env.TWITCH_USER_ACCESS_TOKEN}`,
        ...(data ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    return res.data;
  } catch (err) {
    const status = err.response?.status;
    const reason = err.response?.data?.message || err.message;
    if (status === 401) {
      scopes = null;
      throw new UserError('modNoPermission', {}, 'The app doesn\'t have this Twitch permission yet — authorize again.');
    }
    if (status === 429) throw new UserError('modTooFast', {}, 'Twitch says too many requests — wait a moment and try again.');
    throw Object.assign(new Error(reason), { status, reason });
  }
}

function failed(err) {
  if (err instanceof UserError) return err;
  return new UserError('modFailed', { message: err.reason || err.message }, `Twitch refused: ${err.reason || err.message}`);
}

function me() {
  return process.env.TWITCH_BROADCASTER_ID;
}

// { id, login, name } of a channel name as typed (an @ in front is fine)
async function lookupUser(login) {
  const name = String(login || '').trim().replace(/^@/, '').toLowerCase();
  const notFound = new UserError('modUserNotFound', { login: name }, `No Twitch user named "${name}".`);
  if (!/^[a-z0-9_]{1,25}$/.test(name)) throw notFound;
  let data;
  try { data = await helix('get', '/users', { params: { login: name } }); } catch (err) { throw failed(err); }
  const u = data.data?.[0];
  if (!u) throw notFound;
  return { id: u.id, login: u.login, name: u.display_name || u.login, image: u.profile_image_url || '' };
}

// Ban, or a timeout of `seconds` (1 s – 14 days). → { name, until (ms, null for a ban) }
async function ban(login, { seconds, reason } = {}) {
  let duration = null;
  if (seconds !== undefined && seconds !== null && seconds !== '') {
    duration = Number(seconds);
    if (!Number.isInteger(duration) || duration < 1 || duration > TIMEOUT_MAX_S) {
      throw new UserError('modBadDuration', {}, 'A timeout is 1 second to 14 days.');
    }
  }
  const why = String(reason || '').trim();
  if ([...why].length > REASON_MAX) throw new UserError('modReasonTooLong', { max: REASON_MAX }, `The reason can be at most ${REASON_MAX} characters.`);
  const user = await lookupUser(login);
  let data;
  try {
    data = await helix('post', '/moderation/bans', {
      params: { broadcaster_id: me(), moderator_id: me() },
      data: { data: { user_id: user.id, reason: why, ...(duration ? { duration } : {}) } },
    });
  } catch (err) {
    const name = user.name;
    if (err.status === 400 && /already banned/i.test(err.reason)) throw new UserError('modAlreadyBanned', { name }, `${name} is already banned.`);
    if (err.status === 400 && /may not be|cannot be|can't be/i.test(err.reason)) throw new UserError('modCantBan', { name }, `${name} can't be banned or timed out.`);
    if (err.status === 409) throw new UserError('modBusy', { name }, `Someone else is changing ${name}'s ban right now — try again.`);
    throw failed(err);
  }
  const end = data.data?.[0]?.end_time;
  return { name: user.name, until: end ? Date.parse(end) : null };
}

// Ends a ban or a timeout. → { name }
async function unban(login) {
  const user = await lookupUser(login);
  try {
    await helix('delete', '/moderation/bans', { params: { broadcaster_id: me(), moderator_id: me(), user_id: user.id } });
  } catch (err) {
    const name = user.name;
    if (err.status === 400 && /not banned/i.test(err.reason)) throw new UserError('modNotBanned', { name }, `${name} isn't banned or timed out.`);
    if (err.status === 409) throw new UserError('modBusy', { name }, `Someone else is changing ${name}'s ban right now — try again.`);
    throw failed(err);
  }
  return { name: user.name };
}

// Twitch's own Shoutout (the follow pop-up), to a user ID. Only while live with viewers; Twitch allows one
// every 2 minutes, and the same channel once an hour.
async function twitchShoutout(userId) {
  if (String(userId) === String(me())) throw new UserError('shoutoutSelf', {}, 'You can\'t shout out yourself.');
  try {
    await helix('post', '/chat/shoutouts', { params: { from_broadcaster_id: me(), to_broadcaster_id: userId, moderator_id: me() } });
  } catch (err) {
    if (err.status === 400 && /not streaming|not live|viewers/i.test(err.reason)) {
      throw new UserError('shoutoutNotLive', {}, 'Twitch Shoutouts only work while you\'re live with viewers.');
    }
    throw failed(err);
  }
}

// A channel to raid: { login, name, live, viewers, game }
async function channel(login) {
  const user = await lookupUser(login);
  let data;
  try { data = await helix('get', '/streams', { params: { user_id: user.id } }); } catch (err) { throw failed(err); }
  const s = data.data?.[0];
  return { login: user.login, name: user.name, live: !!s, viewers: s ? s.viewer_count : 0, game: s ? s.game_name : '' };
}

// Starts a raid; it goes after Twitch's 90-second countdown (or Raid Now on Twitch). → { name, createdAt }
async function raid(login) {
  const user = await lookupUser(login);
  if (user.id === String(me())) throw new UserError('modRaidSelf', {}, 'You can\'t raid your own channel.');
  let data;
  try {
    data = await helix('post', '/raids', { params: { from_broadcaster_id: me(), to_broadcaster_id: user.id } });
  } catch (err) {
    const name = user.name;
    if (err.status === 409) throw new UserError('modRaidBusy', {}, 'A raid is already on its way — cancel it first.');
    if (err.status === 404) throw new UserError('modUserNotFound', { login: user.login }, `No Twitch user named "${user.login}".`);
    if (err.status === 400 && /block|accept/i.test(err.reason)) throw new UserError('modRaidRefused', { name }, `${name} doesn't accept raids from your channel.`);
    throw failed(err);
  }
  const at = data.data?.[0]?.created_at;
  return { name: user.name, login: user.login, createdAt: at ? Date.parse(at) : Date.now() };
}

async function cancelRaid() {
  try {
    await helix('delete', '/raids', { params: { broadcaster_id: me() } });
  } catch (err) {
    if (err.status === 404) throw new UserError('modNoRaid', {}, 'There\'s no raid to cancel (it may have gone already).');
    throw failed(err);
  }
  return { ok: true };
}

// The pinned message: { id, name, login, text, endsAt (ms, null = until the stream ends) } or null
async function pinned() {
  let data;
  try { data = await helix('get', '/chat/pins', { params: { broadcaster_id: me(), moderator_id: me() } }); } catch (err) {
    if (!(err instanceof UserError)) console.error('[chat-mod] Could not read the pinned message:', err.reason || err.message);
    return null;
  }
  const p = data.data?.[0];
  if (!p) return null;
  return {
    id: p.message_id, name: p.sender_user_name || p.sender_user_login, login: p.sender_user_login,
    text: p.message?.text || '', endsAt: p.ends_at ? Date.parse(p.ends_at) : null,
  };
}

// Pins a message (replacing any pinned one) for `seconds` (30 s – 30 min), or until the stream ends. → pinned()
async function pin(messageId, seconds) {
  if (!messageId) throw new UserError('pinNotFound', {}, 'Twitch couldn\'t find that message.');
  let duration = null;
  if (seconds !== undefined && seconds !== null && seconds !== '') {
    duration = Number(seconds);
    if (!Number.isInteger(duration) || duration < PIN_MIN_S || duration > PIN_MAX_S) {
      throw new UserError('pinBadDuration', {}, 'A pin lasts 30 seconds to 30 minutes, or until the stream ends.');
    }
  }
  try {
    await helix('put', '/chat/pins', {
      params: { broadcaster_id: me(), moderator_id: me(), message_id: String(messageId), ...(duration ? { duration_seconds: duration } : {}) },
    });
  } catch (err) {
    if (err.status === 404) throw new UserError('pinNotFound', {}, 'Twitch couldn\'t find that message (it may be deleted or too old).');
    if (err.status === 409) throw new UserError('pinAlready', {}, 'That message is already pinned.');
    throw failed(err);
  }
  return pinned();
}

async function unpin(messageId) {
  try {
    await helix('delete', '/chat/pins', { params: { broadcaster_id: me(), moderator_id: me(), message_id: String(messageId || '') } });
  } catch (err) {
    if (err.status === 404) throw new UserError('pinGone', {}, 'That message isn\'t pinned any more.');
    throw failed(err);
  }
  return { ok: true };
}

module.exports = { SCOPES, permissions, lookupUser, ban, unban, twitchShoutout, channel, raid, cancelRaid, pinned, pin, unpin };
