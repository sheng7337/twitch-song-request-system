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
│   ├── leihu-launcher.js  Starts Leihu without its window (dashboard Leihu tab), leihu-home.json
│   ├── link-finder.js     Finds YouTube links for the sheet (search job, review, writes the sheet)
│   ├── link-score.js      Scores YouTube candidates against the lyric version (pure functions)
│   ├── romaji.js          Matches romanized video titles to 漢字/かな song titles
│   ├── data/han-readings.json  Pinyin + Japanese readings per 漢字 (generated from Unicode's Unihan)
│   ├── history.js         Request history sheet (debounced 1.5s), startup snapshot
│   ├── chat-router.js     Dispatches chat messages to registered commands (mods-only by default)
│   ├── chat-log.js        Chat + redemption log for the dashboard Chat tab, chat-logs/YYYY-MM-DD.jsonl
│   ├── song-notes.js      Song overlay note "last sung N days ago" when chat names a sheet song
│   ├── media-queue.js     Clip player queue (max 3), mediaId matching, watchdog
│   ├── media-history.js   Last played media, for !replay
│   ├── shoutout-history.js  Broadcasters shouted out since the last !tk
│   ├── sponsor-voice.js   Generates the Japanese sponsor-roll voice line on first run
│   ├── messages.js        Message codes for errors/notes the web pages show translated
│   ├── node-check.js      Is Node.js below the secure minimum (`secureNode` in package.json)
│   ├── ending-credits.js  Who !endingtk thanks, from the chat log (groups, avatars, ending-credits.json)
│   ├── redemptions.js     Redemptions done / refunded (Chat tab, queue songs); taking over rewards made on Twitch
│   ├── first-chat.js      Anonymous read-only IRC: Twitch's first-msg flag → chat-log markFirst
│   ├── chat-send.js       The Chat tab's message box: Helix POST /chat/messages (replies too)
│   ├── stream-session.js  When the stream went live (stream.online / Helix /streams), for "to announce"
│   ├── stream-window.js   The dashboard in its own Chrome / Edge window, so OBS can capture Leihu's sound
│   └── commands/          shoutout.js (!so), watch.js (!watch), replay.js, stop.js, thanks.js (!tk), ending-thanks.js (!endingtk)
├── shared/                Served at /shared: i18n.js (language helper), i18n-server.js (server
│                          messages), i18n-viewer.js (overlay + clip player strings)
├── dashboard/i18n-dashboard.js, dashboard/i18n-links.js   Page strings, EN + zh-TW
├── setup/                 Web setup wizard (index.html, setup.css, setup.js, i18n.js — EN + zh-TW)
├── overlay/index.html     OBS Browser Source — song queue, cyberpunk dark/neon style
├── dashboard/index.html   Streamer control panel — tabs (Song Queue: 2×2 panels, drag/drop, history, manual add; Leihu; Chat), ⚙ per tab
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
`setup-progress.json`, `queue-state.json`, `song-links.json`, `leihu-home.json`, `chat-logs/`, `link-search.json`, `package-lock.json`,
`ending-credits.json`, `reward-takeovers.json`, `stream-session.json`, `.env` backups.
`setup-progress.json`, `queue-state.json` and `package-lock.json` contain personal info.

---

## Key design decisions

### Twitch EventSub (twitch.js)
- Outbound WebSocket to `wss://eventsub.wss.twitch.tv/ws`; on `session_welcome`, subscribes to
  `channel.channel_points_custom_reward_redemption.add` and `channel.chat.message`, then (each
  optional, a failure leaves the rest working) `channel.chat.message_delete` / `clear_user_messages` /
  `clear`, `channel.chat.notification`, `…_redemption.update`, `channel.channel_points_custom_reward.remove`,
  `stream.online` / `stream.offline` and `channel.follow` v2 (`moderator:read:followers`)
- `session_reconnect` → reconnect to the given URL; socket close → reconnect after 5s
- Notifications are deduplicated by `message_id` (Twitch delivers at-least-once)
- Auth: user access token from **Device Authorization Flow** (public client, no client secret).
  Scopes: `channel:read:redemptions channel:manage:redemptions user:read:chat user:write:chat moderator:read:followers`
  (older setups lack the last two: the dashboard links to `/setup?reauth=1`, which jumps to the
  wizard's authorization step). setup.ps1 / setup_zh.ps1 ask for the same scopes
- `ensureFreshToken()` refreshes 1 min before expiry. Call it before **every** Helix call.
  Concurrent calls share one refresh (`refreshPromise`) — Twitch rotates the refresh token,
  so two parallel refreshes would invalidate each other
- A rejected refresh token (400) clears the stored tokens, which sends the user back to the
  wizard's re-authorize step

### Redemption routing (index.js)
- Listens to ALL Channel Points redemptions, then routes by reward ID:
  `TWITCH_RANDOM_REWARDS` entry → random picker (with that entry's tab filter);
  `TWITCH_REWARD_ID` → matcher; anything else → ignored (other rewards may also take text input)
- Songs from a redemption carry `redemption: {id, rewardId}` through pending / accept / moves / redraw.
  queue.js `settle()` hands it to `redemptions.settle` once and drops it: **done** (FULFILLED) when the
  song goes to Played (✓ Finished, or dragged there), **refunded** (CANCELED) when it's deleted from
  now playing / queue / pending, or when a random reward has nothing left to draw. Clear All leaves
  them waiting. Only rewards this app's Client ID created can be changed (Twitch's rule); others are
  skipped silently and stay in Twitch's own queue

### Channel-point redemptions (redemptions.js)
- `manageableIds()`: `only_manageable_rewards=true`, cached 10 min. `setStatus` PATCHes
  `/channel_points/custom_rewards/redemptions` (404 = already handled → `redemptionHandled`)
- Status in the chat log: `redeem.status` from the add event (`unfulfilled` / `fulfilled` for
  skip-queue rewards), later `{kind: 'redeem-status', at, id, status}` lines in the redemption's day
  file (at = the redemption's time), applied on load, pushed as `{type: 'chat-redeem'}`. Sources:
  `channel.channel_points_custom_reward_redemption.update` (any reward, done here or on Twitch)
  and the app's own PATCH response
- Takeover of a reward made on Twitch (Chat ⚙ → Channel-point rewards): `startTakeover` creates a
  disabled copy (`copyOf`: cost, prompt, color, text input, skip-queue, limits, cooldown — the icon
  can't be set by apps) named `<title> (new)` (titles must be unique). The streamer deletes the
  original on Twitch; `channel.channel_points_custom_reward.remove` (or "I've deleted it", or
  `listRewards` noticing it's gone) runs `finishTakeover`: the copy gets the original's title and
  enabled / paused state, and `TWITCH_REWARD_ID` / the `TWITCH_RANDOM_REWARDS` entry switch to it.
  reward-takeovers.json keeps finished ones so ending-credits.js still counts the old ID as song
  requests. `cancelTakeover` deletes the copy

### Queue state (queue.js)
- `nowPlaying`, `queue[]`, `playedSongs[]`, `pending[]` (weak/unmatched requests for review)
- Random entries carry `isRandom` and their reward's `tabs`, so a redraw stays in those tabs
- Every change is written to `queue-state.json`; restored at startup only if saved within
  6 hours (a crash mid-stream recovers; yesterday's leftovers don't reappear)
- History is recorded when a song is **finished** (skip / moved to played), not when queued
- `QUEUE_STATE_FILE` overrides the state file (tests)

### Random picker (random.js)
- `RANDOM_PICK_MODE`: `weighted` (favours songs not requested recently) or `pure`
- Excludes songs in nowPlaying/queue/played and songs requested within `RANDOM_COOLDOWN_DAYS`
- Cooldown uses live history; weighting uses the startup snapshot

### Google Sheets
- Song list: read-only, all tabs loaded except `EXCLUDED_TABS` (.env). Range strings
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
- Online lyrics for songs **we** imported (Prepare, auto-prepare, "Check with Leihu", Queue +
  prepare) or whose video is a sheet `YTLink`, once per song per server run (`fillMissingLyrics`):
  - when Leihu left the lyrics blank (`nolyrics`), or
  - when Leihu kept its own recognition but flags online lyrics (`lyricsSource` `whisper` +
    `lyricsPending`, Leihu's "有線上歌詞可選") — then the candidate's `similarity` to the
    recognition must also be ≥ 0.5
  - The candidate (`lyricFits`): timed lyrics, ≤ 3 s from the audio, the sheet's title (brackets
    ignored; Leihu's `title_match` also counts, as it converts 来 → 來), the sheet's artist (one
    character may differ: 松任谷由實 / 松任谷由実). First from the candidates Leihu saved
    (`/lyrics/candidates`), else Leihu's search by sheet title + artist (`/lyrics/search?q=`),
    applied with `POST /lyrics/apply`. Lyrics picked in Leihu are never replaced
- Imports set Leihu's per-song recognition language from the sheet tab
  (`LEIHU_TAB_LANGUAGES` in config.js; 台語 stays automatic). Needs Leihu 1.4.7+
- Sing button (Now Playing): asks Leihu's practice window to open the song at the sheet key.
  Needs Leihu 1.5.2+ (`/api/remote/open`, upstreamed from our former `remote-open` branch);
  shown only when Leihu's `/api/status` has a `remote` field
- `LEIHU_AUTO_PREPARE=1` (dashboard toggle): imports missing queued songs via Leihu's
  `POST /api/youtube`, then renders the sheet key via `POST /api/songs/<id>/variant`. Each
  request is sent once per server run. Keys outside whole semitones ±6 are skipped
- Failed Leihu jobs: `/api/status` keeps each job's `error` for ~10 min; leihu.js passes it on as
  `failure: { reason, blocked }` (dashboard badge tooltip, "Check with Leihu" result). `blocked` =
  YouTube's "confirm you're not a bot" refusal of yt-dlp — a temporary block on the PC's
  connection; Leihu cuts the message, so `youtubeBlocked()` matches any part. Fix for users is in
  SETUP ("YouTube blocks downloads": wait, or `--cookies-from-browser firefox` in yt-dlp's own
  config file — no Leihu change)
- Leihu 1.6+ YouTube download states (`dl_state` on unfinished songs, `yt_pause` in `/api/status`):
  `queued` with no job yet counts as preparing; `paused` (Leihu stopped downloads for a YouTube
  limit) is failed with `failure.paused` and the pause reason. Clicking a failed badge
  (`/api/leihu/prepare`, retry) calls `POST /api/songs/<id>/redownload` for an unfinished
  download, so Leihu retries the same song instead of adding a new one
- Dashboard tabs: `TABS` in dashboard/index.html, each a `.tabs` button + `.tab-page` with its own settings
  (`.tab-config-btn` ⚙ at the right end of the tab's top row → `#config-<tab>` panel, `toggleTabConfig`; no
  global settings popover: Song Queue holds the random cooldown + overlay look, Chat the song-notes switch, the
  `!endingtk` preview (`/api/credits`) and channel-point rewards); `#leihu` / `#chat` in the URL selects
  the tab. Planned tab: OBS / Streamlabs control. The Leihu tab shows Leihu's own UI
  with Leihu's settings (auto-prepare, auto-start, the two steps below) in its ⚙ panel (bulk progress
  also shows in the header), the UI in an iframe from `url` in `/api/leihu/status`
  (Leihu sends no frame-blocking headers; only its `/api/remote/open` rejects browser requests). It loads
  on first view and again when Leihu comes back; a dashboard opened from another device shows a note
  instead, since Leihu listens on 127.0.0.1 only
- Leihu without its window (leihu-launcher.js, `POST /api/leihu/launch {action: 'start'|'stop'}`, ▶/■ in the
  Leihu tab, `LEIHU_AUTOSTART`): runs Leihu's `app.py --no-browser --parent-pid <this pid>` with its`pythonw`,
  `LIANTAI_PORT` from `LEIHU_URL`, output appended to Leihu's `logs/app.log` — like Leihu's desktop.py minus
  the window, so Leihu closes with the song queue. Folder: `LEIHU_ROOT`, else `leihu-home.json` (`remember()`,
  called from `refresh()` with Leihu's `root`), else `%LOCALAPPDATA%\LeihuLiantai`. ■ closes only a Leihu the
  song queue started (`launched` in `/api/leihu/status`); Leihu's own shortcut reuses a running server
- Stream window (stream-window.js, `POST /api/stream-window`; start.ps1 / start_zh.ps1 call it with
  `{tab:'queue', lang?}`, falling back to the default browser — 409 until setup is done; 🔊 in the Leihu tab's ⚙): opens
  `/dashboard?window=stream[&lang=][#leihu]` in Chrome (else Edge) with `--user-data-dir=%LOCALAPPDATA%\SongRequestDashboard\stream-window`
  `--app`, a separate browser process, so OBS's Application Audio Capture gets the Leihu iframe's sound without
  the everyday browser. That window's title is fixed (`STREAM_WINDOW_TITLE`, not translated) for OBS's
  "Window title must match". In it, /setup and twitch.tv links go to the usual browser (`POST /api/open-in-browser`,
  only those URLs; it has no Twitch login). The header's 🔊 hint shows until it's opened once (localStorage `streamWindowOpened`)
- Dashboard Chat tab (chat-log.js): every `channel.chat.message`, redemption, chat notification (sub,
  raid…) and follow becomes a record (user,
  badges, text split into text / emote / mention / cheer parts, message_type, bits, reply, `songs` = sheet
  titles named in it — 2+ chars, 4+ for Latin-only titles, longest wins, not for !commands). Records are
  kept in memory (latest 1000, today's log read back on start), appended to chat-logs/<local date>.jsonl
  (`CHAT_LOG_DAYS`, pruned on start) and pushed over the WebSocket as `{type: 'chat'}` only to clients
  that sent `{type: 'chat-subscribe'}` (the dashboard). twitch.js also subscribes to
  `channel.chat.message_delete` / `clear_user_messages` / `clear` (same `user:read:chat` scope, each
  optional): chat-log.js marks those records `deleted`, logs a `{kind: 'delete'}` line applied on load,
  and sends `{type: 'chat-delete'}`. All filters (songs, commands, mods/VIP, subs, @mentions of the
  channel, to announce, first-time (`first` from IRC's first-msg, or `user_intro`), highlighted / bits, redemptions, waiting redemptions, one viewer, search, bots) run in
  the dashboard. ♪ on a song mention adds it via `/api/add` with the viewer as requester
- "To announce" (要宣讀): subs / resubs / gifts (a community gift once: its `sub_gift` lines carry
  `communityGift` and are left out), raids, watch streaks, bits badges, charity, follows, cheers,
  highlighted messages, first-time chatters, and each viewer's first message this session (`greet`,
  worked out in the dashboard; bots and the streamer left out). The session = since the stream last
  went live (stream-session.js; `/api/chat/session` loads it across day files, 12 h before any go-live
  is known). ✓ / ✓ All → `/api/chat/announced` → `{kind: 'announced', ids, done}` lines → `announced`
  on load, `{type: 'chat-announced'}` to every dashboard; ✓ again (with "show announced") undoes
- Message box (chat-send.js): posts as the authorized account (sender = broadcaster), `↪ Reply` on a
  row sets `reply_parent_message_id`. The message comes back through EventSub chat, so nothing is added
  locally. `canSend()` checks the token's scopes via `/oauth2/validate` (true cached 5 min; missing
  re-checked each time, so authorizing again turns the box on). Dropped messages (AutoMod, slow mode…)
  → `chatDropped` with Twitch's reason; the text stays in the box
- Song notes (song-notes.js): each song in a chat record gets `lastAt` (ms, from history.js
  `getLastRequestedAt` — set when a song is moved to Played; null = never; left out until the history
  sheet is loaded, `isReady()`). Within the random cooldown (`RANDOM_COOLDOWN_DAYS`, random.js
  `getCooldownMs`; 0 = none) the song is marked `recent`. Any song with a known `lastAt` (null too),
  at most once per song per 10 min: `onStream` + `{type: 'song-note', title, artist, days, recent}`
  (days null = never sung) to all WebSocket clients. The song overlay floats them at its bottom, over the
  Played list: "title - 99 days ago" (`overlay.days` / `overlay.never`), amber when recent, green
  otherwise; a new one comes up from the bottom and pushes the others up, at most 4 (when full the
  oldest, at the top, makes room), 15 s each. `SONG_NOTES=0` (Chat tab switch, `songNotes` in
  `/api/settings`) stops the notes; songs are still marked `recent`
  The Chat tab's ♪ buttons show the days as of the message, amber when recent, 📺 when shown
- Dashboard Leihu tab → "Get your song list ready in Leihu": step ① links to the link finder
  (links.html), step ② "Prepare songs in Leihu" (`startBulk` in leihu.js); each shows counts from
  `sheet: { songs, linked, todo }` in `/api/leihu/status` (`sheetCounts`). Step ② sends every
  sheet song with a YouTube link that Leihu hasn't finished (not manually linked; failed /
  cancelled / paused downloads are retried in place). From `tick()` it keeps up to
  `LEIHU_BULK_AHEAD` (default 3) of them in Leihu's queue, so Leihu 1.6.1's download-ahead (the
  next two queued YouTube jobs) overlaps downloading with GPU work; a new one goes in at most every
  `LEIHU_BULK_GAP_MS` (default 30 s) and none while Leihu already has that many YouTube imports
  queued/running. Stream imports and retries (`importVideo`, `prepare`) call `toFront()`, which
  moves their job (`POST /api/jobs/<jid>/move`, once per place) ahead of everything queued in Leihu
  — bulk songs, the streamer's own Leihu imports, `fine` / `compact` jobs — but behind earlier stream
  songs (`streamJobs`, all at the front). Leihu 1.6.3+ lists only the first 30 queued jobs in
  `/api/status` (`queued_total` has the count), so the distance is `ahead` from `GET /api/jobs/<jid>`.
  Stops as `paused` when Leihu reports `yt_pause.on`; Leihu's `redownload` lifts that pause, so a
  bulk retry re-reads `/api/status` first. Starting again calls Leihu's `POST /api/youtube/resume`;
  the songs Leihu queues again join the run as already sent.
- Leihu 1.6.1 runs a `fine` clean-up pass (label `fine`) after songs with heavy backing vocals,
  and key renders after processing: a song whose steps are all done counts as ready/nolyrics even
  while such a job runs. Progress is
  `bulk` in `/api/leihu/status`; it lives in memory only, so a restart ends the run
- Leihu's import returns an error for duplicates only after the download step — never send
  the same video twice; the `requested` map in leihu.js prevents it

### YouTube link finder (link-finder.js, link-score.js, tools/find-videos.py)
- Owns the sheet's YouTube link column: header `YTLink` (`YT_LINK_HEADER` in config.js), never
  configured in `.env` or the wizard. Fills it for songs without a link; a tab without the
  column is still searched, and gets the column (right after its last used header, growing
  the grid if needed) the first time links are saved there. Review page: `/dashboard/links.html`
- Search: `tools/find-videos.py` runs with **Leihu's own Python** (root from Leihu's
  `/api/status`, so Leihu must be running): `<root>/python/python.exe` in the packaged app, else
  `<root>/.venv` or `<root>/venv` `Scripts/python.exe` for a source install; `LEIHU_PYTHON` in
  `.env` replaces the search (a wrong path is an error, not a fallback). It calls Leihu's own
  `search_lrclib/netease/kugou`, `_norm`, `to_simplified` and yt-dlp (`ytsearch10`, metadata
  only). Zero changes to Leihu; the helper refuses to run if those functions are missing.
  JSON lines in/out. ~7.5 s per song (LRCLIB often errors from here; NetEase/Kugou carry 中文).
  A YouTube search that comes back empty is retried as artist + title, then simplified Chinese,
  then the title alone (YouTube sometimes finds nothing for the exact "title artist")
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
  Songs skipped for a filled cell (`noteCellFilled`) are tried again on every save, so clearing
  the cell in the sheet is enough; the Save button counts them.
  Songs are read from A:Z, so a tab already using all 26 columns can't get the column added
- "Check with Leihu": imports the video into Leihu (language from the tab), waits for
  processing, then reads `lyrics/candidates` similarity. Inconclusive when Leihu's recognition
  is unreliable (usual for 台語). Adds the song to Leihu's library

### Songs not on the sheet (Pending Review → 🔍 Find)
- Button only (no automatic search). `linkFinder.identify(text)` runs find-videos.py for the
  viewer's text (or the card's edited title + artist), apart from the search job (`searchOne`).
  `pickSong` groups lyric results whose title the text contains (or that contain the text) by
  title + artist and scores text coverage, agreeing results and videos; display names prefer the
  viewer's spelling, then LRCLIB, Kugou, NetEase. When the artist wasn't typed, a second search by
  title + artist adds the official uploads a title-only search misses. Videos scored by link-score.js
- Result stored on the pending entry as `found` (`searching` / `done` / `failed`; a restart turns
  `searching` into failed), broadcast with the queue state; `updatePending` ignores entries no
  longer pending. Routes check `addedAt` so a changed list never acts on another request
- "Queue + prepare": queues the request, then `leihu.importForSong` imports the video (unless Leihu
  has it) and saves a manual link (song-links.json) under title + artist. Language: kana → 日語
  (`guessTab`); Chinese characters stay automatic (can't tell 國語 from 台語). Nothing is imported
  before the streamer accepts
- "Add to <tab>": `linkFinder.addToSheet` appends title, artist and YTLink to the first
  `EXCLUDED_TABS` tab (creating YTLink there if missing); skips a song already in that tab; needs
  Editor access. The request stays pending, marked `addedTo`

### Languages: English + 繁體中文 (shared/i18n.js)
- Every web page is in English and Traditional Chinese (Taiwan). Strings live in tables:
  `shared/i18n-*.js`, `dashboard/i18n-*.js`, and the wizard's own `setup/i18n.js`. Each table file
  registers itself in the browser and `module.exports` itself in Node, for the tests
- Look-ups: `I18N.t(key, params)` (`{name}` placeholders, or a function for plurals),
  `I18N.tHtml` (escapes params for innerHTML), `data-i18n` / `data-i18n-html` / `-title` /
  `-placeholder` / `-aria-label` attributes for fixed markup, `I18N.onChange` to redraw
- Streamer pages (dashboard, links, wizard): EN / 中文 switch; one saved choice
  (localStorage `ui_lang`, the wizard's old `setup_lang` is read once); first visit follows the
  browser language (zh* → zh-TW, else en); `?lang=` overrides
- Viewer pages (overlay, clip player in OBS): no switch — the dashboard's ⚙ "Overlay language"
  setting (`OVERLAY_LANGUAGE` in `.env`, default `en`), pushed live over the WebSocket. Clip labels
  are sent as `labelKey` (`shoutout` / `watching`) next to the English `label`. The `!tk`
  sponsor roll stays Japanese by design
- Server messages: user-facing errors and notes carry a `code` (+ `params`) from
  `server/messages.js` (`UserError`, `message()`, `errorBody()`); pages show
  `I18N.server(body)` — the translation from `shared/i18n-server.js`, else the English text.
  Stored notes keep `noteCode` / `errorCode` next to the text. Console logs stay English
- `test/i18n.test.js` fails when a key or placeholder is missing in one language, a page
  uses an unknown key, or the server sends a code without a translation
- zh-TW terms (match the wizard and SETUP_zh_TW.md): 正在演唱 / 待唱歌單 / 已唱歌單 / 待審核,
  唱完了, 雷虎練唱台 for Leihu Singsing, KEY for the key

---

## Chat commands (mods and broadcaster only)

| Command | Description |
|---|---|
| `!so <user>` | Plays a random clip of that channel, remembers them for `!tk` |
| `!watch <url>` | Plays a Twitch clip, YouTube video or direct video file |
| `!replay` | Replays the last media |
| `!stop` | Stops playback and clears the media queue |
| `!tk` | Japanese-TV-style sponsor roll of everyone `!so`'d since the last `!tk` |
| `!endingtk` | The same roll in groups (raiders, subs incl. gift recipients, cheers, followers, redeemers, song requesters, top 8 chatters) since the last `!endingtk` |

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
| POST | `/api/pending/identify` | Search lyric sites + YouTube for a pending request `{index, addedAt, text?}`; result lands in its `found` |
| POST | `/api/pending/queue-found` | Queue it and prepare the video in Leihu `{index, addedAt, title, artist, videoId}` |
| POST | `/api/pending/add-to-sheet` | Add it with its link to the first excluded tab `{index, addedAt, title, artist, videoId?}` |
| POST | `/api/redraw` | Re-pick a random song in place `{zone, index}` (keeps its tab filter) |
| POST | `/api/refresh-songs` | Force re-fetch song list from Google Sheets |
| GET | `/api/songs` | Full song list (for dashboard autocomplete) |
| GET | `/api/history` | Request history snapshot (startup state) |
| GET | `/api/node-status` | `{version, minimum, outdated}` — is Node.js missing security fixes |
| GET/POST | `/api/settings` | Random cooldown days, overlay panel opacity, text brightness, overlay language, Leihu auto-prepare |
| GET | `/api/hls`, `/api/clip-stream` | Proxies for Twitch clip playback (Twitch hosts only) |
| GET | `/api/leihu/status` | Leihu state of nowPlaying + queue, keyed by title + artist |
| GET | `/api/leihu/library` | Leihu's songs, for the dashboard link picker |
| POST | `/api/leihu/link` | Manual link `{title, artist, id}` — `id: null` unlinks |
| POST | `/api/leihu/prepare` | Import / render key for one song now `{title, artist, key}` |
| GET | `/api/chat/recent` | Chat tab: the latest 1000 chat records `{records, channel}` |
| GET | `/api/chat/days` | Days with a chat log, newest first |
| GET | `/api/chat/log?day=YYYY-MM-DD` | One day's chat records, with deletions, redemption statuses, first messages and ✓ marks applied |
| GET | `/api/credits` | `{follows, lastAt, groups}` — who `!endingtk` would thank now; follows: `on` / `no-permission` / `failed` |
| GET | `/api/chat/session` | `{startedAt, live, since, records}` — this stream session's records, for "to announce" |
| POST | `/api/chat/announced` | `{items: [{id, at}], done}` — ✓ marks |
| GET | `/api/chat/send` | `{canSend, max}` — whether the token may post (`user:write:chat`) |
| POST | `/api/chat/send` | `{text, replyTo?}` → `{id}`; posts to chat as the streamer |
| GET | `/api/redemptions/manageable` | `{ids, channel}` — rewards whose redemptions the Chat tab can change |
| POST | `/api/redemptions/status` | `{id, rewardId, action: 'done' \| 'refund'}` |
| GET | `/api/rewards` | Chat ⚙: every reward with `role`, `manageable`, `skipsQueue`, `takeover` |
| POST | `/api/rewards/takeover` | `{id, action: 'start' \| 'finish' \| 'cancel'}` |
| POST | `/api/stream-window` | Open the dashboard in its own browser window `{tab?: 'queue', lang?}` (409 until setup is done) |
| POST | `/api/open-in-browser` | From the stream window: open a /setup or twitch.tv link in the usual browser `{url}` |
| POST | `/api/leihu/launch` | Start Leihu without its window, or close one the song queue started `{action: 'start' \| 'stop'}` |
| POST | `/api/leihu/bulk` | Prepare all sheet songs in Leihu `{action: 'start' \| 'stop'}` → bulk status |
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
- `EXCLUDED_TABS` — tabs left out of requests, random picks and the link finder, comma-separated.
  Unset = `待練勿點`; empty = none. Read through `config.EXCLUDED_TABS` (a getter, so it follows .env)
- `PORT` — default 3000
- `RANDOM_PICK_MODE` — `weighted` or `pure`
- `RANDOM_COOLDOWN_DAYS`, `OVERLAY_PANEL_BG_ALPHA`, `OVERLAY_TEXT_BRIGHTNESS`, `OVERLAY_LANGUAGE` (`en` / `zh-TW`) — also adjustable from the dashboard
- `LEIHU_URL` — Leihu Singsing address (default `http://127.0.0.1:8765`)
- `LEIHU_PYTHON` — optional: the Python the link finder runs; unset = found in Leihu's folder
- `LEIHU_AUTO_PREPARE` — `1` = prepare queued songs in Leihu ahead of time (dashboard toggle)
- `LEIHU_AUTOSTART` — `1` = start Leihu without its window when the song queue starts (dashboard toggle)
- `CHAT_LOG_DAYS` — days of chat log kept in chat-logs/ (default 30)
- `SONG_NOTES` — `0` = no song notes on the song overlay (Chat tab switch; on when unset)
- `LEIHU_ROOT` — optional: Leihu's folder for starting it; unset = remembered from Leihu's `/api/status` `root`

---

## Tuneable settings (server/config.js)

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

## Security updates

- **npm packages — updated for the user.** `start.ps1` runs `npm install` on every start, but npm
  keeps an installed version that still fits the range. So after a security fix, raise the minimum
  in `package.json` (`dependencies`, or `overrides` for packages inside Express / axios / googleapis)
  — the next start installs it. Same-major versions only, and run `npm test` first. Check with
  `npm audit`. Left as is: `uuid` inside googleapis (fix needs googleapis 140 → 187+, untested;
  the advisory needs a caller-supplied buffer, which googleapis doesn't pass)
- **Node.js — the user is told, never installed for them** (needs an installer / admin prompt,
  and a failed install would block the stream). `secureNode` in `package.json` lists the minimum
  per release line; `server/node-check.js` compares. Shown by the start scripts (yellow warning,
  starts anyway), the server log and a dashboard banner (`/api/node-status`; closing it lasts until
  the page is opened again). Unlisted older or odd lines count as outdated. When Node.js ships a
  security release, update `secureNode`

---

## Testing

- `npm test` runs `test/*.test.js` with Node's built-in runner — no extra dependencies
- Tests stub `sheets.js` / `history.js` through `test/helpers.js` so they never touch Google,
  Twitch or the real `.env`
- Don't add tests that load `queue.js` or `sheets.js` unstubbed from the repo root: they write
  `queue-state.json` / `song-cache.json` there. Tests point `LEIHU_LINKS_FILE` at a temp file so
  `song-links.json` is never touched; likewise `QUEUE_STATE_FILE`, `CHAT_LOG_DIR`, `ENDING_CREDITS_FILE`,
  `REWARD_TAKEOVERS_FILE`, `STREAM_SESSION_FILE`

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
  tokens are missing it jumps straight to re-authorization. `/setup?reauth=1` does the same for a
  finished setup (a scope added later)
- Client ID is validated by requesting a device code (Twitch answers "invalid client")
- Re-running the rewards step keeps per-tab random rewards
- The PowerShell scripts are an alternative path and must write the same `.env` keys and ask for
  the same Twitch scopes

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
