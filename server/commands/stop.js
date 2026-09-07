const mediaQueue = require('../media-queue');

module.exports = function register(registerCommand) {
  registerCommand({
    prefix: '!stop',
    modsOnly: true,
    async handler() {
      mediaQueue.stopAll();
    },
  });
};
