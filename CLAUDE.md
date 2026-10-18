# CLAUDE.md — Project Context for AI Assistants

This file documents the full context of the VTuber Song Queue project so any AI assistant
can quickly understand the codebase and continue development without re-explaining history.

---

## What this project is

A **Twitch Channel Points song request system** for a VTuber singer.

Viewers redeem Channel Points to request songs. The server matches requests against a
Google Sheets song list using fuzzy matching, and updates a cyberpunk-styled OBS overlay
in real time via WebSocket. It also runs moderator chat commands (`!so`, `!watch`, `!tk` …)
that play clips and a sponsor roll in a second OBS source, the clip player.

Everything runs locally on the streamer's PC. There is no public URL, no ngrok and no
webhook: the server opens an outbound WebSocket to Twitch.

---

## Architecture

```
Viewer redeems Channel Points          Mod types !so / !watch / !tk in chat
        ↓                                       ↓
Twitch EventSub WebSocket (outbound) → Express server (Node.js, PORT, default 3000)
        ↓                                       ↓
Route by reward ID:                     chat-router.js → commands/*.js
  TWITCH_REWARD_ID → fuzzy match                ↓
    ≥80% confidence → queue             media-queue.js (max 3, watchdog)
    <80% / no match → Pending                   ↓
  TWITCH_RANDOM_REWARDS → random pick   WebSocket → clip-player (OBS source)
  anything else → ignored
        ↓
WebSocket broadcast → overlay (OBS source) + dashboard
        ↓
Song finished → request history written to second Google Sheet
```

---

## File structure

```
vtuber-song-queue/
├── server/
│   ├── index.js           Express + WebSocket server, redemption routing, REST API, HLS/clip proxy
│   ├── config.js          Tuneable behaviour settings (thresholds, excluded tabs, weights)
│   ├── twitch.js          EventSub WebSocket client, token refresh (ensureFreshToken), dedupe
│   ├── twitch-clips.js    Clip lookup + signed playback URLs for !so / !watch
│   ├── setup-routes.js    All /setup/api/* endpoints for the web setup wizard
│   ├── request-guard.js   Blocks cross-site and DNS-rebinding requests (HTTP + WebSocket)
│   ├── sheets.js          Reads song list from Google Sheets, caches to song-cache.json
│   ├── matcher.js         Fuse.js fuzzy matching with AUTO_ACCEPT_THRESHOLD
│   ├── queue.js           Queue state, broadcast to clients, persisted to queue-state.json
│   ├── random.js          Weighted/pure random picker with tab filter and cooldown
│   ├── leihu.js           Optional link to Leihu Singsing (backing tracks + lyrics), song-links.json
│   ├── link-finder.js     Finds YouTube links for the sheet (search job, review, writes the sheet)
│   ├── link-score.js      Scores YouTube candidates against the lyric version (pure functions)
│   ├── romaji.js          Matches romanized video titles to 漢字/かな song titles
│   ├── data/han-readings.json  Pinyin + Japanese readings per 漢字 (generated from Unicode's Unihan)
│   ├── history.js         Request history sheet (debounced 1.5s), startup snapshot
│   ├── chat-router.js     Dispatches chat messages to registered commands (mods-only by default)
│   ├── media-queue.js     Clip player queue (max 3), mediaId matching, watchdog
│   ├── media-history.js   Last played media, for !replay
│   ├── shoutout-history.js  Broadcasters shouted out since the last !tk
│   ├── sponsor-voice.js   Generates the Japanese sponsor-roll voice line on first run
│   └── commands/          shoutout.js (!so), watch.js (!watch), replay.js, stop.js, thanks.js (!tk)
├── setup/                 Web setup wizard (index.html, setup.css, setup.js, i18n.js — EN + zh-TW)
├── overlay/index.html     OBS Browser Source — song queue, cyberpunk dark/neon style
├── dashboard/index.html   Streamer control panel — 2×2 panels, drag/drop, history, manual add, ⚙ settings popover
├── dashboard/links.html   YouTube link finder review page
├── clip-player/
│   ├── index.html         OBS Browser Source — clips, YouTube, sponsor roll (!tk)
│   ├── hls.min.js
│   └── sponsor-bgs/       !tk background images (one picked at random each time)
├── test/                  node:test suite (`npm test`), stubs Google Sheets
├── tools/find-videos.py   Lyric-site + YouTube search, run with Leihu Singsing's bundled Python
├── tools/build-han-readings.js  Rebuilds server/data/han-readings.json from Unihan_Readings.txt
├── setup.ps1 / setup_zh.ps1   Terminal setup wizard (alternative to the web wizard)
├── start.ps1 / start_zh.ps1   Every-stream startup: starts server, opens browser when ready
├── *.bat                  Double-click launchers (avoid PowerShell execution-policy issues)
├── SETUP.md / SETUP_zh_TW.md / SETUP_MANUAL.md   User guides
├── SKILL.md               Notes on Twitch/Google APIs and PowerShell gotchas
└── .env.example           All environment variable descriptions (pure ASCII)
```

**Never commit** (all gitignored): `.env`, `google-credentials.json`, `song-cache.json`,
`setup-progress.json`, `queue-state.json`, `song-links.json`, `link-search.json`, `package-lock.json`,
`.env` backups.
`setup-progress.json`, `queue-state.json` and `package-lock.json` contain personal info.

---

## Key design decisions

### Twitch EventSub (twitch.js)
- Outbound WebSocket to `wss://eventsub.wss.twitch.tv/ws`; on `session_welcome`, subscribes to
  `channel.channel_points_custom_reward_redemption.add` and `channel.chat.message`
- `session_reconnect` → reconnect to the given URL; socket close → reconnect after 5s
- Notifications are deduplicated by `message_id` (Twitch delivers at-least-once)
- Auth: user access token from **Device Authorization Flow** (public client, no client secret).
  Scopes: `channel:read:redemptions channel:manage:redemptions user:read:chat`
- `ensureFreshToken()` refreshes 1 min before expiry. Call it before **every** Helix call.
  Concurrent calls share one refresh (`refreshPromise`) — Twitch rotates the refresh token,
  so two parallel refreshes would invalidate each other
- A rejected refresh token (400) clears the stored tokens, which sends the user back to the
  wizard's re-authorize step

### Redemption routing (index.js)
- Listens to ALL Channel Points redemptions, then routes by reward ID:
  `TWITCH_RANDOM_REWARDS` entry → random picker (with that entry's tab filter);
  `TWITCH_REWARD_ID` → matcher; anything else → ignored (other rewards may also take text input)

### Queue state (queue.js)
- `nowPlaying`, `queue[]`, `playedSongs[]`, `pending[]` (weak/unmatched requests for review)
- Random entries carry `isRandom` and their reward's `tabs`, so a redraw stays in those tabs
- Every change is written to `queue-state.json`; restored at startup only if saved within
  6 hours (a crash mid-stream recovers; yesterday's leftovers don't reappear)
- History is recorded when a song is **finished** (skip / moved to played), not when queued

### Random picker (random.js)
- `RANDOM_PICK_MODE`: `weighted` (favours songs not requested recently) or `pure`
- Excludes songs in nowPlaying/queue/played and songs requested within `RANDOM_COOLDOWN_DAYS`
- Cooldown uses live history; weighting uses the startup snapshot

### Google Sheets
- Song list: read-only, all tabs loaded except `EXCLUDED_TABS` in config.js. Range strings
  quote the tab name (`'Rock ''n'' Roll'!A:Z`)
- Column headers configurable in `.env`: `SHEET_SONG_COLUMN`, `SHEET_ARTIST_COLUMN`,
  `SHEET_KEY_COLUMN` (default `key`). Matching is case-insensitive
- Key column: optional, must be numeric, stored as string `"0"`, `"-2"`, `"3"`; other values ignored
- Songs deduped by title + artist (same title, different artist = different song)
- History sheet: needs **Editor** access (the wizard verifies with a no-op write); server
  creates headers on first run. History rows are keyed by title only

### Request guard (request-guard.js) — security
- The server listens on all interfaces and has no login, and the body parser accepts any
  Content-Type, so without a guard any web page could POST to it through the streamer's browser
- Rejected: requests whose `Origin` doesn't match `Host`, and requests whose `Host` is a public
  domain (DNS rebinding). Allowed: IPs, `localhost`, LAN names (no dots or `.local`) — so a
  two-PC OBS setup works. Same check on WebSocket upgrades
- `writeEnvValues` rejects values with line breaks (would inject extra `.env` lines)
- Setup routes stay available after setup (re-run / re-authorize need them); the guard is what
  protects them

### Encoding (critical — many bugs came from this)
- All PowerShell scripts use `[System.IO.File]::WriteAllText/ReadAllText` with `UTF8Encoding($false)` (UTF-8 **without** BOM) for `.env` file operations
- `Set-Content` / `Get-Content` without explicit encoding corrupts Chinese characters on Windows
- Scripts containing Chinese (`setup_zh.ps1`, `start_zh.ps1`) are saved with UTF-8 BOM so PowerShell 5.x parses them correctly; the English ones are pure ASCII
- `.env.example` is pure ASCII (no unicode decorations)
- `dotenv` reads `.env` as UTF-8 by default — this is fine as long as the file was written correctly

### Dashboard history display
- History loaded once on page open from `/api/history`
- `/api/history` returns `startupSnapshot` — frozen values from when server started
- This ensures "last requested X days ago" shows the previous stream's data, not today's

### Key badge display
- Shown as circle with `+3`, `-2`, `+0` format (`key >= 0` gets a `+` prefix)
- Hidden from search dropdown, shown on all cards
- `key` is stored as a string — check with `key != null && key !== ''`, never `if (key)`

### Media / clip player (media-queue.js, clip-player/)
- One item plays at a time, up to 3 queued; extra requests are dropped
- Each item gets a `mediaId`; the clip player echoes it in `media-ended`, so a second open
  player can't skip the next item
- Watchdog: if no end signal arrives within the expected length + 15s (e.g. no clip player
  open), the queue moves on by itself

### Leihu Singsing integration (leihu.js) — optional
- Leihu Singsing (雷虎練唱台, github.com/LeihuTW/Leihu-singsing) is a separate local app that
  splits songs into backing tracks, transposes them and runs an OBS lyrics overlay. It's
  third-party: we only call its existing API at `LEIHU_URL` (default `http://127.0.0.1:8765`)
  and keep changes to it minimal
- Polls its `/api/songs` + `/api/status` every 5s (30s while unreachable). Offline = no badges,
  the queue works as before
- A queue entry links to a Leihu song by **YouTube video ID** (sheet column `YTLink`
  vs Leihu's `source_url`), or by a manual link picked on the dashboard and saved in
  `song-links.json` (key `title|artist` lowercased → Leihu song ID), for audio-file imports
- Dashboard badge per queued song: ready / no lyrics / preparing / failed / prepare (not in
  Leihu) / link broken / link. "No lyrics": Leihu 1.4.7+ finishes processing with blank lyrics
  when its recognition is unreliable — the streamer picks online lyrics in Leihu
- Blank lyrics on songs **we** imported (Prepare, auto-prepare, "Check with Leihu"; tracked
  per server run) are filled once: a Leihu lyric candidate with timed lyrics, the sheet's title
  (brackets ignored), the sheet's artist and ≤ 3 s from the audio — first from the candidates
  Leihu saved (`/lyrics/candidates`), else Leihu's search by sheet title + artist
  (`/lyrics/search?q=`), applied with `POST /lyrics/apply`. Lyrics Leihu set are never replaced
- Imports set Leihu's per-song recognition language from the sheet tab
  (`LEIHU_TAB_LANGUAGES` in config.js; 台語 stays automatic). Needs Leihu 1.4.7+
- Sing button (Now Playing): asks Leihu's practice window to open the song at the sheet key.
  Needs the remote-open patch (`/api/remote/open`, local branch `remote-open` in the Leihu
  repo, not upstream yet); shown only when Leihu's `/api/status` has a `remote` field
- `LEIHU_AUTO_PREPARE=1` (dashboard toggle): imports missing queued songs via Leihu's
  `POST /api/youtube`, then renders the sheet key via `POST /api/songs/<id>/variant`. Each
  request is sent once per server run. Keys outside whole semitones ±6 are skipped
- Leihu's import returns an error for duplicates only after the download step — never send
  the same video twice; the `requested` map in leihu.js prevents it

### YouTube link finder (link-finder.js, link-score.js, tools/find-videos.py)
- Owns the sheet's YouTube link column: header `YTLink` (`YT_LINK_HEADER` in config.js), never
  configured in `.env` or the wizard. Fills it for songs without a link; a tab without the
  column is still searched, and gets the column (right after its last used header, growing
  the grid if needed) the first time links are saved there. Review page: `/dashboard/links.html`
- Search: `tools/find-videos.py` runs with **Leihu's bundled Python** (`<root>/python/python.exe`,
  root from Leihu's `/api/status`, so Leihu must be running) and calls Leihu's own
  `search_lrclib/netease/kugou`, `_norm`, `to_simplified` and yt-dlp (`ytsearch10`, metadata
  only). Zero changes to Leihu; the helper refuses to run if those functions are missing.
  JSON lines in/out. ~7.5 s per song (LRCLIB often errors from here; NetEase/Kugou carry 中文)
- Scoring (link-score.js): reference length = the lyric-result length (exact title, artist
  preferred) with the most support from other lyric results and videos. Tiers match Leihu:
  ≤3 s exact (timed lyrics used as-is), ≤25 s and 0.8–1.25 ratio workable (Leihu re-times),
  else off. Bonuses: "- Topic" channels, official/label channels, artist spelled as on the lyric
  sites. Penalties: live, TV show, cover, instrumental/伴奏, remix, compilation, fan edit,
  karaoke, other-language version (allowed when it is the tab's language; never offered otherwise)
- Romanized titles (romaji.js): a run of whole Latin words in the video title that spells the
  sheet title counts as a title match — each 漢字 by pinyin or any Japanese reading (一青窈's
  四照花 is "Shishouka"), かな as written, loosely (Hepburn/Kunrei, long vowels, doubling,
  rendaku, okurigana, particles は/へ). Needs ≥ 2 漢字/かな. Tagged "romanized title", so it is
  offered but never confident (a 國語 song's Japanese original can spell the same 漢字)
- Groups: confident (top pick is exact length, no penalties, artist matches, and official —
  or a fan upload with ≥ `LINK_CONFIDENT_FAN_VIEWS` views) / needs a look / nothing found
- State in `link-search.json` (raw search results + decisions): restarts resume, and scoring
  is recomputed from the raw results, so scoring changes need no new search
- Editor access is asked for on the review page, not in the wizard (the song list itself only
  needs view access, and finished setups never see the wizard again): a "Step 1" card shows
  the service-account email (copy button) and a link to the sheet; "Check access" runs the
  no-op A1 write and keeps the result in `link-search.json` (per sheet ID), after which the card
  shrinks to one line. Never checked on page load — even a no-op write can appear in the sheet's
  version history. Searching and reviewing work without access; Save is disabled until checked
- Saving: proves Editor access again with a no-op write of A1 (a protected tab/range gets its
  own readable error), re-reads the sheet, finds each row
  again by tab + title + artist, writes only **empty** link cells (`values.batchUpdate`, RAW).
  Songs are read from A:Z, so a tab already using all 26 columns can't get the column added
- "Check with Leihu": imports the video into Leihu (language from the tab), waits for
  processing, then reads `lyrics/candidates` similarity. Inconclusive when Leihu's recognition
  is unreliable (usual for 台語). Adds the song to Leihu's library

---

## Chat commands (mods and broadcaster only)

| Command | Description |
|---|---|
| `!so <user>` | Plays a random clip of that channel, remembers them for `!tk` |
| `!watch <url>` | Plays a Twitch clip, YouTube video or direct video file |
| `!replay` | Replays the last media |
| `!stop` | Stops playback and clears the media queue |
| `!tk` | Japanese-TV-style sponsor roll of everyone `!so`'d since the last `!tk` |

Add a command: create `server/commands/<name>.js` exporting `register(registerCommand)`, then
register it in index.js.

---

## Known quirks and bugs fixed during development

1. **Twitch API URLs** use underscores: `channel_points/custom_rewards` NOT `channel-points/custom-rewards`
2. **`&` in PowerShell strings** must be backtick-escaped: `` `& `` — causes parse errors otherwise
3. **Trailing backslash** in PS strings (e.g. `"C:\tools\"`) escapes the closing quote — add a word after or use forward slashes
4. **Chinese corner quotes** `「」` inside PS double-quoted strings with variables cause parse errors — use plain ASCII quotes
5. **`key: 0`** is falsy in JS — all key checks use `key != null && key !== ''` not just `if (key)`
6. **`key || ''`** drops `0` — use `key != null ? String(key) : ''`
7. **Fuse.js** returns full song objects including `key` field — no special handling needed
8. **Race condition** — dashboard history loaded after WebSocket state arrives, causing empty history on first render. Fixed by calling `render()` inside `loadHistory()` callback
9. **`song-cache.json`** from before `key` support was added will not have key fields — delete to force regeneration
10. **PowerShell `-Encoding UTF8`** writes UTF-8 WITH BOM on PS 5.x — use .NET `UTF8Encoding($false)` instead
11. **Refresh tokens rotate** — never restore `.env` from a backup taken before the server last refreshed; the old refresh token is dead and Twitch auth breaks
12. **PS 5.1 strips double quotes** from arguments passed to native programs (e.g. JSON to `node -e`) — write to a file instead
13. **Google Sheets range strings** wrap CJK/space tab names in single quotes in responses — don't parse tab names back out of `valueRange.range`

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/queue` | Current state (nowPlaying, queue, playedSongs, pending) |
| POST | `/api/add` | Manually add song `{title, artist, key, requester}` |
| POST | `/api/skip` | Move nowPlaying → played (records history), pull next from queue |
| POST | `/api/clear` | Clear queue and nowPlaying |
| POST | `/api/delete` | Delete song `{zone, index}` — zone: nowPlaying/queue/played/pending |
| POST | `/api/move` | Move song `{fromZone, fromIndex, toZone, toIndex}` |
| POST | `/api/accept-pending` | Accept pending entry `{index, title, artist}` or `{index, candidateIndex}` → queue |
| POST | `/api/redraw` | Re-pick a random song in place `{zone, index}` (keeps its tab filter) |
| POST | `/api/refresh-songs` | Force re-fetch song list from Google Sheets |
| GET | `/api/songs` | Full song list (for dashboard autocomplete) |
| GET | `/api/history` | Request history snapshot (startup state) |
| GET/POST | `/api/settings` | Random cooldown days, overlay panel opacity, text brightness |
| GET | `/api/hls`, `/api/clip-stream` | Proxies for Twitch clip playback (Twitch hosts only) |
| GET | `/api/leihu/status` | Leihu state of nowPlaying + queue, keyed by title + artist |
| GET | `/api/leihu/library` | Leihu's songs, for the dashboard link picker |
| POST | `/api/leihu/link` | Manual link `{title, artist, id}` — `id: null` unlinks |
| POST | `/api/leihu/prepare` | Import / render key for one song now `{title, artist, key}` |
| POST | `/api/leihu/open` | Open the song in Leihu's practice window at its sheet key `{title, artist, key}` |
| GET | `/api/links` | Link finder: job progress + scored songs for review |
| POST | `/api/links/start` | Search songs without a link `{limit?}` (resumes) |
| POST | `/api/links/stop` | Stop the search |
| POST | `/api/links/decide` | `{key, decision: 'accepted' \| 'skipped' \| null, videoId}` (videoId: ID or any YouTube link) |
| POST | `/api/links/accept-confident` | Accept every confident pick |
| POST | `/api/links/access` | Check Editor access to the song sheet (no-op write) → `{canEdit, checked, error}` |
| POST | `/api/links/save` | Write accepted links into empty sheet cells |
| POST | `/api/links/check` | Verify a candidate with Leihu `{key, videoId}` (imports it) |

Setup wizard (`/setup/api/*`): `status`, `validate-client-id`, `start-device-auth`,
`poll-device-auth`, `rewards`, `create-rewards`, `upload-credentials`, `validate-sheet`,
`save-columns`, `sheet-tabs`, `save-random-rewards`, `save-history`.

---

## Environment variables (.env)

See `.env.example` for full descriptions.

- `TWITCH_CLIENT_ID` — public client ID of the streamer's Twitch app
- `TWITCH_BROADCASTER_ID`, `TWITCH_USER_ACCESS_TOKEN`, `TWITCH_USER_REFRESH_TOKEN`, `TWITCH_USER_TOKEN_EXPIRES_AT` — set by Device Auth, refreshed automatically
- `TWITCH_REWARD_ID` — song request reward (requires text input)
- `TWITCH_RANDOM_REWARDS` — JSON array of random song rewards; each entry has `id`, `name`, and `tabs` (empty array = all tabs)
- `GOOGLE_SHEET_ID` — song list sheet
- `SHEET_SONG_COLUMN` / `SHEET_ARTIST_COLUMN` / `SHEET_KEY_COLUMN` — column headers (e.g. `曲名`, `歌手名`, `key`)
- `HISTORY_SHEET_ID` — request history sheet (needs Editor access)
- `PORT` — default 3000
- `RANDOM_PICK_MODE` — `weighted` or `pure`
- `RANDOM_COOLDOWN_DAYS`, `OVERLAY_PANEL_BG_ALPHA`, `OVERLAY_TEXT_BRIGHTNESS` — also adjustable from the dashboard
- `LEIHU_URL` — Leihu Singsing address (default `http://127.0.0.1:8765`)
- `LEIHU_AUTO_PREPARE` — `1` = prepare queued songs in Leihu ahead of time (dashboard toggle)

---

## Tuneable settings (server/config.js)

- `EXCLUDED_TABS` — sheet tabs to skip
- `YT_LINK_HEADER` — header of the YouTube link column the link finder creates and fills (`YTLink`)
- `LINK_CONFIDENT_FAN_VIEWS` — views a fan upload needs to count as a confident pick (1,000,000; 0 = never)
- `SHEET_REFRESH_INTERVAL_MS` — how often to re-read the sheet (default 5min)
- `AUTO_ACCEPT_THRESHOLD` — confidence % for auto-queue vs pending (default 80)
- `MATCH_THRESHOLD` — fuse.js strictness 0-1 (default 0.4)
- `MATCH_TITLE_WEIGHT` / `MATCH_ARTIST_WEIGHT` — matching weights
- `RANDOM_NEVER_REQUESTED_WEIGHT` — weight for songs never requested (default 365)
- `RANDOM_MAX_DAYS_WEIGHT` — weight cap for old songs (default 180)
- `LEIHU_TAB_LANGUAGES` — Leihu recognition language per sheet tab

---

## Overlay settings (overlay/index.html)

- `SCROLL_PX_PER_SEC` (script) — list auto-scroll speed (16)
- `--list-height` — height of Up Next and Played scroll areas
- `--panel-bg-alpha` — background opacity (set via dashboard WebSocket message)
- Font sizes: `.np-title` (32px), `.q-title` / `.p-title` (21px), artists (15px), requesters (13px)

---

## Testing

- `npm test` runs `test/*.test.js` with Node's built-in runner — no extra dependencies
- Tests stub `sheets.js` / `history.js` through `test/helpers.js` so they never touch Google,
  Twitch or the real `.env`
- Don't add tests that load `queue.js` or `sheets.js` unstubbed from the repo root: they write
  `queue-state.json` / `song-cache.json` there

---

## Streamer info

- **Language**: Traditional Chinese (zh_TW) primary, also streams Japanese songs
- **Sheet tabs**: 國語, 台語, 日語, 催熟區 (active) | 待練勿點 (excluded)
- **Rewards**: 點歌券 (song request, 500pts) | 隨機點歌券 (random, 300pts) | per-tab random rewards

---

## Setup wizard (setup/ + server/setup-routes.js)

Built for non-technical streamers. When `.env` is incomplete, `/` redirects to `/setup`.
Steps: welcome → Twitch app (Client ID) → Twitch authorization (device code) → rewards →
Google credentials (drag in JSON) → song sheet (paste URL, click columns) → per-tab random
rewards → history sheet (optional) → OBS instructions → done.

- Progress resumes from what `.env` already has (`/setup/api/status`); if only the Twitch
  tokens are missing it jumps straight to re-authorization
- Client ID is validated by requesting a device code (Twitch answers "invalid client")
- Re-running the rewards step keeps per-tab random rewards
- The PowerShell scripts are an alternative path and must write the same `.env` keys

Every step should explain **what** is asked, **why**, and **exactly where** to find it,
validate before moving on, and show a friendly fix-it error.

### Plain-language explanations for users

| Concept | Plain language explanation |
|---|---|
| Client ID | "A public identifier for our app — like a username for the app" |
| Service Account | "A special Google account for programs, not people — like giving a robot a library card to read your books" |
| Channel Points reward | "The custom buttons viewers can click to spend their points — we're creating two new ones" |
| Device code | "A short temporary password that links your Twitch account to this app — expires in 30 minutes" |
| Access token | "A key that lets this app act on your behalf for a limited time — automatically renewed" |
| Refresh token | "A master key that lets us get new access tokens when they expire — stored securely on your computer" |
| Webhook / EventSub | Never mention these to users — implementation detail only |
| ngrok | Never mention — no longer used |
| Sheet ID | "The unique code in your Google Sheet's web address" |
