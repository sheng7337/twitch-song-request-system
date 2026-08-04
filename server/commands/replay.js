const { getLast } = require('../media-history');
const mediaQueue = require('../media-queue');

module.exports = function register(registerCommand) {
  registerCommand({
    prefix: '!replay',
    modsOnly: true,
    async handler() {
      const last = getLast();
      if (!last) {
        console.log('[replay] Nothing to replay');
        return;
      }
      console.log(`[replay] Queuing ${last.kind} — ${last.title}`);
      mediaQueue.enqueue(last);
    },
  });
};
