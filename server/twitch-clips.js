const axios = require('axios');

function twitchHeaders() {
  return {
    'Client-Id': process.env.TWITCH_CLIENT_ID,
    'Authorization': `Bearer ${process.env.TWITCH_USER_ACCESS_TOKEN}`,
  };
}

async function fetchClipBySlug(slug) {
  const res = await axios.get('https://api.twitch.tv/helix/clips', {
    params: { id: slug },
    headers: twitchHeaders(),
  });
  return res.data.data[0] ?? null;
}

async function getClipSignedUrl(slug) {
  const res = await axios.post('https://gql.twitch.tv/gql', [{
    operationName: 'ClipVideo',
    query: `query ClipVideo($slug: ID!) {
      clip(slug: $slug) {
        playbackAccessToken(params: {
          platform: "web"
          playerBackend: "mediaplayer"
          playerType: "site"
        }) { signature value }
        videoQualities { quality frameRate sourceURL }
      }
    }`,
    variables: { slug },
  }], {
    headers: { 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' },
  });

  const clip = res.data[0]?.data?.clip;
  if (!clip) throw new Error(`GQL returned no clip data: ${JSON.stringify(res.data[0]?.errors)}`);

  const { signature, value } = clip.playbackAccessToken;
  let clipUri;
  try { clipUri = JSON.parse(value).clip_uri; } catch {}
  const source = clipUri || clip.videoQualities[0]?.sourceURL;
  if (!source) throw new Error('No clip source URL found in token or qualities');

  const signedUrl = `${source}?sig=${signature}&token=${encodeURIComponent(value)}`;
  console.log(`[twitch-clips] Signed URL: ${new URL(source).pathname}`);
  return `/api/clip-stream?url=${encodeURIComponent(signedUrl)}`;
}

module.exports = { fetchClipBySlug, getClipSignedUrl };
