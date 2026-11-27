# 🔔 Alerts and 🎟️ reward effects

**English** · [繁體中文](alerts_zh_TW.md) · [All pages](../README.md)

**Alerts**: follows, subs, gifts, cheers and raids on stream, instead of Streamlabs' Alert Box. One at a time, in
the overlay theme, worded in the overlay language; a gift of several subs is one alert.
**Reward effects**: a channel-point reward plays a sound, a picture / GIF / video, or both, instead of TriggerFyre.

## Set up once: alerts

1. Add a **Browser** source, one of two layouts (the tab lists them with **Copy**):
   - `http://localhost:3000/overlay/alerts.html?layout=vertical`: picture above, Width `800`, Height `600`
   - `http://localhost:3000/overlay/alerts.html?layout=horizontal`: picture on the left, Width `1600`, Height `300`
2. Scale it to 50% and place it (it renders at 2×). It's transparent while no alert shows.
3. **Sound:** in the source's properties tick **Control audio via OBS**, and in the mixer (⚙ → **Advanced Audio
   Properties**) set Audio Monitoring to **Monitor and Output** so you hear it too. Then its sound follows the
   source's volume and mute, so a mode that mutes the source (🎤 singing) shows alerts silently.
4. Your pictures, GIFs, videos and sounds: put the files in the `alert-media` folder, press **↻ Read the folder
   again**, and pick them per kind. Without your own files each kind shows a built-in icon and plays a chime.

Moving from Streamlabs: run both for one stream with the Alert Box muted, then remove the Alert Box.

## Each kind of alert

- On / off, a minimum (bits, raid viewers…), how long it shows, the volume, and a **big version** from an amount up
  (e.g. raids from 50 viewers): larger, longer, with its own picture and sound.
- **🔊 Default sound** (above the kinds) is what every kind set to *(default: …)* plays, so one pick changes them all.
- Sound files don't need to match: each is evened out to the same loudness (−16 LUFS) as it plays; the file isn't changed.
- **▶ Test** shows a made-up alert on stream only (nothing goes to Twitch). **↻ Replay** shows a recent one again.

## Reward effects

1. Add a **Browser** source: `http://localhost:3000/overlay/reward-effects.html`, Width `1920`, Height `1080`, over
   your whole scene (on top). Tick **Control audio via OBS** and set **Monitor and Output**, as for alerts.
2. In [🎟️ Rewards](rewards.md), tick **🎟️ Effect** on the reward. Then here, set:
   - its **sounds** (several = one at random each time);
   - a **picture**: a file from `alert-media`, or **🎟️ The reward's icon** (the reward's own icon on Twitch,
     112 × 112, or Twitch's standard one). A newly attached reward starts with its icon at 10%: the icon is small
     and blurs when larger. Change the icon on Twitch and the effect follows;
   - where it shows and how big, how long (or as long as the sound), and **Show who redeemed it**.
3. **▶ Test** plays it on stream only.
4. **Two at once**: one after the other, play together (up to 3), or skip the new one.

**Points:** when an effect has played, its redemption is marked done. One that doesn't play (**🔇 Off**, skipped,
more than 20 waiting, **🗑 Clear the queue**) is refunded. A reward that's also a song request, random song, outfit or
mood request is left to that: the effect only plays. Only rewards the app manages can be marked done or refunded;
others still play ([🎟️ Rewards](rewards.md)).

**Waiting:** **⏸ Pause**, or a mode with **🎟️ Pause reward effects** (e.g. 🎤 singing), keeps them waiting; they play
when it ends. With no reward-effects source open in OBS they wait too, and the tab says so. Waiting ones aren't
kept over a restart: they stay in Twitch's own reward queue.

Moving from TriggerFyre: save your sounds and pictures into `alert-media`, set the rewards up here, then turn each one
off in TriggerFyre, or it plays twice.

## When something goes wrong

- **No sound on stream:** **Control audio via OBS** isn't ticked, or a mode mutes the source.
- **An effect never plays:** no reward-effects source is open in OBS, effects are paused, or the reward's effect is off.
