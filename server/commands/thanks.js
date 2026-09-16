// server/commands/thanks.js
// !tk — plays the Japanese-TV-style sponsor roll for all !so'd broadcasters
// since the last time !tk was used. Mods and broadcaster only.

const mediaQueue = require('../media-queue');
const { getAndClear } = require('../shoutout-history');

module.exports = function register(registerCommand) {
  registerCommand({
    prefix: '!tk',
    modsOnly: true,
    async handler() {
      const broadcasters = getAndClear();
      if (!broadcasters.length) {
        console.log('[thanks] !tk fired but shoutout list is empty — no-op');
        return;
      }

      const bgUrl = process.env.SPONSOR_BG_URL || '';
      console.log(`[thanks] Queuing sponsor roll for ${broadcasters.length} broadcaster(s)`);

      mediaQueue.enqueue({
        type: 'media',
        kind: 'sponsor-card',
        title: '提供 Sponsor Roll',
        bgUrl,
        broadcasters,
      });
    },
  });
};
