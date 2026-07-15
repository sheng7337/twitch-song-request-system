module.exports = function register(registerCommand, broadcastRaw) {
  registerCommand({
    prefix: '!stop',
    modsOnly: true,
    async handler() {
      console.log('[stop] Stopping media playback');
      broadcastRaw({ type: 'media-stop' });
    },
  });
};
