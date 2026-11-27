# 🎤 Leihu Singsing

**English** · [繁體中文](leihu_zh_TW.md) · [All pages](../README.md)

[Leihu Singsing](https://github.com/LeihuTW/Leihu-singsing) (雷虎練唱台) is a separate free app that turns a
YouTube video into a backing track with lyrics, in any key. When it runs on the same PC the song queue connects
to it by itself; when it isn't running, everything else works as before. This tab shows Leihu's own screen.

## Set up once

1. Install Leihu Singsing. Works with 1.6.x–2.3.x.
2. **Find a YouTube link for each song**: Leihu finds your songs by the sheet's **YTLink** column.
   ⚙ → **① Find a YouTube link for each song** → **🔗 Find YouTube links** fills it for you (Leihu must be running):
   1. Share the song sheet with the service-account email shown, as **Editor**, then **Check access**. Only
      saving needs it.
   2. **Search songs without a link**: about 8 seconds a song; stop and resume any time.
   3. **Review**: *Confident*, *Needs a look* and *Nothing found*. Accept, skip, choose another video or paste a link.
   4. **Save**: writes accepted links into **empty** YTLink cells only. A tab without the column gets one.
3. ⚙ → **② Prepare the songs in Leihu**: downloads each linked song Leihu doesn't have yet and makes its
   backing track and lyrics. A few minutes a song, on the GPU: best started when you're not streaming.
4. Optional: ⚙ → **Start Leihu with the song queue**. **▶ Start Leihu** runs it without a window of its own,
   so it shows only in this tab.

## During a stream

- Each queued song has a **♫** badge: ready / no lyrics / preparing / failed / prepare / link.
  **♫ prepare** imports it from its YTLink; **♫ link** picks a song you already have in Leihu.
- **🎤 Sing** on Now Playing opens the song in Leihu at its sheet key.
- If you forget to switch to a singing mode, a banner offers **Switch to 🎤 Sing** ([🎛 Modes](modes.md)).
- Lyrics: when Leihu leaves a sheet song's lyrics blank, or flags that online lyrics fit better, an online
  lyric is applied, but only an exact fit (same title, artist and length). Lyrics you picked are never replaced.

### 📱 Prompter: lyrics and chat on a tablet

For when a mic shield hides the screen. On a tablet or phone on the same Wi-Fi, open the address in
⚙ → **📱 Lyrics and chat on a tablet** (`http://<this PC>:3000/prompter`). It shows Leihu's lyrics as they
play (filled as you sing), the song's progress and the chat: below in portrait, beside in landscape. Lyrics
and chat each have their own text size, and the chat can be hidden. It only shows: nothing on it changes
Leihu or the stream. On an iPad, Share → **Add to Home Screen** opens it full screen.

## ⚙ Settings

- **Auto-prepare queued songs**: imports songs as they're queued and renders their key ahead of time. It uses
  the GPU during the stream.
- **🔊 Open the stream window**: see "Leihu's sound in OBS" below.
- The two steps above, the prompter's address, and Leihu's own settings.

## Leihu's sound in OBS

In this tab Leihu plays through the browser. `start.bat` opens the dashboard in a separate copy of Chrome (or
Edge), so OBS can capture it alone: add **Application Audio Capture**, pick the window
**點歌控制台 Song Queue (OBS)** and set Window Match Priority to **Window title must match**.

**Music and voice drift apart** (~200 ms, back and forth): Application Audio Capture has no device clock.
Capture an output device instead, which runs on the device's clock like your mic:
- **Audio Output Capture** of the output you listen on (simplest, but every other sound on it goes on stream), or
- give Leihu an output of its own (Leihu ⚙ → music output device) and capture that: a **hardware virtual
  output** if your audio interface has one (e.g. SSL 2 MKII's *Output 3/4 (Virtual)*), or a virtual cable such
  as **VB-Audio Virtual Cable** (set its capture to *Monitor and Output*, then its Sync Offset once).

**Leihu's global hotkeys** (Ctrl+Alt+Space and so on, also for a Stream Deck) belong to Leihu's own window.
Started with **▶ Start Leihu** there are none; with both open they act on Leihu's window, not this tab.

## When something goes wrong

- **♫ YouTube blocked**: YouTube is refusing downloads from your connection for a while. See
  [SETUP → YouTube blocks downloads](../../SETUP.md#youtube-blocks-downloads).
- **YouTube downloads are off** (Leihu 2.3.1 and newer start with them off): the queue says how to turn them
  on. Until then nothing is imported, and songs aren't marked failed.
- **The tab is empty**: Leihu's screen shows only on the PC it runs on.
