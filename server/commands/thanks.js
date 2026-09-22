// server/commands/thanks.js
// !tk — plays the Japanese-TV-style sponsor roll for all !so'd broadcasters
// since the last time !tk was used. Mods and broadcaster only.

const fs = require('fs');
const path = require('path');
const mediaQueue = require('../media-queue');
const { getAndClear } = require('../shoutout-history');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);
const BG_DIR = path.join(__dirname, '..', '..', 'clip-player', 'sponsor-bgs');

function pickBgUrl() {
  let files = [];
  try {
    files = fs.readdirSync(BG_DIR).filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()));
  } catch (_) {}

  if (files.length === 0) return '';

  const chosen = files[Math.floor(Math.random() * files.length)];
  const baseUrl = (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
  console.log(`[thanks] Background: ${chosen} (pool: ${files.length})`);
  return `${baseUrl}/clip-player/sponsor-bgs/${chosen}`;
}

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

      const bgUrl = pickBgUrl();
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
