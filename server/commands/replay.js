const { getLast } = require('../media-history');

module.exports = function register(registerCommand, broadcastRaw) {
  registerCommand({
    prefix: '!replay',
    modsOnly: true,
    async handler() {
      const last = getLast();
      if (!last) {
        console.log('[replay] Nothing to replay');
        return;
      }
      console.log(`[replay] Replaying ${last.kind} — ${last.title}`);
      broadcastRaw(last);
    },
  });
};
