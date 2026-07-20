const axios = require('axios');
const { setLast } = require('../media-history');
const { fetchClipBySlug, getClipSignedUrl } = require('../twitch-clips');

// ── URL resolvers ──────────────────────────────────────────────────────────────
// Each resolver: { name, detect(rawUrl) → id|null, resolve(id, event) → payload|null }
// To add a new platform, append an entry to this array.

const resolvers = [
  {
    name: 'twitch-clip',
    detect(raw) {
      try {
        const url = new URL(raw);
        // clips.twitch.tv/SLUG
        if (url.hostname === 'clips.twitch.tv')
          return url.pathname.slice(1) || null;
        // www.twitch.tv/*/clip/SLUG  or  m.twitch.tv/clip/SLUG  (+ any query params)
        if (url.hostname.match(/(?:^|\.)twitch\.tv$/) && url.pathname.includes('/clip/'))
          return url.pathname.split('/clip/')[1] || null;
      } catch {}
      return null;
    },
    async resolve(slug, event) {
      const clip = await fetchClipBySlug(slug);
      if (!clip) { console.log(`[watch] Twitch clip not found: ${slug}`); return null; }
      let src;
      try { src = await getClipSignedUrl(slug); } catch (err) {
        console.warn(`[watch] Could not sign Twitch clip: ${err.message}`); return null;
      }
      return {
        type: 'media', kind: 'video', label: 'Now Watching',
        src, title: clip.title, credit: `@${clip.broadcaster_name}`, duration: clip.duration,
      };
    },
  },

  {
    name: 'youtube',
    detect(raw) {
      try {
        const url = new URL(raw);
        if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('?')[0] || null;
        if (url.hostname.match(/(?:^|\.)youtube\.com$/)) return url.searchParams.get('v');
      } catch {}
      return null;
    },
    async resolve(videoId, event) {
      let title = null;
      try {
        const res = await axios.get('https://www.youtube.com/oembed', {
          params: { url: `https://www.youtube.com/watch?v=${videoId}`, format: 'json' },
          timeout: 5000,
        });
        title = res.data.title;
      } catch {}
      return {
        type: 'media', kind: 'youtube', label: 'Now Watching',
        src: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`,
        title: title || `youtu.be/${videoId}`,
        credit: `@${event.chatter_user_login}`,
        duration: null,
      };
    },
  },

  // Future platforms: Streamable, Medal.tv, etc.
  // { name: 'streamable', detect: ..., resolve: ... },
];

// ── Direct video file fallback ─────────────────────────────────────────────────
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'm3u8']);

async function resolveDirectVideo(raw, event) {
  try { new URL(raw); } catch { return null; }
  const ext = raw.split('?')[0].split('.').pop().toLowerCase();
  if (!VIDEO_EXTS.has(ext)) return null;
  return {
    type: 'media', kind: 'video', label: 'Now Watching',
    src: raw,
    title: raw.split('/').pop().split('?')[0],
    credit: `@${event.chatter_user_login}`,
    duration: null,
  };
}

// ── Command ───────────────────────────────────────────────────────────────────
module.exports = function register(registerCommand, broadcastRaw) {
  registerCommand({
    prefix: '!watch ',
    modsOnly: true,
    async handler({ event, args }) {
      const raw = args.trim().split(/\s+/)[0];
      if (!raw) return;

      for (const resolver of resolvers) {
        const id = resolver.detect(raw);
        if (id == null) continue;
        const payload = await resolver.resolve(id, event);
        if (!payload) return;
        broadcastRaw(payload);
        setLast(payload);
        console.log(`[watch] ${resolver.name}: ${payload.title}`);
        return;
      }

      const payload = await resolveDirectVideo(raw, event);
      if (payload) {
        broadcastRaw(payload);
        setLast(payload);
        console.log(`[watch] direct-video: ${payload.title}`);
      } else {
        console.log(`[watch] No resolver matched: ${raw}`);
      }
    },
  });
};
