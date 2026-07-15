// server/chat-router.js
// Receives Twitch chat events and dispatches them to registered command handlers.
// Commands are registered by feature modules (shoutout, lottery, etc.) via registerCommand().

const commands = [];

/**
 * Register a chat command.
 * @param {object} opts
 * @param {string}   opts.prefix    - Message prefix to match, e.g. '!so ' (case-insensitive)
 * @param {Function} opts.handler   - async ({ event, args, isMod }) => void
 * @param {boolean}  [opts.modsOnly=true] - If true, only broadcaster/mods can trigger
 */
function registerCommand({ prefix, handler, modsOnly = true }) {
  commands.push({ prefix: prefix.toLowerCase(), handler, modsOnly });
}

function handleChatEvent(event) {
  const text = event.message?.text?.trim() ?? '';
  const textLower = text.toLowerCase();
  const isMod = event.badges?.some(b => b.set_id === 'broadcaster' || b.set_id === 'moderator') ?? false;

  console.log(`[chat] @${event.chatter_user_login} (mod=${isMod}): ${text}`);

  for (const cmd of commands) {
    if (!textLower.startsWith(cmd.prefix)) continue;
    if (cmd.modsOnly && !isMod) {
      console.log(`[chat-router] Blocked "${cmd.prefix}" — not a mod`);
      return;
    }
    const args = text.slice(cmd.prefix.length).trim();
    cmd.handler({ event, args, isMod }).catch(err =>
      console.error(`[chat-router] Error in handler for "${cmd.prefix}":`, err.message)
    );
    return; // first match wins
  }
}

module.exports = { registerCommand, handleChatEvent };
