# 🎵 VTuber Song Queue — Setup Guide

## How it works

```
Viewer redeems Channel Points (Song Request or Random Song)
        ↓
Twitch EventSub (outbound WebSocket) → your local server
        ↓
🎵 Song Request: fuzzy-match → queue or Pending (dashboard)
🎲 Random Song: weighted random pick from your sheet
        ↓
OBS overlay updates live via WebSocket
        ↓
Request recorded in history Google Sheet
```

No public URL, no tunnel, no ngrok — the server connects straight out to Twitch.

---

## Prerequisites

Install this before getting started:

- **Node.js LTS** → https://nodejs.org (check "Add to PATH")

That's it — nothing else to download or configure ahead of time.

---

## First-time setup

**Double-click `start.bat`** (English) or **`start_zh.bat`** (Traditional Chinese / 繁體中文).

> If you'd rather use a terminal: `.\start.ps1` / `.\start_zh.ps1` do the same thing. If
> PowerShell refuses to run them with a message about "execution policies", use the
> `.bat` files instead — they sidestep that setting entirely without changing anything
> on your system.

The first time you run it, your browser opens straight to a **step-by-step setup wizard**
at `http://localhost:3000/setup`. It walks you through everything in plain language —
no terminal commands, no manual `.env` editing:

1. Create a small Twitch app and paste in its Client ID
2. Connect your Twitch account (enter a short code at twitch.tv/activate — no copy-pasting tokens)
3. Create the 🎵 Song Request and 🎲 Random Song Channel Points rewards automatically
4. Upload your Google **service account** key and pick your song-list sheet from a live preview
5. (Optional) Create random-song rewards limited to one sheet tab (e.g. a random 日語 song)
6. (Optional) Connect a history sheet to track requesters and request dates
7. Add the OBS overlay and clip player to your scene

The wizard validates each step as you go and explains exactly what to do and why.
If you're interrupted partway through, it picks up where you left off.

> Prefer the terminal? `setup.ps1` / `setup_zh.ps1` walk through the same steps
> (Twitch Device Authorization, reward creation, Google Sheets) interactively in PowerShell.

---

## Every stream

**Double-click `start.bat`** (English) or **`start_zh.bat`** (Traditional Chinese / 繁體中文).

That's it — no ngrok, no URLs to copy, no `.env` to update. The script starts the
server and opens the dashboard in a window of its own: a separate copy of Chrome (or Edge), so OBS
can take Leihu Singsing's sound from it alone (see Leihu Singsing below). Logins and bookmarks of your
usual browser aren't in it; the dashboard needs none. Until setup is done, and on a PC without
Chrome or Edge, it opens your usual browser instead.

---

## OBS / Streamlabs Browser Source

### Song overlay

Add the overlay to your scene — do this once:

1. In OBS/Streamlabs, add a new source → **Browser**
2. URL: `http://localhost:3000/overlay/index.html`
3. Width: `960`, Height: `1362` (the overlay renders at 2× for sharpness)
4. Paste this into the **Custom CSS** field:
   ```css
   body { background-color: rgba(0, 0, 0, 0) !important; margin: 0px auto; overflow: hidden; }
   ```
5. Uncheck **"Shutdown source when not visible"**
6. In your scene, select the source and resize it down to `480 x 681` (50%) —
   this is what makes the 2× render look sharper instead of just bigger

The overlay connects automatically when the server is running and updates live.
Its language (English or 繁體中文) is set in the dashboard: ⚙ → **Overlay language**.

### Clip player (shoutouts / sponsor roll)

1. Add a new source → **Browser**
2. URL: `http://localhost:3000/clip-player/index.html`
3. Width: `1920`, Height: `1080`
4. Put it at the top of the scene, covering the whole screen
5. It stays fully transparent, and shows content only for `!so`, `!watch` and `!tk`

---

## Google Sheets setup

### Song list sheet
Your existing sheet with songs. All tabs are included except those in `EXCLUDED_TABS` in `.env` (comma-separated; `待練勿點` when not set).
Share it with the service account email → **Viewer** is enough. The YouTube link finder needs
**Editor** to save links (see [YouTube link finder](#youtube-link-finder)).

Header row must have at minimum:

| title | artist | key |
|---|---|---|
| シャルル | バルーン | 0 |
| ロキ | みきとP | -2 |

Column names must match `SHEET_SONG_COLUMN` / `SHEET_ARTIST_COLUMN` in `.env`.
`key` column is optional — must be numeric. Non-numeric values are ignored.

### History sheet
A separate blank sheet. The server creates headers automatically on first run.
Share with service account email → **Editor** access.

---

## Configuration

| File | What to change |
|---|---|
| `.env` | Credentials, IDs, URLs — see `.env.example` for descriptions |
| `server/config.js` | Matching thresholds, random weights, Leihu recognition language per tab |
| `overlay/index.html` | CSS variables at top — font sizes, list height; `SCROLL_PX_PER_SEC` — scroll speed |

---

## Chat commands

Mods and the broadcaster only — viewers can't trigger them.

| Command | Description |
|---|---|
| `!so <user>` | Plays a random clip of that channel and adds it to the sponsor roll |
| `!tk` | Japanese-TV-style sponsor roll of every channel `!so`'d this stream, then clears the list |
| `!endingtk` | The same roll for everyone who supported this stream, one heading each: raiders, subscribers (gifters and gifted viewers), cheers, new followers, channel-point redeemers, song requesters and the 8 most active chatters — since the last `!endingtk`. Who it would thank now: Chat tab ⚙ |
| `!watch <url>` | Plays a Twitch clip, a YouTube video or a video file link (mp4/webm) |
| `!replay` | Replays the last `!so` / `!watch` |
| `!stop` | Stops what's playing and clears the waiting clips |

**`!tk` backgrounds:** put images (jpg / png / gif / webp) in `clip-player/sponsor-bgs/` and restart
the server — one is picked at random each time. With no images the background is dark.
The Japanese voice line is generated on first start (local VoiceVox if running, else Google TTS).

---

## Dashboard

Open `http://localhost:3000/dashboard` during streams.

| Feature | Description |
|---|---|
| 💬 Chat | Live chat with search and filters — songs mentioned (♪ adds one to the queue; it shows when the song was last sung, amber within the random cooldown — and the song overlay briefly lists songs named in chat as "title - 99 days ago" since last sung, coming up from the bottom of the overlay, over its Played list (up to 4 at a time, a new one replaces the oldest; amber within the cooldown; switch "📺 Song notes on overlay"), 📺), commands, mods & VIPs, subscribers, @mentions, first-time chatters, highlighted messages & bits, redemptions, waiting redemptions, one viewer (click a name); bots hidden. Type in the box at the bottom to post in chat as yourself; **↪ Reply** on a message (shown on hover) answers it (setups from before this ask you to authorize once more). A waiting redemption gets **✓ Done** and **↩ Refund** when the reward was made by this app (song requests also settle themselves: done when you press ✓ Finished, refunded when you remove the song); for a reward made on Twitch, **↗ Twitch queue** opens Twitch's own queue. Chat ⚙ → *Channel-point rewards* can hand a reward made on Twitch over to the app: it makes a hidden copy, you delete the original on Twitch, and the copy takes its place (same settings; only a custom icon has to be uploaded again). Messages mods delete show struck through. Earlier days: pick a date (logs kept on this PC for `CHAT_LOG_DAYS`, default 30). To type in chat, **↗ Twitch chat** opens Twitch's own chat window |
| Tabs | 🎵 Song Queue (the panels below) and 🎤 Leihu Singsing — Leihu's own screen inside the dashboard. **⚙ Leihu settings** in its header opens Leihu's settings and the two steps that get your song list ready; while those run, their progress shows in the header. `#leihu` in the address opens that tab. Leihu only shows on the PC it runs on. **▶ Start Leihu** there (or "Start Leihu with the song queue") runs Leihu without its own window, so it shows only in this tab |
| 4 panels (2×2) | Left: Now Playing above Up Next · Right: Pending Review above Played |
| Drag & drop | Move songs between panels or reorder within |
| ⚙ Settings | Each tab has its own ⚙ at the right end of its top row: Song Queue — random cooldown, overlay opacity / brightness / language; Leihu Singsing — its settings and the two steps; Chat — song notes on the overlay. Each saves on its own |
| EN / 中文 | Switches the dashboard, links page and setup wizard together; the overlay and clip player follow the ⚙ "Overlay language" setting |
| ✓ Finished | Moves Now Playing → Played, pulls next song |
| Pending column | Weak/unmatched requests — edit and accept manually |
| 🔍 Find (Pending) | For a song that isn't on your sheet: searches lyric sites and YouTube (needs Leihu Singsing running), then **▶ Queue + prepare** or **＋ Add to** your first excluded tab with its link |
| Manual request bar | Add songs without Channel Points |
| History info | Each card shows last request date and requester |
| Key circle | Shows transposition value (+3, -2, etc.) |
| ♫ badge · 🎤 Sing | Leihu Singsing status of each song — see below |

---

## How matching works

| Result | Action |
|---|---|
| ≥ 80% confidence | Auto-added to queue |
| < 80% confidence | Sent to Pending with suggested match |
| No match | Sent to Pending, blank for manual entry |

Tune in `server/config.js`: `AUTO_ACCEPT_THRESHOLD`, `MATCH_THRESHOLD` (0.2 stricter / 0.6 looser).

---

## Random song modes

Set `RANDOM_PICK_MODE` in `.env`:
- `weighted` — favors songs not played recently (recommended)
- `pure` — truly random

Songs already in queue/Now Playing/Played, and songs requested within the cooldown
(⚙ on the dashboard), are always excluded.

---

## Leihu Singsing (optional)

[Leihu Singsing](https://github.com/LeihuTW/Leihu-singsing) (雷虎練唱台) is a separate free app that
turns a YouTube video into a backing track with lyrics, in any key. When it runs on the same PC, the
dashboard connects to it by itself — nothing to set up. When it isn't running, everything works as before.

- Each queued song gets a **♫ badge**: ready / no lyrics / preparing / failed / prepare / link.
  **♫ prepare** imports the song from the sheet's YouTube link (column `YTLink`, see below);
  **♫ link** lets you pick a song you already have in Leihu.
- ⚙ → **Auto-prepare queued songs** imports songs as they are queued and renders their sheet key
  ahead of time. It uses the GPU during the stream.
- **🎤 Sing** (Now Playing) opens the song in Leihu's practice window at its sheet key. Needs Leihu 1.5.2 or newer.
- When Leihu leaves a sheet song's lyrics blank, or flags that online lyrics fit better than what it
  recognized, an online lyric is applied — only an exact fit: same title, same artist, same length.
  Lyrics you picked in Leihu are never replaced.
- **Leihu's sound as its own OBS source**: in the dashboard's Leihu tab, Leihu plays through the browser,
  so OBS hears it mixed with every other tab. `start.bat` opens the dashboard in a separate copy of Chrome
  (or Edge) for this; opened some other way, Leihu tab ⚙ → **🔊 Open the stream window** does the same. In OBS add **Application Audio Capture**, pick the
  window **點歌控制台 Song Queue (OBS)** and set Window Match Priority to **Window title must match**.

---

## YouTube link finder

Leihu finds your songs by the YouTube link in the sheet's **YTLink** column. Dashboard ⚙ →
**🔗 Find YouTube links for the sheet** fills that column for you (Leihu Singsing must be running —
the search uses its lyric sites and YouTube tools):

1. **Step 1 — Editor access:** share the song sheet with the service-account email shown on the page as
   **Editor**, then click **Check access**. Only saving needs it; searching and reviewing work without it.
2. **Search songs without a link:** about 8 seconds per song. Stop and resume any time.
3. **Review:** picks are grouped into *Confident*, *Needs a look* and *Nothing found*. Accept, skip,
   choose another video or paste a link. **Check with Leihu** imports the video into Leihu and compares
   its sung lyrics with the online lyrics (adds the song to Leihu's library).
4. **Save:** writes accepted links into **empty** YTLink cells only. A tab without the column gets one.

---

## File structure

```
vtuber-song-queue/
├── setup/                    ← browser-based setup wizard (served at /setup)
├── setup.ps1 / setup_zh.ps1  ← optional terminal setup wizard
├── start.ps1 / start_zh.ps1  ← run every stream
├── *.bat                     ← double-click launchers (avoid PowerShell execution policy issues)
├── .env                      ← secrets (never commit!)
├── .env.example              ← template with descriptions
├── google-credentials.json   ← service account key (never commit!)
├── song-cache.json           ← auto-generated, safe to delete
├── queue-state.json          ← current queue, restored after a restart within 6 hours
├── song-links.json           ← songs linked to Leihu by hand
├── link-search.json          ← link finder progress and decisions
├── server/                   ← the server (see CLAUDE.md for every file)
│   └── commands/             ← chat commands (!so, !watch, !replay, !stop, !tk, !endingtk)
├── shared/                   ← English / 繁體中文 strings shared by the pages
├── overlay/index.html        ← OBS song overlay
├── clip-player/
│   ├── index.html            ← OBS clip player (shoutouts, !watch, sponsor roll)
│   └── sponsor-bgs/          ← !tk background images
├── dashboard/
│   ├── index.html            ← streamer control panel
│   └── links.html            ← YouTube link finder
└── tools/find-videos.py      ← link finder search helper (runs with Leihu's Python)
```

---

## Tips

- Song list **auto-refreshes every 5 minutes** — no restart needed after adding songs
- History sheet **updates within ~2 seconds** of each request
- Your Twitch connection **renews itself automatically** — no token to babysit, no tunnel to restart

---

## YouTube blocks downloads

Leihu Singsing downloads songs with yt-dlp. Sometimes YouTube refuses with *"Sign in to confirm you're
not a bot"*: the dashboard badge shows **♫ YouTube blocked**, and "Check with Leihu" says the same.
It's a temporary block on your internet connection (often after many YouTube requests from one PC),
not a problem with the song.

1. **Wait.** It usually clears within a few hours to a day.
2. **If it keeps happening**, let yt-dlp use your browser's YouTube login. Nothing in Leihu Singsing changes:
   - Sign in to YouTube in **Firefox**. Chrome and Edge lock their cookies on Windows, so yt-dlp can't read them.
   - Create the file `%APPDATA%\yt-dlp\config.txt` containing this one line:
     `--cookies-from-browser firefox`
   - Leihu's downloads now use that login. To undo it, delete the file.
   - Use a secondary Google account if you can: YouTube may restrict accounts it sees downloading.
