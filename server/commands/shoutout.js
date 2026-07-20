// server/commands/shoutout.js
// Handles the !so <username> chat command.
// Looks up the user's Twitch ID, fetches a random clip, gets a signed HLS
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

const TWITCH_API = 'https://api.twitch.tv/helix';

function twitchHeaders() {
  return {
    'Client-Id': process.env.TWITCH_CLIENT_ID,
    'Authorization': `Bearer ${process.env.TWITCH_USER_ACCESS_TOKEN}`,
  };
}

async function lookupUserId(login) {
  const res = await axios.get(`${TWITCH_API}/users`, {
    params: { login },
    headers: twitchHeaders(),
  });
  return res.data.data[0]?.id ?? null;
}

async function fetchClips(broadcasterId) {
  const res = await axios.get(`${TWITCH_API}/clips`, {
    params: { broadcaster_id: broadcasterId, first: 20 },
    headers: twitchHeaders(),
  });
  return res.data.data ?? [];
}

module.exports = function register(registerCommand, broadcastRaw) {
  registerCommand({
    prefix: '!so ',
    modsOnly: true,
    async handler({ args }) {
      const username = args.split(/\s+/)[0].replace(/^@/, '').toLowerCase();
      if (!username) return;

      const userId = await lookupUserId(username);
      if (!userId) {
        console.log(`[shoutout] User not found: ${username}`);
        return;
      }

      const clips = await fetchClips(userId);
      if (!clips.length) {
        console.log(`[shoutout] No clips found for ${username}`);
        return;
      }

      const clip = clips[Math.floor(Math.random() * clips.length)];
      console.log(`[shoutout] Selected clip "${clip.title}" by ${clip.broadcaster_name}`);

      let videoUrl;
      try {
        videoUrl = await getClipSignedUrl(clip.id);
      } catch (err) {
        console.warn('[shoutout] Could not sign clip URL:', err.message);
        return;
      }

      const payload = {
        type: 'media',
        kind: 'video',
        label: 'Shoutout',
        src: videoUrl,
        title: clip.title,
        credit: `@${clip.broadcaster_name}`,
        duration: clip.duration,
      };
      broadcastRaw(payload);
      setLast(payload);
    },
  });
};
