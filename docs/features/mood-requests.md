# 🎭 Mood requests (情境點歌)

**English** · [繁體中文](mood-requests_zh_TW.md) · [All pages](../README.md)

A viewer redeems a reward set to 🎭 and writes how they feel ("I'm feeling lonely today"). Claude (Anthropic's AI,
Claude Opus 5.5) picks one song from your list and writes a line for chat, in 中文 and in English.
**Nothing goes out before you've seen it.**

## Set up once

1. In [🎟️ Rewards](../tabs/rewards.md), set a reward's use to **🎭 Mood request** (or make one with **＋ New reward**).
   On Twitch, turn on **Require Viewer to Enter Text** for it, or Claude has no mood to go by.
2. Below the list, enter your **Anthropic API key** (create one at console.anthropic.com). It uses your own Anthropic
   account and is billed to it. The key is kept in `.env` and never shown again.
3. **🏷 Tag songs by mood** (recommended): Claude reads each song's lyrics in Leihu Singsing (titles alone when there
   are none) and notes its moods, so picks fit better. Sent as one batch at half price, roughly US$1–3 for a few
   hundred songs, usually done within the hour. Do it once, and again after adding songs. Picks work without tags too.

## During a stream

1. A redemption appears in [🎵 Song Queue](../tabs/queue.md) → **Pending Review** with **⏳ Claude is picking a
   song…**, then the song, why (for you only), its mood tags and the two lines for chat.
2. Read the lines; change them if you like.
3. Then:
   - **✓ Queue + post 中文** or **✓ Queue + post English**: queues the song and posts that line;
   - **🔁 Another**: asks Claude for a different song (each try costs a pick);
   - **✕**: refuses it, and the viewer gets the points back.

Once queued, it's a song request like any other: done when sung, refunded if you remove it. On `!endingtk` the viewer
is listed under song requesters.

**What it picks from:** only songs 🎤 song requests can take, never one that's queued, playing, sung this stream,
waiting in Pending Review, or already offered for this request. The random cooldown isn't used: price the reward
so that it's a treat.

**Jokes and odd messages:** Claude treats the viewer's words only as a mood and still picks a song for a message
that isn't one. Refusing those (✕) is up to you.

## Cost

About US$0.01–0.05 a pick. The first pick after a while costs more (around US$0.2 for a few hundred songs), because
the song list is sent in full once and then read from Anthropic's cache for an hour. The tab shows the running total:
**So far: about US$…**. A pick that fails is still paid for.

## The pick log

Every pick is written to `mood-picks.jsonl` in the app folder, one line each: the viewer's words, the song, Claude's
reason, both lines and what it cost; then whether you sent the 中文, English or a changed line, or refunded it. Lines
of one redemption share an `id`. Use it to look back after a stream: which moods got odd picks, how often you
pressed 🔁, what the night cost. It contains viewers' words: don't share it publicly.

## Privacy

To make each pick, the viewer's words (not their name) and your song list (titles, artists, mood tags) are sent
to Anthropic; the lyrics are sent once when tagging. Nothing else from the app is.

## When something goes wrong

- **"Add your Anthropic API key first"** or **"Anthropic did not accept the API key"**: enter or replace the key
  (🎟️ Rewards → 🎭 Mood requests).
- **"Anthropic says too many requests right now"**: wait a minute, then press 🔁.
- **"Claude would not answer this request"**: refuse it (✕), or 🔁.
- **"There are no songs left to pick from"**: every song is queued, sung or offered already this stream; refuse it.
- **"The app restarted while Claude was picking"**: press 🔁 on it.
