# CLAUDE.md — Project Context for AI Assistants

This file documents the full context of the VTuber Song Queue project so any AI assistant
can quickly understand the codebase and continue development without re-explaining history.

---

## What this project is

A **Twitch Channel Points song request system** for a VTuber singer.

Viewers redeem Channel Points to request songs. The server matches requests against a
Google Sheets song list using fuzzy matching, and updates a cyberpunk-styled OBS overlay
in real time via WebSocket.

---

## Architecture

```
Viewer redeems Channel Points
        ↓
Twitch EventSub webhook → Express server (Node.js, port 3000)
        ↓
Fuzzy match (fuse.js) against Google Sheets song list
  ≥80% confidence → queue
  <80% confidence → Pending (dashboard review)
  No match → Pending (dashboard review)
        ↓
WebSocket broadcast → OBS Browser Source overlay updates live
        ↓
Request history written to second Google Sheet
```

---

## File structure

```
vtuber-song-queue/
├── server/
│   ├── index.js       Main Express + WebSocket server, webhook handler, API routes
│   ├── config.js      ALL tuneable behaviour settings (thresholds, tabs, weights, speed)
│   ├── sheets.js      Reads song list from Google Sheets, caches to song-cache.json
│   ├── matcher.js     Fuse.js fuzzy matching with AUTO_ACCEPT_THRESHOLD
│   ├── queue.js       In-memory queue state, WebSocket broadcast to overlay clients
│   ├── twitch.js      EventSub registration (always deletes+re-registers on start), webhook signature verification
│   ├── history.js     Writes request history to separate Google Sheet (debounced 1.5s), startup snapshot for dashboard display
│   └── random.js      Weighted/pure random song picker, excludes songs already in queue
├── overlay/
│   └── index.html     OBS Browser Source — cyberpunk dark/neon style, WebSocket client
├── dashboard/
│   └── index.html     Streamer control panel — 4 columns, drag/drop, history display, manual add
├── setup.ps1          English first-time setup wizard
├── setup_zh.ps1       Traditional Chinese first-time setup wizard
├── start.ps1          English every-stream startup (ngrok + server)
├── start_zh.ps1       Traditional Chinese every-stream startup
├── SETUP.md           Quick setup guide (script-based)
├── SETUP_MANUAL.md    Full manual setup guide
├── SETUP_zh_TW.md     Traditional Chinese quick setup guide
├── .env.example       All environment variable descriptions (pure ASCII, UTF-8 BOM)
└── google-credentials.json  (not in repo) Google Service Account key
```

---

## Key design decisions

### Queue state (queue.js)
- `nowPlaying` — current song
- `queue[]` — upcoming songs
- `playedSongs[]` — finished songs
- `pending[]` — weak/unmatched requests awaiting manual review
- `startupSnapshot` in history.js — frozen at server start, used by dashboard to show "previous request" info without showing today's requests

### Twitch EventSub
- Always deletes and re-registers subscription on every server start
- This ensures webhook secret in `.env` always matches what Twitch uses
- Listens to ALL Channel Points redemptions (no reward_id filter)
- Routes by `rewardId` in webhook handler: `TWITCH_REWARD_ID` → matcher, `TWITCH_RANDOM_REWARD_ID` → random picker

### Google Sheets
- Song list: read-only, all tabs loaded except `EXCLUDED_TABS` in config.js
- History sheet: read-write, server creates headers on first run
- Key column: optional, must be numeric, stored as string `"0"`, `"-2"`, `"+3"` etc.
- Column names are configurable in `.env` (`SHEET_SONG_COLUMN`, `SHEET_ARTIST_COLUMN`)
- `key` column is always looked up as the literal string `"key"` (hardcoded)

### Encoding (critical — many bugs came from this)
- All PowerShell scripts use `[System.IO.File]::WriteAllText/ReadAllText` with `UTF8Encoding($false)` (UTF-8 **without** BOM) for `.env` file operations
- `Set-Content` / `Get-Content` without explicit encoding corrupts Chinese characters on Windows
- Setup scripts saved with UTF-8 BOM (`utf-8-sig`) so PowerShell 5.x parses them correctly
- `.env.example` is pure ASCII (no unicode decorations)
- `dotenv` reads `.env` as UTF-8 by default — this is fine as long as the file was written correctly

### Dashboard history display
- History loaded once on page open from `/api/history`
- `/api/history` returns `startupSnapshot` — frozen values from when server started
- This ensures "last requested X days ago" shows the previous stream's data, not today's

### Key badge display
- Shown as circle with `+3`, `-2`, `0` format
- `key >= 0` gets `+` prefix (so `0` shows as `+0`)
- Hidden from search dropdown, shown on all cards
- `key` is stored as a string — `"0" > 0` is false in JS (truthy/falsy bug fixed by using `key != null && key !== ''`)

---

## Known quirks and bugs fixed during development

1. **Twitch API URLs** use underscores: `channel_points/custom_rewards` NOT `channel-points/custom-rewards`
2. **`&` in PowerShell strings** must be backtick-escaped: `` `& `` — causes parse errors otherwise
3. **Trailing backslash** in PS strings (e.g. `"C:\ngrok\"`) escapes the closing quote — add a word after or use forward slashes
4. **Chinese corner quotes** `「」` inside PS double-quoted strings with variables cause parse errors — use plain ASCII quotes
5. **`key: 0`** is falsy in JS — all key checks use `key != null && key !== ''` not just `if (key)`
6. **`key || ''`** drops `0` — use `key != null ? String(key) : ''`
7. **Fuse.js** returns full song objects including `key` field — no special handling needed
8. **EventSub signature mismatch** — caused by stale subscription with old secret. Fixed by always deleting+re-registering on startup
9. **Race condition** — dashboard history loaded after WebSocket state arrives, causing empty history on first render. Fixed by calling `render()` inside `loadHistory()` callback
10. **`song-cache.json`** from before `key` support was added will not have key fields — delete to force regeneration
11. **PowerShell `-Encoding UTF8`** writes UTF-8 WITH BOM on PS 5.x — use .NET `UTF8Encoding($false)` instead

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/queue` | Current state (nowPlaying, queue, playedSongs, pending) |
| POST | `/api/add` | Manually add song `{title, artist, key, requester}` |
| POST | `/api/skip` | Move nowPlaying → played, pull next from queue |
| POST | `/api/clear` | Clear queue and nowPlaying |
| POST | `/api/delete` | Delete song `{zone, index}` — zone: nowPlaying/queue/played/pending |
| POST | `/api/move` | Move song `{fromZone, fromIndex, toZone, toIndex}` |
| POST | `/api/accept-pending` | Accept pending entry `{index, title, artist}` → queue |
| POST | `/api/refresh-songs` | Force re-fetch song list from Google Sheets |
| GET | `/api/songs` | Full song list (for dashboard autocomplete) |
| GET | `/api/history` | Request history snapshot (startup state) |

---

## Environment variables (.env)

See `.env.example` for full descriptions. Key ones:

- `TWITCH_REWARD_ID` — song request reward (requires text input)
- `TWITCH_RANDOM_REWARD_ID` — random song reward (no text input)
- `TWITCH_WEBHOOK_SECRET` — ASCII-only string, auto-generated by setup scripts
- `GOOGLE_SHEET_ID` — song list sheet
- `HISTORY_SHEET_ID` — request history sheet (needs Editor access)
- `SHEET_SONG_COLUMN` — song title column header in sheet (e.g. `曲名`)
- `SHEET_ARTIST_COLUMN` — artist column header (e.g. `歌手名`)
- `RANDOM_PICK_MODE` — `weighted` or `pure`
- `PUBLIC_URL` — ngrok HTTPS URL, updated automatically by start scripts

---

## Tuneable settings (server/config.js)

- `EXCLUDED_TABS` — sheet tabs to skip
- `SHEET_REFRESH_INTERVAL_MS` — how often to re-read the sheet (default 5min)
- `AUTO_ACCEPT_THRESHOLD` — confidence % for auto-queue vs pending (default 80)
- `MATCH_THRESHOLD` — fuse.js strictness 0-1 (default 0.4)
- `MATCH_TITLE_WEIGHT` / `MATCH_ARTIST_WEIGHT` — matching weights
- `RANDOM_NEVER_REQUESTED_WEIGHT` — weight for songs never requested (default 365)
- `RANDOM_MAX_DAYS_WEIGHT` — weight cap for old songs (default 180)
- `OVERLAY_SCROLL_PX_PER_SEC` — list auto-scroll speed (default 28)

---

## Overlay CSS variables (overlay/index.html `<style>` block)

- `--list-height` — height of Up Next and Played scroll areas
- `--panel-bg-alpha` — background opacity (set via dashboard WebSocket message)
- Font sizes: `.np-title` (32px), `.q-title` / `.p-title` (21px), artists (15px), requesters (13px)

---

## Streamer info

- **Language**: Traditional Chinese (zh_TW) primary, also streams Japanese songs
- **Sheet tabs**: 國語, 台語, 日語 (active) | 待練勿點 (excluded)
- **Rewards**: 點歌券 (song request, 500pts) | 隨機點歌券 (random, 300pts)

---

## Planned architectural change — remove ngrok requirement

Reference: https://github.com/lydek/twitch-song-request-system/commit/3b0ca3f

### The problem with current architecture

Every stream requires:
1. Start ngrok → copy URL → update `PUBLIC_URL` in `.env` → restart server
2. If ngrok URL changes mid-stream, EventSub subscription breaks

This is the most painful part of the current startup flow.

### The solution: EventSub WebSocket transport

Replace the current Webhook (HTTP) transport with **EventSub WebSocket**:
- App opens an **outbound** WebSocket connection to Twitch (`wss://eventsub.wss.twitch.tv/ws`)
- No inbound port needed — no ngrok, no public URL, no webhook secret
- Works entirely locally with no extra setup

### Auth change: Device Authorization Flow

The current app token (`client_credentials`) cannot subscribe to EventSub WebSocket.
A **user access token** with `channel:read:redemptions+channel:manage:redemptions` is required.

Replace the current auth flow with **Twitch Device Authorization Flow**:
- App requests a device code, shows user a short code
- User visits `twitch.tv/activate` and enters the code
- App polls until approved, receives `access_token` + `refresh_token`
- Tokens stored in `.env`, refresh token used to renew automatically
- No `TWITCH_CLIENT_SECRET` required (public client)

### New .env variables

```env
# Remove these (no longer needed):
# TWITCH_CLIENT_SECRET
# TWITCH_WEBHOOK_SECRET
# PUBLIC_URL

# Add these:
TWITCH_USER_ACCESS_TOKEN=
TWITCH_USER_REFRESH_TOKEN=
TWITCH_USER_TOKEN_EXPIRES_AT=
```

### Files that need changing

| File | Change |
|---|---|
| `server/twitch.js` | Replace Webhook registration with WebSocket client + Device Auth flow |
| `server/index.js` | Remove webhook route entirely |
| `.env.example` | Remove server-only vars, add token fields |
| `setup.ps1` / `setup_zh.ps1` | Replace User Token copy-paste step with Device Auth flow |
| `start.ps1` / `start_zh.ps1` | Remove ngrok entirely, much simpler |
| `SETUP.md` / `SETUP_zh_TW.md` | Remove ngrok section |
| `SETUP_MANUAL.md` | Remove ngrok section |

### How EventSub WebSocket works

```
App connects to: wss://eventsub.wss.twitch.tv/ws
        ↓
Twitch sends: session_welcome with session.id
        ↓
App subscribes using session.id + user access token:
  POST /helix/eventsub/subscriptions
  { transport: { method: "websocket", session_id: "..." } }
        ↓
Twitch sends events over the same connection
No public URL, no signature verification, no ngrok
```

Handle these message types:
- `session_welcome` → subscribe to rewards using `session.id`
- `notification` → same event handling as current webhook
- `session_reconnect` → reconnect to `payload.session.reconnect_url`
- `session_keepalive` → connection is healthy, no action needed


---

## User feedback — setup UX improvements needed

### Problem statement

Feedback from ordinary broadcasters (non-technical users) indicates the current setup process is too difficult:
- Too many manual steps requiring terminal commands
- Unfamiliar concepts (service accounts, webhook secrets, broadcaster IDs) with no explanation
- Copy-pasting tokens from browser URL bars is error-prone and confusing
- The PowerShell scripts help but still require right-clicking and understanding terminal output
- Google Cloud Console is intimidating for first-time users

### Goals for the improved setup experience

1. **Web UI setup wizard** — a browser-based setup page (no PowerShell knowledge needed)
2. **Comprehensive plain-language explanations** — explain every concept as if the user has never heard of it
3. **Fewer manual steps** — automate everything possible (token fetch, reward creation, sheet validation)
4. **Friendly error messages** — explain what went wrong and exactly how to fix it
5. **Progress persistence** — if setup is interrupted, resume from where it left off

---

## Planned: web-based setup wizard

Reference: the fork at lydek/twitch-song-request-system introduced a `setup/` folder with `index.html`, `setup.css`, `setup.js` as a web UI alternative.

### How it works

When the server starts for the first time (no `.env` or incomplete `.env`), it serves a setup wizard at `http://localhost:3000/setup` instead of (or alongside) the normal routes.

The user opens their browser, goes through a step-by-step wizard, and the server writes `.env` automatically. No terminal interaction needed beyond the initial `npm start`.

### Wizard pages / steps

Each step should:
- Explain **what** is being asked in plain language
- Explain **why** it is needed
- Show **exactly where** to find it (with screenshots or very clear instructions)
- Validate the input before moving to the next step
- Show a friendly error if something is wrong

**Step 1 — Welcome**
- What this system does (song requests via Channel Points)
- What accounts are needed (Twitch, Google)
- Estimated time to complete (~15 minutes)
- Button: "Let's get started"

**Step 2 — Twitch App**
- Plain explanation: "We need to create a small app on Twitch's developer site so our system can talk to Twitch on your behalf."
- Link to https://dev.twitch.tv/console/apps
- Exact instructions: Register app → Name (anything) → Redirect URL (`http://localhost:3000/setup/callback`) → Category: Other
- Input: Client ID
- Explanation: "Click Manage on your app. The Client ID is shown at the top."
- No Client Secret needed in local mode (Device Auth Flow)
- Validate: test the Client ID by calling `/helix/` before proceeding

**Step 3 — Twitch Authorization**
- Plain explanation: "Now we need your permission to manage Channel Points on your channel."
- Trigger Device Authorization Flow from the server
- Show user code prominently: "Visit twitch.tv/activate and enter this code: **ABCD-1234**"
- Show countdown timer (device codes expire in ~30 min)
- Poll in background, auto-advance when authorized
- On success: store tokens in `.env`, show "Connected as [display_name]"

**Step 4 — Channel Points Rewards**
- Plain explanation: "We'll create two reward buttons that your viewers can click to request songs."
- Show preview of what the rewards will look like
- Input: point cost for Song Request reward (default 500)
- Input: point cost for Random Song reward (default 300)
- Button: "Create Rewards" — calls API, shows success with reward names
- If rewards already exist: detect and confirm with user

**Step 5 — Google Sheets (Song List)**
- Plain explanation: "Your song list lives in Google Sheets. We need read access to it."
- Sub-step A: Google Cloud Service Account
  - Plain explanation: "Google needs a special 'robot account' (service account) that our system can use to read your sheet. It's like giving a key to a trusted helper."
  - Step-by-step with numbered instructions and links for each step
  - "Download the JSON file and drag it here" — file upload input
  - Validate the file is valid JSON with correct fields
- Sub-step B: Sheet ID
  - "Open your song list in Google Sheets and paste the URL here" — parse Sheet ID from URL automatically
  - Don't ask for the raw ID — let them paste the full URL
- Sub-step C: Column names
  - "Which column has the song titles?" — show a preview table from the actual sheet
  - User clicks on the correct column rather than typing the name
  - Same for artist column and key column
- Validate: fetch first 5 songs and show them as a preview

**Step 6 — History Sheet (optional)**
- Plain explanation: "We can track how often each song gets requested and who requested it. This is optional."
- "Create a new blank Google Sheet" — link to sheets.new
- "Share it with this email address: [service account email]" — copy button
- Paste URL (parse ID automatically)
- Button: "Skip this for now"

**Step 7 — OBS Browser Source**
- Plain explanation: "The song queue overlay shows up on your stream. Here's how to add it to OBS or Streamlabs."
- Tabbed instructions: OBS Studio | Streamlabs
- Show the exact URL to use: `http://localhost:3000/overlay/index.html`
- Show the Custom CSS to paste
- Show recommended width/height
- "Test it now" button — opens overlay in new tab

**Step 8 — Done**
- Summary of what was configured
- Quick-start card: "Every stream, just run `start.ps1` (or `start_zh.ps1`)"
- Link to dashboard: `http://localhost:3000/dashboard`
- "Start streaming now" button — redirects to dashboard

### Technical implementation notes

- Setup wizard served at `/setup` as static HTML/CSS/JS
- JS calls local API endpoints for each setup step:
  - `POST /setup/api/validate-client-id` — test Client ID
  - `POST /setup/api/start-device-auth` — begin Device Auth flow, returns user_code
  - `GET /setup/api/poll-device-auth` — check if authorized yet
  - `POST /setup/api/create-rewards` — create Channel Points rewards
  - `POST /setup/api/validate-sheet` — test sheet access, return column headers + preview rows
  - `POST /setup/api/save` — write completed config to `.env`
- Server detects incomplete setup on startup and redirects to `/setup`
- Progress saved in a `setup-progress.json` file so setup can be resumed
- Setup routes disabled after `.env` is complete (security)

### Comprehensive explanations — writing guidelines

Every concept explained to a non-technical streamer:

| Concept | Plain language explanation |
|---|---|
| Client ID | "A public identifier for our app — like a username for the app" |
| Service Account | "A special Google account for programs, not people — like giving a robot a library card to read your books" |
| Channel Points reward | "The custom buttons viewers can click to spend their points — we're creating two new ones" |
| Device code | "A short temporary password that links your Twitch account to this app — expires in 30 minutes" |
| Access token | "A key that lets this app act on your behalf for a limited time — automatically renewed" |
| Refresh token | "A master key that lets us get new access tokens when they expire — stored securely on your computer" |
| Webhook / EventSub | Never mention these to users — implementation detail only |
| ngrok | Never mentioned in new setup — no longer needed |
| Sheet ID | "The unique code in your Google Sheet's web address" |

### Migration from current PowerShell setup

Existing users who already have `.env` configured:
- Web setup detects existing `.env` and shows "Already configured" with a summary
- Option to re-run specific steps (e.g. re-authorize Twitch, change sheet)
- Existing `.env` values pre-filled in inputs

### Files to create/modify

```
vtuber-song-queue/
├── setup/
│   ├── index.html       Single-page wizard UI
│   ├── setup.css        Styles (match cyberpunk theme of overlay)
│   └── setup.js         Wizard logic, API calls, step management
├── server/
│   ├── setup-routes.js  All /setup/api/* endpoints
│   └── index.js         Add setup route mounting, redirect logic
```
