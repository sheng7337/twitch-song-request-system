const { matchSong } = require('../matcher');
const { addSong, addPending } = require('../queue');

// Per-user cooldown map: userId → last-request timestamp
const cooldowns = new Map();

module.exports = function register(registerCommand) {
  registerCommand({
    prefix: '!sr ',
    modsOnly: false,
    async handler({ event, args }) {
      if (process.env.CHAT_REQUEST_ENABLED !== 'true') return;

      const requestText = args.trim();
      if (!requestText) return;

      const userId = event.chatter_user_id;
      const requester = event.chatter_user_name;

      const cooldownMs = Math.max(0, parseInt(process.env.CHAT_REQUEST_COOLDOWN_SECONDS || '30', 10)) * 1000;
      if (cooldownMs > 0) {
        const lastUsed = cooldowns.get(userId) || 0;
        const elapsed = Date.now() - lastUsed;
        if (elapsed < cooldownMs) {
          const remaining = Math.ceil((cooldownMs - elapsed) / 1000);
          console.log(`[sr] @${requester} on cooldown (${remaining}s remaining)`);
          return;
        }
        cooldowns.set(userId, Date.now());
        // Evict stale entries when the map grows large
        if (cooldowns.size > 2000) {
          const cutoff = Date.now() - cooldownMs;
          for (const [id, ts] of cooldowns) if (ts < cutoff) cooldowns.delete(id);
        }
      }

      console.log(`[sr] @${requester}: "${requestText}"`);
      const result = matchSong(requestText);

      if (result.matched && result.confident) {
        addSong({ title: result.song.title, artist: result.song.artist, key: result.song.key || '', requester });
        console.log(`[sr] Added "${result.song.title}" for @${requester} (${result.confidence}%)`);
      } else if (result.candidates?.length > 1) {
        addPending({ title: '', artist: '', requester, originalRequest: requestText, confidence: result.confidence, candidates: result.candidates });
        console.log(`[sr] ${result.candidates.length} candidates for "${requestText}" → pending`);
      } else if (result.matched && !result.confident) {
        addPending({ title: result.song.title, artist: result.song.artist, requester, originalRequest: requestText, confidence: result.confidence });
        console.log(`[sr] Weak match "${result.song.title}" (${result.confidence}%) → pending`);
      } else {
        addPending({ title: '', artist: '', requester, originalRequest: requestText, confidence: null });
        console.log(`[sr] No match for "${requestText}" → pending`);
      }
    },
  });
};
