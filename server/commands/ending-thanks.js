// server/commands/ending-thanks.js
// !endingtk — the !tk sponsor roll for everyone who supported the stream, one heading per
// group (ending-credits.js), since the last !endingtk. Mods and broadcaster only.

const mediaQueue = require('../media-queue');
const credits = require('../ending-credits');
const { pickBgUrl } = require('./thanks');

module.exports = function register(registerCommand) {
  registerCommand({
    prefix: '!endingtk',
    modsOnly: true,
    async handler() {
      const now = Date.now();
      const groups = await credits.gather(now);
      if (!groups.length) {
        console.log('[ending-credits] !endingtk fired but nobody to thank yet — no-op');
        return;
      }
      await credits.addAvatars(groups);
      credits.saveRunAt(now);
      console.log(`[ending-credits] Queuing the ending roll: ${groups.map(g => `${g.key} ${g.people.length}`).join(', ')}`);
      mediaQueue.enqueue({
        type: 'media',
        kind: 'sponsor-card',
        title: 'Ending Roll',
        bgUrl: pickBgUrl(),
        groups,
      });
    },
  });
};
