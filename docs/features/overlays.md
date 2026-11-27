# 🖼 Overlays and 🎨 Look

**English** · [繁體中文](overlays_zh_TW.md) · [All pages](../README.md)

Everything the app shows on stream is a **Browser Source** in OBS or Streamlabs. Each one's address and size are in
the dashboard: **🎨 Look & overlays** (top, beside EN / 中文), with **Copy**.

| Source | Address | Size | More |
|---|---|---|---|
| Song list | `/overlay/index.html` | 960 × 1470, scaled to 50% | below |
| Clip player | `/clip-player/index.html` | 1920 × 1080, full screen, on top | below |
| Chat on stream | `/overlay/chat.html?style=…` | e.g. 960 × 1080, scaled to 50% | below |
| Alerts | `/overlay/alerts.html?layout=…` | 800 × 600 or 1600 × 300, scaled to 50% | [🔔 Alerts](../tabs/alerts.md) |
| Reward effects | `/overlay/reward-effects.html` | 1920 × 1080, full screen, on top | [🔔 Alerts](../tabs/alerts.md#reward-effects) |
| On break / Starting soon | `/overlay/break.html` (`?card=opening`) | 960 × 260, scaled to 50% | below |
| Prompter (tablet, not OBS) | `/prompter` | | [🎤 Leihu Singsing](../tabs/leihu.md#-prompter-lyrics-and-chat-on-a-tablet) |

Every address starts with `http://localhost:3000`. All of them are transparent while there's nothing to show.

## Song list

1. Add a **Browser** source: `http://localhost:3000/overlay/index.html`, Width `960`, Height `1470`.
2. **Custom CSS**:
   ```css
   body { background-color: rgba(0, 0, 0, 0) !important; margin: 0px auto; overflow: hidden; }
   ```
3. Untick **Shutdown source when not visible**.
4. In your scene, resize it to `480 × 735` (50%): it renders at 2× for sharp text.

## Clip player

Add a **Browser** source: `http://localhost:3000/clip-player/index.html`, Width `1920`, Height `1080`, on top of
the scene, covering the whole screen. It shows content only for `!so`, `!watch`, `!tk` and `!endingtk`
([Clips and rolls](clips-and-rolls.md)).

## Chat on stream

Your Twitch chat on stream, instead of OneComme: the last messages, newest at the bottom, with badges, emotes and
cheers, channel-point redemptions and subs / gifts / raids / follows.

1. Add a **Browser** source with one of the styles (💬 Chat → ⚙ → **Chat on stream** lists them with **Copy**):
   - `…/overlay/chat.html?style=panel`: the song list's look
   - `…/overlay/chat.html?style=bubble`: speech bubbles
   - `…/overlay/chat.html?style=list`: plain lines with an outline, for over a game or video
   - `…/overlay/chat.html?style=row`: one strip, e.g. along the top: newest on the right (`3840 × 200`)
2. Any size, e.g. `960 × 1080`, the same Custom CSS as the song list, scaled to 50%.
3. 💬 Chat → ⚙ → **Chat on stream**: how many messages, text size, and whether it shows redemptions, subs / raids /
   follows, `!commands` and bots. Changes show at once.

Messages a mod deletes, and a timed-out or banned viewer's, leave the stream at once. Moving from OneComme: run both
for one stream, then remove the OneComme source; modes that showed or hid it mark it ⚠: pick the new chat with
**Pick a replacement…**.

## ☕ On break and starting-soon cards

A card in the song list's look, to show with a mode (☕). Add a **Browser** source, Width `960`, Height `260`, scaled to 50%:
- `http://localhost:3000/overlay/break.html`: **On break**; `?card=opening`: **Starting soon** (green).
- `?min=10` counts down 10 minutes, `?at=20:00` counts down to 20:00 (then "Back soon" / "Any moment"). Without either,
  the break card counts the time up and the opening card shows the time.
- The clock starts when the page loads: tick **Refresh browser when scene becomes active** (or **Shutdown source when not
  visible**) so it starts again on every break.
- Its text size is in 🎨 Look & overlays.

## 🎨 Look & overlays

One place for what isn't a single tab's:
- **Themes**: **Neon** (the original), **Daylight**, **High contrast**, **Ocean**, **Cream & coffee**, chosen apart
  for the dashboard and for the overlays. One overlay in another theme: add `?theme=daylight` (`neon`, `daylight`,
  `contrast`, `ocean`, `coffee`) to its address.
- **Text sizes**: the dashboard's (85–140%, the same on every browser and phone that opens it), the song list's and
  the break card's. Overlays change at once and keep their size in OBS (bigger text, fewer songs in the same space).
  The chat's text size is under 💬 Chat → ⚙.
- **Overlays**: panel opacity, brightness and **Overlay language** (English or 繁體中文).
- Each overlay's address and size, the version, and **📂 This run's logs**.

**EN / 中文** switches the dashboard, the links page and the setup wizard together; the overlays follow **Overlay language**.

## When something goes wrong

- **An overlay is blank:** the app isn't running, or the address is wrong (copy it from 🎨 Look & overlays).
- **Blurry text:** the source isn't at 2× (e.g. 960 × 1470) scaled down to 50%.
- **No sound from alerts or reward effects:** tick **Control audio via OBS** on the source, and check that the
  mode on doesn't mute it.
