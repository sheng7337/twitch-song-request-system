# 🤖 Bot

**English** · [繁體中文](bot_zh_TW.md) · [All pages](../README.md)

Your own chat **commands** and **timers**, instead of Nightbot. They post as your Twitch account, and only while the
app is running. `!歌單` (your song sheet's link) and `!commands` come ready.

## Set up once

1. Set up your commands and timers here (below). Changes are saved when you leave a field.
2. **Turn the same commands and timers off in Nightbot**, or chat gets them twice. Keep Nightbot for anything you
   haven't moved yet.

## Commands

A viewer types the command (or one of its other names) at the start of a message, and the bot answers.

- **Command** and **other names** (e.g. `!songs !list`).
- **Who may use it**: Everyone, Subscribers and up, VIPs and up, or Mods only.
- **Once every** N s (for everyone) and **Each viewer once every** N s. However they're set, the bot answers at
  most 10 times in 30 seconds.
- The **reply**, up to 500 characters, with these variables:

| Variable | Becomes |
|---|---|
| `$(user)` | the viewer who typed the command |
| `$(touser)` | the first word after the command (without @), or the viewer if there's none |
| `$(query)` | everything typed after the command |
| `$(count)` | how many times the command has been used |
| `$(channel)` | your channel name |
| `$(uptime)` | how long the stream has been live |
| `$(followage)` | how long the viewer (or `$(touser)`) has followed |
| `$(sheet)` | the link to your song list sheet |
| `$(commands)` | the commands everyone may use |
| `$(pick a\|b\|c)` | one of these, at random |
| `$(random 1-100)` | a random number in that range |

- **▶ Try** shows what it would say, without posting it. Each command shows how many times it was used.
- The app's own commands (`!so`, `!tk`, `!endingtk`, `!watch`…) can't be taken.

A reply never runs code or opens a link, and a reply that starts with `!` (say, from `$(query)`) never runs a command.

## Timers

A message the bot posts by itself every so many minutes.

- **Every** N min, **after at least** N chat lines since it last posted (so a quiet chat isn't filled with the same
  message), and **only while live** if you like.
- Timers go one at a time, at least 2 minutes apart. Going live starts them over.
- **📣 Post now** posts it at once and starts its timer over. Each timer shows when it's next due.

## When something goes wrong

- **The bot doesn't answer:** the app isn't running, the command is off, a cooldown is on, or the viewer's level is
  too low. The tab shows the last message that couldn't be posted and why (e.g. AutoMod or slow mode).
- **Chat gets two answers:** the same command is still on in Nightbot.
