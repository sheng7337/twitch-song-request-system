# 🎟️ Rewards

**English** · [繁體中文](rewards_zh_TW.md) · [All pages](../README.md)

Every channel-point reward on your channel, one row each: what it's for, whether it plays an effect, and whether
the app can mark its redemptions done or refund them.

## Each reward

- **Use**: its main use:
  - **🎤 Song request**: viewers type a song. There's always one: to move it, choose 🎤 on another reward. It has
    to ask viewers to type something: if it doesn't, the row warns you; turn on **Require Viewer to Enter Text**
    for it on Twitch.
  - **🎲 Random song**: draws a song.
  - 🎤 and 🎲 also tick the sheet tabs they take (none ticked = every tab but the practice tab).
  - **👕 Outfit**: you pick an outfit ([👕 Outfits](outfits.md)).
  - **🎭 Mood request**: Claude picks a song for the viewer's mood ([🎭 Mood requests](../features/mood-requests.md)).
    It needs viewers to type too; the Anthropic API key and mood tags are set up below the list.
  - or none.
- **🎟️ Effect**: a sound or picture, on its own or on top of the main use (e.g. an outfit change with a sound).
  **→ Effect settings** opens it in [🔔 Alerts](alerts.md#reward-effects).
- **Done / refund**: the main use decides (a song when it's sung or removed, an outfit when you pick one, a mood
  request when you refuse its pick); a reward with only an effect leaves it to the effect.

## ＋ New reward

Creates a reward right here: name, points, use, description, and whether viewers type something. The app makes
it, so it manages it from the start (done and refund).

## Let the app manage a reward made on Twitch

Twitch lets an app mark done or refund only the rewards it made. A reward made on Twitch can be handed over: the
app makes a hidden copy with the same settings. Delete the original on Twitch (clear its queue first), and the copy
takes its name and place, with its use and effect. Only a custom icon has to be uploaded again.

A song, random-song or outfit reward that can't give points back (not handed over yet, or **Skip Reward Requests
Queue** on at Twitch) shows a ⚠ with how to fix it.

## When something goes wrong

- **Refunds don't happen:** the reward isn't managed by the app (see above), or **Skip Reward Requests Queue** is
  on for it at Twitch (its redemptions are done at once, so there's nothing to refund).
- **A 🎭 or 🎤 reward warns about text:** turn on **Require Viewer to Enter Text** for it on Twitch.
