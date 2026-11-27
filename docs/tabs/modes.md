# 🎛 Modes

**English** · [繁體中文](modes_zh_TW.md) · [All pages](../README.md)

Buttons at the top of the dashboard, e.g. **🎤 Singing**, **💬 Talking** and **☕ Break**. One click puts Streamlabs
Desktop or OBS Studio back the way you saved the mode (scene, what shows, sounds) and does this app's part:
a chat message, holding clips, pausing reward effects, opening a tab.

## Set up once

**Connect** (🎛 Modes → Streaming app). Both work on this PC only; the token or password is kept in `.env`.
- **Streamlabs Desktop:** Settings → Remote Control → click the QR code → **Show details**, and copy the token
  into the dashboard. Never show that QR code on stream.
- **OBS Studio 30 or newer:** Tools → WebSocket Server Settings → tick **Enable WebSocket server**. If
  authentication is on, copy the password from **Show Connect Info**.

**Make a mode:** set the streaming app up by hand the way it should look, then press **＋ New mode from what's on
now** (or one of the 🎤 / 💬 / ☕ starters). The mode saves:
- the scene;
- which items show in it and in the scenes and groups inside it;
- the mute and volume of the sounds heard in those scenes: their sources, plus devices in no scene, like Desktop
  Audio and the mic (% in Streamlabs, dB in OBS). Other scenes' sounds are left alone; add one with **＋**.

## During a stream

Click a mode's button. While clips wait, the top bar shows **⏸ N waiting**: click it for the list, where
**▶ Play now** plays one at once and **✕ Drop** skips it (a `!tk` roll's names go back on the `!tk` list).

**🎤 Forgot the singing mode?** When Leihu Singsing plays a song while the mode on isn't a singing one (say, a
talking mode's BGM still on), a banner at the top says so, with **Switch to 🎤 Sing**. Nothing on stream changes
until you click. Needs Leihu 1.4.3+.

## Editing a mode

**✎ Edit** shows its contents.
- **👁 / 🚫** shows or hides an item; **🔊 / 🔇** turns a sound on or off (dimmed = off), or set a volume.
  **✕** leaves an item out, so the mode doesn't touch it.
- **📍 Position** (next to 👁; dimmed = off): the item is also put back where it was saved (position, size,
  rotation, crop). A mode never moves anything if the canvas size changed since it was saved.
- **📥 Save what … shows now into this mode** takes it all again from the streaming app.
- **Dual Output (Streamlabs):** each item is listed once per canvas, each with its own 👁 and 📍.
- This app's part:
  - a **chat message** posted when switching to the mode;
  - **⏸ Hold clips**: clips from `!so`, `!watch`, `!tk` and `!endingtk` wait (up to 10) until the next mode;
    one already playing finishes;
  - **🎟️ Pause reward effects** ([🔔 Alerts](alerts.md#reward-effects));
  - **🎤 For singing**: the singing reminder above counts this mode as singing (ticked by default on modes that hold clips);
  - a dashboard tab to open.

## When something goes wrong

- **Renamed** items, scenes and sounds are still found; one deleted and made again with the same name is found by
  its name.
- **Missing** ones are skipped while everything else is applied. The notice names them, and the mode shows ⚠ with
  **Pick a replacement…** or **✕**.
- Items **added later** aren't touched: the editor lists them under "Not in this mode" with **＋**.
- **Studio Mode:** in OBS a mode changes the program scene; in Streamlabs it may only change the preview: press Transition.
