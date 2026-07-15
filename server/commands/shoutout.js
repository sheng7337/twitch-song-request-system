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

// Returns a signed HLS playlist URL for the clip.
// Uses inline GQL (not a persisted hash) so it doesn't break when Twitch
// rotates their web-app's query hashes.
// gql.twitch.tv only accepts Twitch's own first-party client IDs — we use
// kimne78kx3ncx6brgo4mv6wki5h1ko (their web player's public ID, visible in
// any twitch.tv page source) which is the community standard for public data.
async function getClipSignedUrl(clipId) {
  const res = await axios.post('https://gql.twitch.tv/gql', [{
    operationName: 'ClipVideo',
    query: `query ClipVideo($slug: ID!) {
      clip(slug: $slug) {
        playbackAccessToken(params: {
          platform: "web"
          playerBackend: "mediaplayer"
          playerType: "site"
        }) {
          signature
          value
        }
        videoQualities {
          quality
          frameRate
          sourceURL
        }
      }
    }`,
    variables: { slug: clipId },
  }], {
    headers: {
      'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
      'Content-Type': 'application/json',
    },
  });

  const clip = res.data[0]?.data?.clip;
  if (!clip) {
    const errs = JSON.stringify(res.data[0]?.errors);
    throw new Error(`GQL returned no clip data: ${errs}`);
  }

  const { signature, value } = clip.playbackAccessToken;

  // The token JSON contains clip_uri — the exact CDN URL this sig is valid for.
  // videoQualities[0].sourceURL may be a different resolution; CloudFront
  // validates the URL against clip_uri in the token and returns 400 on mismatch.
  let clipUri;
  try { clipUri = JSON.parse(value).clip_uri; } catch {}
  const source = clipUri || clip.videoQualities[0]?.sourceURL;
  if (!source) throw new Error('No clip source URL found in token or qualities');

  const signedUrl = `${source}?sig=${signature}&token=${encodeURIComponent(value)}`;
  console.log(`[shoutout] Clip URL: ${new URL(source).pathname}`);
  return `/api/clip-stream?url=${encodeURIComponent(signedUrl)}`;
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
        console.warn('[shoutout] Could not get signed URL:', err.message);
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
