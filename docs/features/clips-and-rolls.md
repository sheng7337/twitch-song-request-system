# 🎬 Clips, thank-you rolls and raids

**English** · [繁體中文](clips-and-rolls_zh_TW.md) · [All pages](../README.md)

Shoutout clips, videos, the `!tk` sponsor roll and the `!endingtk` ending roll all play in the **clip player**, a
Browser Source over your whole scene ([Overlays → Clip player](overlays.md#clip-player)).

## Chat commands

Mods and the broadcaster only: viewers can't trigger them.

| Command | What it does |
|---|---|
| `!so <channel>` | Sends Twitch's Shoutout (while you're live), plays a random clip of that channel and adds it to the `!tk` roll |
| `!tk` | Japanese-TV-style sponsor roll of every channel `!so`'d this stream, then clears the list |
| `!endingtk` | The same roll for everyone who supported this stream (below) |
| `!watch <link>` | Plays a Twitch clip, a YouTube video or a video file link (mp4 / webm) |
| `!replay` | Replays the last `!so` / `!watch` |
| `!stop` | Stops what's playing and clears the waiting clips |

The 💬 Chat tab's **📣 Shoutout** button does the same as `!so`. A mode with **⏸ Hold clips** makes all of these
wait until the next mode ([🎛 Modes](../tabs/modes.md)).

## Shoutout clips

💬 Chat → ⚙ → **Shoutout clips (!so)** → **Pick from**:
- **The newest 50** (default): changes as they make new clips (about a second longer to find);
- **The 20 most viewed**: always the same, mostly older clips.

## 🔊 Even clip volume

Clips from `!so` and `!watch` play at about the same volume: quiet ones turned up (by up to 12 dB), loud ones down,
and loud moments (a scream) turned down as they play. The level is taken from the clip's talking, so one loud moment
doesn't leave the talking quiet. A clip starts less than 0.1 s later.

- On by default. Turn it off in 💬 Chat → ⚙ → Shoutout clips → **🔊 Even out clip volume**.
- After turning it on, set the clip player's volume in OBS once.
- Needs ffmpeg (there with Leihu Singsing). Without it, loud moments are still turned down.
- Only Twitch clips are evened out: YouTube videos and video links from other sites play as they are.

## `!tk` and `!endingtk`

**Who `!endingtk` thanks**, one heading each, since the last `!endingtk` (at most 12 hours back):
raiders · subscribers (a gifter shows 🎁×N after their name; the viewers they gifted are listed too) · cheers (in chat,
and Bits spent on Power-ups and combos) · new followers · channel-point redeemers · song requesters (🎤, 🎲 and 🎭) ·
the 8 most active chatters. Each heading lists a viewer once; a viewer can be under more than one heading (say, a song
request and another reward). The broadcaster and bots are left out. Who it would thank right now: 💬 Chat → ⚙.

**How a roll looks:** the background, then 「提供」 and a line fade in, then up to 4 channels a page (picture, name),
5 seconds a page and 10 for the last. A Japanese voice line plays ("この番組はご覧のスポンサーの提供でお送りします。"),
made on first start (with a local VoiceVox if running, else Google TTS).

**Backgrounds:** put images (jpg / png / gif / webp) in `clip-player/sponsor-bgs/` and restart: one is picked at
random each time. With none, the background is dark.

## Raid with the ending roll

💬 Chat → a name (or **🛡 Moderate**) → **🚀 Raid**, with **🎬 With the ending roll** ticked (the default). Twitch sends
a raid 90 seconds after it starts, so the app starts the raid and the roll at the right times for the raid to go 10
seconds after the roll ends (the confirmation says when). The roll cuts in over a clip, and while clips are held.
**Cancel raid**, or someone raiding you meanwhile, stops both.

Twitch allows 10 raid tries in 10 minutes, refused ones included. A channel that refuses raids from you will keep
refusing: pick another.

## When something goes wrong

- **Nothing shows:** the clip player source isn't in the current scene, or a mode is holding clips (**⏸ N waiting**).
- **A clip is silent or very quiet:** set the clip player's volume in OBS once after turning on clip volume.
- **`!endingtk` misses Power-up Bits:** 💬 Chat shows **Authorize again →** for that permission.
