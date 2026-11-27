# 💬 Chat

**English** · [繁體中文](chat_zh_TW.md) · [All pages](../README.md)

Your Twitch chat, live, with channel-point redemptions, subs, raids and follows, and what to thank on stream
highlighted. You can post, reply, moderate, shout out, raid and pin from here.

## Set up once

Nothing to set up. If the tab shows **Authorize again →**, an update needs a Twitch permission your setup
didn't ask for yet: it takes you to the wizard's authorization step once.

To show the chat on stream, see [Overlays → Chat on stream](../features/overlays.md#chat-on-stream).

## During a stream

- **To announce:** what to thank or greet is highlighted in amber: subs, resubs and gifted subs (a gift of
  several as one line), raids, cheers, new followers, watch streaks, channel-point redemptions, highlighted
  messages, first-time chatters, and each viewer's first message this stream (*first words this stream*).
  Song requests (🎤, 🎲 and 🎭) aren't on it: they go to the queue.
  - **✓** removes a highlight (on a redemption it's **✓ Announce**, apart from **✓ Done**). Pressed by mistake?
    Point at the row and click **✓ announced**.
  - **To announce: N ↓** jumps to the oldest one left; **✓ Mark all announced** clears them all.
  - A new session starts when you go live.
- **Songs mentioned:** **♪** on a sheet song named in chat queues it with that viewer as requester. It shows
  when the song was last sung (amber within the random cooldown, 📺 when it was shown on the overlay).
- **Posting:** type in the box at the bottom and press Enter. It posts as your Twitch account. **↪ Reply**
  (point at a message) answers that message. When Twitch holds a message back (AutoMod, slow mode…) your text
  stays in the box with the reason.
- **Redemptions:** a waiting redemption of a reward the app manages gets **✓ Done** and **↩ Refund** (asks once
  more: Twitch can't undo it). Songs settle themselves ([🎵 Song Queue](queue.md)). A reward made on Twitch gets
  **↗ Twitch queue** instead, or hand it over in [🎟️ Rewards](rewards.md).
- **Filters:** songs mentioned, commands, mods & VIPs, subscribers, @mentions, first-time chatters,
  highlighted messages & bits, redemptions, waiting redemptions, and subs, raids & follows. The search box looks
  in messages and names; **Hide bots** hides bots. Earlier days are in the date list (kept `CHAT_LOG_DAYS`, 30 by default).
- **Chat on every tab:** on the other tabs the live chat shows on the right. Drag its left edge to resize it;
  **💬** at the right of the tabs hides or shows it. Under 900 px wide there's only this tab.

### Moderating, Shoutout, Raid, Pin

Click a name for its menu; **🛡 Moderate** at the top opens it for any channel name.

- **👤 Only this viewer's messages**, **Timeout** (1m / 10m / 1h / 1d, or type a length), **✅ Unban / end
  timeout**, **🚫 Ban** (asks once more). The reason is optional.
- **📣 Shoutout**: Twitch's own Shoutout plus one of their clips, like `!so`. Twitch allows it only while
  you're live, every 2 minutes (once an hour for the same channel); outside that the clip still plays.
- **🚀 Raid**: shows whether that channel is live and how many viewers it has, then **🚀 Raid now** / **Not now**.
  Twitch counts down 90 seconds (shown above the chat, with **Cancel raid**). With **🎬 With the ending roll**
  (the default) the `!endingtk` roll plays so the raid goes 10 seconds after it ends
  ([Clips and rolls](../features/clips-and-rolls.md#raid-with-the-ending-roll)).
  Use this button rather than Twitch's Raid Now or `/raid`, which the app can't follow.
- **📌** (point at a message): pins it for 1, 5 or 30 minutes or until the stream ends; **Unpin** above the chat.

## ⚙ Settings

- **📺 Song notes on overlay**: the song overlay briefly lists songs named in chat, "title – 99 days ago".
- **Who `!endingtk` would thank now**, and whether new followers are included.
- **Shoutout clips (!so)**: the channel's **newest 50** (default) or **20 most viewed**, and **🔊 Even out clip
  volume** ([Clips and rolls](../features/clips-and-rolls.md)).
- **Chat on stream**: how many messages, text size, and whether it shows redemptions, subs / raids / follows,
  `!commands` and bots ([Overlays](../features/overlays.md#chat-on-stream)).

## When something goes wrong

- **A raid won't start:** Twitch allows 10 raid tries per 10 minutes, refused ones included. A channel that
  refused once will keep refusing (it turned raids off, or limited who may raid it): pick another channel instead
  of trying again. Refused raids and Twitch's reason are in the log.
- **A button says the app lacks a permission:** **Authorize again →** (see above).
