const axios = require('axios');
const { setLast } = require('../media-history');

function parseYoutubeId(raw) {
  try {
    const url = new URL(raw);
    if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('?')[0] || null;
    if (url.hostname.match(/(?:^|\.)youtube\.com$/)) return url.searchParams.get('v');
  } catch {}
  return null;
}

async function fetchYoutubeTitle(videoId) {
  try {
    const res = await axios.get('https://www.youtube.com/oembed', {
      params: { url: `https://www.youtube.com/watch?v=${videoId}`, format: 'json' },
      timeout: 5000,
    });
    return res.data.title || null;
  } catch { return null; }
}

module.exports = function register(registerCommand, broadcastRaw) {
  registerCommand({
    prefix: '!watch ',
    modsOnly: true,
    async handler({ event, args }) {
      const raw = args.trim().split(/\s+/)[0];
      if (!raw) return;

      let payload;
      const ytId = parseYoutubeId(raw);

      if (ytId) {
        const title = await fetchYoutubeTitle(ytId) || raw;
        payload = {
          type: 'media',
          kind: 'youtube',
          label: 'Now Watching',
          src: `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0`,
          title,
          credit: `@${event.chatter_user_login}`,
          duration: null,
        };
      } else {
        try { new URL(raw); } catch {
          console.log(`[watch] Invalid URL: ${raw}`);
          return;
        }
        const ext = raw.split('?')[0].split('.').pop().toLowerCase();
        if (!['mp4', 'webm', 'mov', 'm3u8'].includes(ext)) {
          console.log(`[watch] Unsupported format ".${ext}" — supported: mp4, webm, mov, m3u8`);
          return;
        }
        payload = {
          type: 'media',
          kind: 'video',
          label: 'Now Watching',
          src: raw,
          title: raw.split('/').pop().split('?')[0],
          credit: `@${event.chatter_user_login}`,
          duration: null,
        };
      }

      broadcastRaw(payload);
      setLast(payload);
      console.log(`[watch] Playing ${payload.kind}: ${payload.title}`);
    },
  });
};
