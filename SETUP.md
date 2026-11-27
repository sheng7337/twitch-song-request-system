# 🎵 VTuber Song Queue — Setup Guide

> **New here, with no song list yet?** Start with the [Starter Guide](docs/STARTER_GUIDE.md): every step from
> scratch, including making your song list. This page is installing, configuration and fixing problems; how each
> dashboard tab works is in [docs/README.md](docs/README.md).

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

> Prefer to fill in `.env` yourself? See [SETUP_MANUAL.md](SETUP_MANUAL.md).

---

## Every stream

**Double-click `start.bat`** (English) or **`start_zh.bat`** (Traditional Chinese / 繁體中文).

That's it — no ngrok, no URLs to copy, no `.env` to update. The script starts the
server and opens the dashboard in a window of its own: a separate copy of Chrome (or Edge), so OBS
can take Leihu Singsing's sound from it alone (see [Leihu's sound in OBS](docs/tabs/leihu.md#leihus-sound-in-obs)). Logins and bookmarks of your
usual browser aren't in it; the dashboard needs none. Until setup is done, and on a PC without
Chrome or Edge, it opens your usual browser instead.

---

## Using the dashboard

Open `http://localhost:3000/dashboard` (`start.bat` opens it for you). How each tab works is on its own page;
**❓** at the right of the tab bar opens the page of the tab you're on. All pages: [docs/README.md](docs/README.md).

| Tab | Page |
|---|---|
| 🎵 Song Queue | [docs/tabs/queue.md](docs/tabs/queue.md): panels, Pending Review, matching, random picks, practice tab |
| 🎤 Leihu Singsing | [docs/tabs/leihu.md](docs/tabs/leihu.md): backing tracks, YouTube link finder, 📱 prompter, Leihu's sound in OBS |
| 💬 Chat | [docs/tabs/chat.md](docs/tabs/chat.md): to announce, posting, moderating, Shoutout, Raid, Pin |
| 🎛 Modes | [docs/tabs/modes.md](docs/tabs/modes.md): connecting Streamlabs / OBS, making and editing modes |
| 👕 Outfits | [docs/tabs/outfits.md](docs/tabs/outfits.md): veadotube mini |
| 🔔 Alerts | [docs/tabs/alerts.md](docs/tabs/alerts.md): alerts and 🎟️ reward effects |
| 🎟️ Rewards | [docs/tabs/rewards.md](docs/tabs/rewards.md): each reward's use, new rewards, handing rewards over |
| 🤖 Bot | [docs/tabs/bot.md](docs/tabs/bot.md): commands and timers, instead of Nightbot |

Across tabs: [🎭 Mood requests](docs/features/mood-requests.md) ·
[🎬 Clips, rolls and raids](docs/features/clips-and-rolls.md) (chat commands, `!tk` backgrounds, clip volume) ·
[🖼 Overlays and 🎨 Look](docs/features/overlays.md).

---

## OBS / Streamlabs Browser Sources

Add each as a **Browser** source; every address starts with `http://localhost:3000`. Details, Custom CSS and
sizes: [Overlays](docs/features/overlays.md).

| Source | Address | Size |
|---|---|---|
| Song list | `/overlay/index.html` | 960 × 1470, scaled to 50% |
| Clip player (`!so`, `!watch`, `!tk`, `!endingtk`) | `/clip-player/index.html` | 1920 × 1080, on top |
| Chat on stream (optional) | `/overlay/chat.html?style=panel` (`bubble`, `list`, `row`) | e.g. 960 × 1080, scaled to 50% |
| Alerts (optional) | `/overlay/alerts.html?layout=vertical` (or `horizontal`) | 800 × 600 (1600 × 300), scaled to 50% |
| Reward effects (optional) | `/overlay/reward-effects.html` | 1920 × 1080, on top |
| On break / Starting soon (optional) | `/overlay/break.html` (`?card=opening`) | 960 × 260, scaled to 50% |

The dashboard lists each with **Copy**: 🎨 Look & overlays.

---

## Google Sheets setup

### Song list sheet
Your existing sheet with songs. Every tab is read. Songs in the **practice tab** (🎵 Song Queue → ⚙ → **Sheet tabs**; `待練勿點` until you choose) can't be requested or drawn, but Leihu prepares them. Which tabs song requests and each random reward take: 🎟️ Rewards tab.
Share it with the service account email → **Viewer** is enough. The YouTube link finder needs
**Editor** to save links (see [the YouTube link finder](docs/tabs/leihu.md#set-up-once)).

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

`!so`, `!tk`, `!endingtk`, `!watch`, `!replay` and `!stop`, for mods and the broadcaster:
[Clips, rolls and raids](docs/features/clips-and-rolls.md). Your own commands: [🤖 Bot](docs/tabs/bot.md).

---

## File structure

```
vtuber-song-queue/
├── setup/                    ← browser-based setup wizard (served at /setup)
├── start.ps1 / start_zh.ps1  ← run every stream
├── *.bat                     ← double-click launchers (avoid PowerShell execution policy issues)
├── .env                      ← secrets (never commit!)
├── .env.example              ← template with descriptions
├── google-credentials.json   ← service account key (never commit!)
├── song-cache.json           ← auto-generated, safe to delete
├── queue-state.json          ← current queue, restored after a restart within 6 hours
├── song-links.json           ← songs linked to Leihu by hand
├── link-search.json          ← link finder progress and decisions
├── chat-logs/                ← Chat tab log, one file per day (kept CHAT_LOG_DAYS days)
├── logs/                     ← one folder per start: app.log (the console) and leihu.log (kept 30 runs / 14 days)
├── ending-credits.json       ← when !endingtk last ran
├── reward-takeovers.json     ← rewards handed over to the app (🎟️ Rewards tab)
├── stream-session.json       ← when the stream last went live (Chat tab, what to announce)
├── stream-modes.json         ← 🎛 modes
├── alerts.json               ← 🔔 alert settings
├── reward-effects.json       ← 🎟️ reward effects
├── alert-media/              ← your alert and reward-effect pictures and sounds
├── bot.json                  ← 🤖 bot commands and timers
├── mood-tags.json            ← 🎭 songs' mood tags and the running cost
├── mood-picks.jsonl          ← 🎭 the pick log (viewers' words: don't share it)
├── docs/                     ← how to use each tab (docs/README.md)
├── server/                   ← the server (see CLAUDE.md for every file)
│   └── commands/             ← chat commands (!so, !watch, !replay, !stop, !tk, !endingtk)
├── shared/                   ← English / 繁體中文 strings shared by the pages
├── overlay/index.html        ← OBS song overlay
├── clip-player/
│   ├── index.html            ← OBS clip player (shoutouts, !watch, sponsor roll)
│   └── sponsor-bgs/          ← !tk background images
├── dashboard/
│   ├── index.html            ← streamer control panel
│   ├── links.html            ← YouTube link finder
│   └── prompter.html         ← 📱 lyrics and chat on a tablet (/prompter)
└── tools/find-videos.py      ← link finder search helper (runs with Leihu's Python)
```

---

## Tips

- Song list **auto-refreshes every 5 minutes** — no restart needed after adding songs
- History sheet **updates within ~2 seconds** of each request
- Your Twitch connection **renews itself automatically** — no token to babysit, no tunnel to restart
- When an update needs a new Twitch permission, the dashboard says so with an **Authorize again →** link
- **Reporting a problem**: 🎨 Look & overlays → **📂 This run's logs** opens that start's folder in `logs/`
  (`app.log` is what the black window showed, `leihu.log` is Leihu's). Earlier starts are the folders next to
  it, named by date and time — pick the one from the stream with the problem. Tokens and passwords are blanked out;
  viewer names and song titles are in there.

---

## YouTube blocks downloads

Leihu Singsing downloads songs with yt-dlp. Sometimes YouTube refuses with *"Sign in to confirm you're
not a bot"*: the dashboard badge shows **♫ YouTube blocked**.
It's a temporary block on your internet connection (often after many YouTube requests from one PC),
not a problem with the song.

1. **Wait.** It usually clears within a few hours to a day.
2. **If it keeps happening**, let yt-dlp use your browser's YouTube login. Nothing in Leihu Singsing changes:
   - Sign in to YouTube in **Firefox**. Chrome and Edge lock their cookies on Windows, so yt-dlp can't read them.
   - Create the file `%APPDATA%\yt-dlp\config.txt` containing this one line:
     `--cookies-from-browser firefox`
   - Leihu's downloads now use that login. To undo it, delete the file.
   - Use a secondary Google account if you can: YouTube may restrict accounts it sees downloading.
