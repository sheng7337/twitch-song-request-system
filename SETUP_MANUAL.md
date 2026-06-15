# 🎵 VTuber Song Queue — Manual Setup Guide

> This guide is for those who prefer to set up everything manually without the wizard.
> If you'd rather be walked through it, just double-click `start.bat` (or `start_zh.bat`) —
> your browser opens to a step-by-step setup wizard at `http://localhost:3000/setup`. See `SETUP.md`.

---

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

The server opens an outbound WebSocket connection to Twitch — there's no inbound
webhook, no public URL, and therefore no ngrok or tunnel to manage.

---

## Prerequisites

- **Node.js LTS** → https://nodejs.org (check "Add to PATH" during install)

---

## Step 1 — Install

```powershell
cd vtuber-song-queue
npm install
copy .env.example .env
```

---

## Step 2 — Google Cloud setup

You need a **Service Account** so the server can read/write your Google Sheets.

1. Go to https://console.cloud.google.com → create a new project (e.g. `song-queue`)
2. Search bar → **Google Sheets API** → **Enable**
3. Left sidebar → **IAM & Admin → Service Accounts → + Create Service Account**
4. Give it any name → click **Done**
5. Click the service account → **Keys** tab → **Add Key → Create new key → JSON**
6. A file downloads — **rename it `google-credentials.json`** and place it in the project root

---

## Step 3 — Google Sheets

### Song list sheet

Your existing sheet with songs. The server reads it at startup and every 5 minutes.

- Must have a header row with at least a title column and an artist column
- Column names must match `SHEET_SONG_COLUMN` and `SHEET_ARTIST_COLUMN` in `.env`
- Optional: a `key` column with numeric values (e.g. `3`, `-2`) for key transposition display
- Share the sheet with your service account email → **Viewer** access

**Example sheet layout:**

| title | artist | key |
|---|---|---|
| シャルル | バルーン | 0 |
| ロキ | みきとP | -2 |
| Ghost Rule | DECO*27 | 3 |

**Tabs:** All tabs are included except those listed in `EXCLUDED_TABS` in `server/config.js`.
The tab `待練勿點` is excluded by default — add others as needed.

### History sheet

A separate **blank** sheet for request history tracking.

- Create a new blank Google Sheet (no headers needed — the server creates them)
- Share it with your service account email → **Editor** access (needs write permission)
- Copy the sheet ID into `.env` as `HISTORY_SHEET_ID`

### Getting a Sheet ID

Open the sheet in your browser. The ID is the long string in the URL:
```
https://docs.google.com/spreadsheets/d/THIS_PART_HERE/edit
```

---

## Step 4 — Twitch app & authorization

### Register a Twitch app

1. Go to https://dev.twitch.tv/console/apps → **Register Your Application**
   - Name: anything (e.g. `Song Queue Bot`)
   - OAuth Redirect URL: `http://localhost:3000/setup/callback`
   - Category: **Other**
   - Client Type: **Public** (not Confidential)
2. Click **Manage** → copy **Client ID**
3. Paste it into `.env` as `TWITCH_CLIENT_ID`

> **Why Public, not Confidential?** This app authenticates via Device Authorization
> Flow, which only works for Public clients and never needs a Client Secret. Choosing
> Confidential would generate a secret this app can't use — and would be a liability to
> protect for no benefit, since it never leaves your own machine.

### Get a user access token (Device Authorization Flow)

Instead of copy-pasting tokens out of a redirect URL, request a device code and
authorize it from any browser:

```powershell
$res = Invoke-RestMethod -Method Post -Uri "https://id.twitch.tv/oauth2/device" -Body @{
  client_id = "YOUR_CLIENT_ID"
  scopes    = "channel:read:redemptions channel:manage:redemptions"
}
$res.user_code        # e.g. ABCD-1234
```

Visit **https://www.twitch.tv/activate**, log in as your **broadcaster** account, and
enter the code shown. Then poll for the token (the device code is valid for ~30 minutes):

```powershell
$token = Invoke-RestMethod -Method Post -Uri "https://id.twitch.tv/oauth2/token" -Body @{
  client_id   = "YOUR_CLIENT_ID"
  device_code = $res.device_code
  grant_type  = "urn:ietf:params:oauth:grant-type:device_code"
}
$token.access_token
$token.refresh_token
```

Paste the results into `.env`:

```env
TWITCH_USER_ACCESS_TOKEN=<access_token>
TWITCH_USER_REFRESH_TOKEN=<refresh_token>
TWITCH_USER_TOKEN_EXPIRES_AT=<current unix time in ms + (expires_in * 1000)>
```

The server refreshes this token automatically and rewrites `.env` whenever it renews —
you should never need to repeat this step.

### Get your Broadcaster ID

```powershell
Invoke-RestMethod -Uri "https://api.twitch.tv/helix/users" `
  -Headers @{ "Client-Id" = "YOUR_CLIENT_ID"; "Authorization" = "Bearer $($token.access_token)" }
```

Copy the `id` field into `.env` as `TWITCH_BROADCASTER_ID`.

### Create Channel Points rewards

Go to your Twitch Dashboard → **Viewer Rewards → Channel Points → Manage Rewards → +**

**🎵 Song Request**
- Set a point cost
- ✅ Check **"Require Viewer to Enter Text"**
- Prompt: e.g. `Type a song title to request!`

**🎲 Random Song**
- Set a point cost
- ❌ No text input needed

### Get reward IDs

```powershell
curl.exe "https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=YOUR_BROADCASTER_ID" `
  -H "Client-Id: YOUR_CLIENT_ID" `
  -H "Authorization: Bearer YOUR_USER_TOKEN"
```

Copy the `id` field for each reward into `.env` as `TWITCH_REWARD_ID` and `TWITCH_RANDOM_REWARD_ID`.

---

## Step 5 — Fill in `.env`

Open `.env` and fill in any remaining values. See `.env.example` for descriptions of each field.

There's no webhook secret and no `PUBLIC_URL` to set — EventSub connects outbound over
a WebSocket, so nothing needs to be publicly reachable.

---

## Step 6 — Streamlabs / OBS Browser Source

1. Add Source → **Browser**
2. URL: `http://localhost:3000/overlay/index.html`
3. Width: `960`, Height: `800` (renders crisp at 2×, scale down in your scene)
4. Custom CSS:
   ```css
   body { background-color: rgba(0, 0, 0, 0) !important; margin: 0px auto; overflow: hidden; }
   ```
5. Uncheck **"Shutdown source when not visible"**

---

## Step 7 — Run it

```powershell
npm start
```

Expected output:
```
🎵 VTuber Song Queue starting...
[sheets] Loaded 180 songs from Google Sheet (3 tabs)
[history] Loaded 42 songs from history sheet
[twitch] EventSub WebSocket connected — session established
[twitch] Subscribed to channel point redemptions
✅ Server running at http://localhost:3000
   Overlay URL:  http://localhost:3000/overlay/index.html
   Dashboard:    http://localhost:3000/dashboard
```

---

## Every-stream startup

```powershell
npm start
```

Then open `http://localhost:3000/dashboard` in your browser. Nothing else to start,
copy, or update — the EventSub WebSocket connection and token refresh are handled
automatically on launch.

---

## Testing without going live

```powershell
# Add a song manually
$body = [System.Text.Encoding]::UTF8.GetBytes('{"title":"シャルル","requester":"test"}')
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/add -ContentType "application/json; charset=utf-8" -Body $body

# Skip current song
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/skip

# Clear the queue
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/clear

# View current queue
Invoke-RestMethod -Uri http://localhost:3000/api/queue

# Force refresh song list
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/refresh-songs
```

---

## Configuration

| File | What to change |
|---|---|
| `.env` | Credentials, IDs, URLs — see `.env.example` for descriptions |
| `server/config.js` | Matching thresholds, excluded tabs, scroll speed, random weights |
| `overlay/index.html` | CSS variables at top — font sizes, list height |

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

Fine-tune weights in `server/config.js` (`RANDOM_NEVER_REQUESTED_WEIGHT`, `RANDOM_MAX_DAYS_WEIGHT`).

---

## File structure

```
vtuber-song-queue/
├── setup/                    ← browser-based setup wizard (served at /setup)
├── setup.ps1                 ← automated terminal setup wizard
├── start.ps1                 ← automated stream startup
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
- The user access token **refreshes itself automatically** and rewrites `.env` — you
  should never need to repeat the Device Authorization step
- Want it running 24/7 without your PC on? Deploy to Railway or Render
