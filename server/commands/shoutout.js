// server/commands/shoutout.js
// Handles the !so <username> chat command, and the Chat tab's Shoutout button (same function).
// Sends Twitch's own Shoutout (the follow pop-up; chat-mod.js — only while live, so a refusal is
// passed on and the clip still plays). Looks up the user's Twitch ID, fetches a random clip, gets a signed HLS
// playlist URL via GQL, and broadcasts it to all WebSocket clients.
//
// Playback path:
//   GQL → signed m3u8 URL → broadcast → clip-player uses HLS.js to play it
//
// Why HLS.js: Twitch serves clips as HLS playlists (m3u8), not direct MP4.
// OBS browser source (Chromium) doesn't play m3u8 natively; HLS.js handles it.
// The signed URL has auth in query params so the browser can fetch it directly
// without a proxy — no CORS issues on Twitch's clip CDN.

const axios = require('axios');
const { setLast } = require('../media-history');
const { getClipSignedUrl } = require('../twitch-clips');
const { ensureFreshToken } = require('../twitch');
const mediaQueue = require('../media-queue');
const { addShoutout } = require('../shoutout-history');
const { broadcastRaw } = require('../queue');
const chatMod = require('../chat-mod');
const { UserError, errorBody } = require('../messages');

const TWITCH_API = 'https://api.twitch.tv/helix';

function twitchHeaders() {
  return {
    'Client-Id': process.env.TWITCH_CLIENT_ID,
    'Authorization': `Bearer ${process.env.TWITCH_USER_ACCESS_TOKEN}`,
  };
}

async function lookupUser(login) {
  const res = await axios.get(`${TWITCH_API}/users`, {
    params: { login },
    headers: twitchHeaders(),
  });
  return res.data.data[0] ?? null;
}

async function fetchClips(broadcasterId) {
  const res = await axios.get(`${TWITCH_API}/clips`, {
    params: { broadcaster_id: broadcasterId, first: 20 },
    headers: twitchHeaders(),
  });
  return res.data.data ?? [];
}

// → { name, twitch: null when Twitch's Shoutout went out, else why not ({ error, code, params }),
//     clip: whether a clip was queued }
async function shoutout(login) {
  const username = String(login || '').trim().replace(/^@/, '').toLowerCase();
  const notFound = new UserError('modUserNotFound', { login: username }, `No Twitch user named "${username}".`);
  if (!username) throw notFound;

  await ensureFreshToken();
  const user = await lookupUser(username);
  if (!user) throw notFound;

  // Record in history so !tk can thank them later
  addShoutout(user.login, user.display_name, user.profile_image_url || '');
  // Pre-warm the avatar in the clip-player's browser cache
  if (user.profile_image_url) {
    broadcastRaw({ type: 'preload-avatar', url: user.profile_image_url });
  }

  let twitch = null;
  try {
    await chatMod.twitchShoutout(user.id);
  } catch (err) {
    twitch = errorBody(err);
    console.log(`[shoutout] Twitch Shoutout not sent to ${username}: ${err.message}`);
  }

  const result = { name: user.display_name || user.login, twitch, clip: false };
  const clips = await fetchClips(user.id);
  if (!clips.length) {
    console.log(`[shoutout] No clips found for ${username}`);
    return result;
  }

  const clip = clips[Math.floor(Math.random() * clips.length)];
  console.log(`[shoutout] Selected clip "${clip.title}" by ${clip.broadcaster_name}`);

  let videoUrl;
  try {
    videoUrl = await getClipSignedUrl(clip.id);
  } catch (err) {
    console.warn('[shoutout] Could not sign clip URL:', err.message);
    return result;
  }

  const payload = {
    type: 'media',
    kind: 'video',
    label: 'Shoutout', labelKey: 'shoutout',   // the clip player shows labelKey in the overlay language
    src: videoUrl,
    title: clip.title,
    credit: `@${clip.broadcaster_name}`,
    duration: clip.duration,
  };
  setLast(payload);
  mediaQueue.enqueue(payload);
  result.clip = true;
  return result;
}

module.exports = function register(registerCommand) {
  registerCommand({
    prefix: '!so ',
    modsOnly: true,
    async handler({ args }) {
      const username = args.split(/\s+/)[0];
      if (!username) return;
      try {
        await shoutout(username);
      } catch (err) {
        console.log(`[shoutout] ${err.message}`);
      }
    },
  });
};
module.exports.shoutout = shoutout;
