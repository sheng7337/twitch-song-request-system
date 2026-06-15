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
5. (Optional) Connect a history sheet to track requesters and request dates
6. Add the OBS overlay to your scene

The wizard validates each step as you go and explains exactly what to do and why.
If you're interrupted partway through, it picks up where you left off.

> Prefer the terminal? `setup.ps1` / `setup_zh.ps1` walk through the same steps
> (Twitch Device Authorization, reward creation, Google Sheets) interactively in PowerShell.

---

## Every stream

**Double-click `start.bat`** (English) or **`start_zh.bat`** (Traditional Chinese / 繁體中文).

That's it — no ngrok, no URLs to copy, no `.env` to update. The script starts the
server and opens your browser straight to **http://localhost:3000/dashboard**.

---

## OBS / Streamlabs Browser Source

Add the overlay to your scene — do this once:

1. In OBS/Streamlabs, add a new source → **Browser**
2. URL: `http://localhost:3000/overlay/index.html`
3. Width: `960`, Height: `800` (renders at 2× for sharpness, scale down in scene)
4. Paste this into the **Custom CSS** field:
   ```css
   body { background-color: rgba(0, 0, 0, 0) !important; margin: 0px auto; overflow: hidden; }
   ```
5. Uncheck **"Shutdown source when not visible"**

The overlay connects automatically when the server is running and updates live.

---

## Google Sheets setup

### Song list sheet
Your existing sheet with songs. All tabs are included except those in `EXCLUDED_TABS` (`server/config.js`).

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
| `server/config.js` | Matching thresholds, excluded tabs, scroll speed, random weights |
| `overlay/index.html` | CSS variables at top — font sizes, list height |

---

## Dashboard

Open `http://localhost:3000/dashboard` during streams.

| Feature | Description |
|---|---|
| 4 columns | Now Playing · Up Next · Played · Pending Review |
| Drag & drop | Move songs between columns or reorder within |
| ✓ Finished | Moves Now Playing → Played, pulls next song |
| Pending column | Weak/unmatched requests — edit and accept manually |
| Manual request bar | Add songs without Channel Points |
| History info | Each card shows last request date and requester |
| Key circle | Shows transposition value (+3, -2, etc.) |

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

Songs already in queue/Now Playing are always excluded.

---

## File structure

```
vtuber-song-queue/
├── setup/                    ← browser-based setup wizard (served at /setup)
├── setup.ps1                 ← optional terminal setup wizard
├── start.ps1                 ← run every stream
├── start.bat / setup.bat     ← double-click launchers (avoid PowerShell execution policy issues)
├── .env                      ← secrets (never commit!)
├── .env.example              ← template with descriptions
├── google-credentials.json   ← service account key (never commit!)
├── song-cache.json           ← auto-generated, safe to delete
├── server/
│   ├── index.js              ← main server
│   ├── config.js             ← tuneable behaviour settings
│   ├── sheets.js             ← song list reader
│   ├── matcher.js            ← fuzzy matching
│   ├── queue.js              ← queue state + WebSocket
│   ├── twitch.js             ← EventSub WebSocket client + Device Auth token handling
│   ├── setup-routes.js       ← API endpoints behind the setup wizard
│   ├── history.js            ← request history writer
│   └── random.js             ← random song picker
├── overlay/
│   └── index.html            ← OBS browser source
└── dashboard/
    └── index.html            ← streamer control panel
```

---

## Tips

- Song list **auto-refreshes every 5 minutes** — no restart needed after adding songs
- History sheet **updates within ~2 seconds** of each request
- Your Twitch connection **renews itself automatically** — no token to babysit, no tunnel to restart
- Want it running 24/7 without your PC on? Deploy to Railway or Render
