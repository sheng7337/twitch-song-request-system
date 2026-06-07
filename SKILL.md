# SKILL.md — Lessons Learned Building This Project

A practical guide distilled from building this VTuber song queue system from scratch.
Useful reference for similar projects involving Twitch, Google Sheets, WebSocket, and Windows deployment.

---

## Twitch API

### URLs use underscores, not hyphens
```
CORRECT:  /helix/channel_points/custom_rewards
WRONG:    /helix/channel-points/custom-rewards
```

### Two types of tokens — use the right one
- **App token** (`client_credentials`) — for EventSub registration, reading public data
- **User token** (`authorization_code` / implicit) — for Channel Points CRUD (create/read rewards)
- Getting user token via implicit flow: open auth URL in browser → copy from redirect URL fragment

### EventSub webhook verification
- Twitch sends `twitch-eventsub-message-signature: sha256=<hmac>`
- HMAC = `HMAC-SHA256(secret, messageId + timestamp + rawBody)`
- Must capture raw body bytes before JSON parsing — can't re-serialize
- Always delete and re-register subscriptions on startup to keep secret in sync
- Register without `reward_id` filter to catch ALL Channel Points redemptions, then route by `rewardId` in handler

### Channel Points API requires Affiliate/Partner
- Returns 404 if channel not affiliated yet
- Creating rewards requires user token with `channel:manage:redemptions` scope

---

## Google Sheets API

### Service Account setup
- Create project → enable Sheets API → create Service Account → download JSON key
- Share sheet with service account email (`xxx@project.iam.gserviceaccount.com`)
- Song list: Viewer access | History sheet: Editor access
- Use `batchGet` to fetch multiple tabs in one API call

### Reading data
- Headers in row 1, find column index by `headers.indexOf(colName.toLowerCase())`
- All cell values come as strings — `"0"` not `0`, even for number-typed columns
- Use `String(row[keyIdx] ?? '').trim()` not `(row[keyIdx] || '').trim()` — the `||` drops `"0"`

### Writing history
- Use `spreadsheets.values.append` for new rows, `spreadsheets.values.batchUpdate` for updates
- Debounce writes to avoid API quota issues (1.5s works well)
- Cache row index in memory to avoid re-reading the whole sheet on every update

---

## WebSocket (overlay ↔ server)

### Pattern used
- Server sends full state on every change (not diffs)
- Overlay re-renders completely from state
- Reconnects automatically with exponential backoff
- Multiple clients supported (overlay + dashboard both connect)

### Message types
```js
{ type: 'state', nowPlaying, queue, playedSongs, pending }  // full state broadcast
```

---

## Windows / PowerShell deployment

### Encoding — the most common source of bugs
- **Never use `Set-Content` / `Get-Content` for UTF-8 files** — defaults to system encoding (often not UTF-8)
- **`-Encoding UTF8` in PS 5.x writes UTF-8 WITH BOM** — `dotenv` and Node.js can't read BOM files correctly
- **Correct approach**: use .NET directly:
  ```powershell
  [System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::ReadAllText($path, [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::ReadAllLines($path, [System.Text.UTF8Encoding]::new($false))
  ```
- **Chinese PS1 scripts MUST be saved with UTF-8 BOM** — PowerShell 5.x on Windows will not parse Chinese characters correctly without it
  - In Python: `open(path, 'w', encoding='utf-8-sig')`
  - In VS Code: bottom-right corner → click encoding → "Save with encoding" → UTF-8 with BOM
  - Verify: `with open(path, 'rb') as f: f.read(3) == b'\xef\xbb\xbf'`
- English PS1 scripts do NOT need BOM — save as plain UTF-8
- Keep `.env` and `.env.example` pure ASCII — no unicode decorations
- `.env` must be written WITHOUT BOM — use `UTF8Encoding($false)` in PowerShell, `utf-8` (not `utf-8-sig`) in Python

### `&` in PowerShell strings
- **`&` inside double-quoted strings causes parse errors** — must escape with backtick: `` `& ``
- URL query strings (`?a=1&b=2`) are the most common source — build URLs by concatenation or use single quotes for static parts:
  ```powershell
  $url = 'https://example.com?a=1' + $var + '&b=2&c=3'   # single quotes for static & parts
  ```
- Use hashtable body for form-encoded POST (avoids & entirely):
  ```powershell
  Invoke-RestMethod -Method Post -Uri $url -Body @{ key1=$val1; key2=$val2 }
  ```

### Other PS gotchas
- Trailing backslash in double-quoted string escapes the closing quote: `"C:\path\"` → broken
- Chinese corner quotes `「」` inside PS double-quoted strings with `$variables` break parsing
- `&` as call operator at line start is fine — only inside strings is the issue
- Use `$LASTEXITCODE -ne 0` instead of `try/catch` for external commands like `node`
- **Inline `if` as expression** — PowerShell does NOT support `(if (...) { } else { })` inline. Assign to variable first:
  ```powershell
  # WRONG — causes "if is not recognized" error
  Set-EnvValue "KEY" (if ($val) { $val } else { "default" })
  # CORRECT
  $result = if ($val) { $val } else { "default" }
  Set-EnvValue "KEY" $result
  ```

### ngrok for local webhooks
- Start ngrok → read URL from `http://localhost:4040/api/tunnels` (local API)
- Free plan: URL changes every restart → update `PUBLIC_URL` in `.env` each session
- Static domains available free (one per account) at dashboard.ngrok.com/domains

---

## JavaScript / Node.js

### The `0` falsy trap
- `key || ''` drops `"0"` because `"0"` is truthy but `0` (number) is falsy
- String `"0"` from API/sheet is truthy — safe with `||`
- But numeric `0` from internal logic is falsy — use `key != null ? String(key) : ''`
- For display conditions: `key != null && key !== ''` not just `if (key)`

### Race conditions in dashboard
- WebSocket state arrives before `fetch('/api/history')` completes
- Fix: call `render()` inside the fetch callback, not just on WebSocket message
- History endpoint returns a startup snapshot (frozen object) — re-fetching during session would show today's data instead of "last time"

### dotenv encoding
- `require('dotenv').config()` reads `.env` as UTF-8 by default — works fine
- Problem is always the **write side** (PowerShell corrupting the file)
- Adding `{ encoding: 'utf8' }` to config() call is harmless but not the real fix

---

## OBS / Streamlabs overlay

### Making background transparent
- Add Browser Source with Custom CSS:
  ```css
  body { background-color: rgba(0, 0, 0, 0) !important; margin: 0px auto; overflow: hidden; }
  ```
- "Allow transparency" checkbox (OBS) or Custom CSS (Streamlabs) — both needed
- `!important` overrides Streamlabs defaults

### Rendering quality
- Set Width/Height to 2× display size (e.g. 960×800 rendered, scaled to 480×400 in scene)
- Use `-webkit-font-smoothing: antialiased` and `text-rendering: optimizeLegibility`

### Auto-scrolling long titles
- Use a wrapper element with `overflow: hidden` and animate an inner `translateX`
- CSS animation keyframes: pause → scroll → pause → snap back
- Scale duration with content width: `const duration = Math.min(40, Math.max(8, overflow/20 + 5))`
- Use `99.9%` keyframe for "instant" snap back (not `100%` which blends with next loop start)

---

## Project structure patterns

### Separating concerns
- `config.js` — all magic numbers and tuneable settings in one file
- `sheets.js` — data fetching only, no business logic
- `matcher.js` — pure function, no side effects
- `queue.js` — state management + WebSocket broadcast
- `history.js` — async I/O with debouncing, startup snapshot pattern

### Startup snapshot pattern
```js
// Freeze a copy of data at startup — never update during session
let startupSnapshot = JSON.parse(JSON.stringify(rowData));
module.exports = { getHistory: () => startupSnapshot };
```
Useful when you want dashboard to show "last time" info without real-time updates changing it.

### Debounced batch writes
```js
let writeQueue = [];
let writeTimer = null;

function scheduleWrite(key, data) {
  writeQueue = writeQueue.filter(w => w.key !== key);
  writeQueue.push({ key, data });
  clearTimeout(writeTimer);
  writeTimer = setTimeout(flushWrites, 1500);
}
```

---

## Setup script UX patterns

### Interactive PS1 wizard
- Use `Read-Host` with custom prompt function
- Check existing `.env` values first — only ask if missing/default
- Verify writes by reading back and comparing
- Use `.NET WriteAllText` with explicit UTF-8 no-BOM
- Generate secrets using explicit char array not `[char]` casting:
  ```powershell
  $chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  $secret = -join (1..32 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
  ```
- Call Twitch API with hashtable body (avoids `&` encoding issues):
  ```powershell
  Invoke-RestMethod -Method Post -Uri $url -Body @{ client_id=$id; client_secret=$secret; grant_type="client_credentials" }
  ```

### Auto-reading ngrok URL
```powershell
Start-Process -FilePath $ngrokPath -ArgumentList "http 3000" -WindowStyle Minimized
# Wait for ngrok local API
$tunnels = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels"
$url = ($tunnels.tunnels | Where-Object { $_.proto -eq "https" })[0].public_url
```

---

## Fuzzy matching (fuse.js)

- `threshold: 0.4` — good balance for song titles (0=exact, 1=anything)
- Weight title more than artist (0.8/0.2)
- Confidence = `Math.round((1 - score) * 100)` — score is 0 (perfect) to 1 (no match)
- Two-tier: auto-accept ≥80%, send to pending <80%
- Viewers can type romaji for Japanese titles and it often still matches

---

## Weighted random selection

```js
const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
let rand = Math.random() * totalWeight;
for (const { item, weight } of weighted) {
  rand -= weight;
  if (rand <= 0) return item;
}
```
Assign higher weights to items you want picked more often.
For "favor least recently played": `weight = min(180, daysAgo)`, never-played gets weight 365.

---

## Twitch EventSub WebSocket transport (no ngrok needed)

### Why use WebSocket transport over Webhook
- Webhook requires a public HTTPS URL — needs ngrok or a hosted server
- WebSocket opens an **outbound** connection from your app to Twitch — no public port needed
- Simpler for local streaming setups — just run the app, no tunneling required

### Connection and subscription flow
```js
const WebSocket = require('ws');

let ws, sessionId;

function connectEventSub() {
  ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

  ws.on('message', async (data) => {
    const msg = JSON.parse(data);
    const type = msg.metadata.message_type;

    if (type === 'session_welcome') {
      sessionId = msg.payload.session.id;
      await subscribeToRedemptions(sessionId);
    }
    if (type === 'notification') {
      handleEvent(msg.payload.event);
    }
    if (type === 'session_reconnect') {
      ws.close();
      ws = new WebSocket(msg.payload.session.reconnect_url);
      // re-attach handlers, re-subscribe with new session ID
    }
    // 'session_keepalive' — no action needed
  });

  ws.on('close', () => setTimeout(connectEventSub, 3000));
}

async function subscribeToRedemptions(sessionId) {
  await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
    type: 'channel.channel_points_custom_reward_redemption.add',
    version: '1',
    condition: { broadcaster_user_id: broadcasterId },
    transport: { method: 'websocket', session_id: sessionId },
  }, {
    headers: {
      'Client-Id': clientId,
      'Authorization': `Bearer ${userAccessToken}`,  // user token required
    }
  });
}
```

### Key differences from Webhook
- No signature verification — auth is handled by the token
- Subscriptions are tied to the WebSocket session — must re-subscribe after reconnect
- Use **user access token** (not app token) with `channel:read:redemptions` scope
- No `TWITCH_WEBHOOK_SECRET` or `PUBLIC_URL` needed

---

## Twitch Device Authorization Flow

### Why use it over standard OAuth
- Standard OAuth requires redirecting to `http://localhost` — awkward in CLI/setup scripts
- Device flow: app shows a short code, user types it at `twitch.tv/activate`
- Clean UX for setup wizards — no browser redirect needed

### Full flow
```js
// Step 1: request device code
const res = await axios.post('https://id.twitch.tv/oauth2/device', null, {
  params: {
    client_id: clientId,
    scopes: 'channel:read:redemptions channel:manage:redemptions',
  }
});
const { device_code, user_code, interval, expires_in } = res.data;

console.log(`Visit https://www.twitch.tv/activate and enter: ${user_code}`);

// Step 2: poll until approved
let tokens = null;
while (!tokens) {
  await sleep(interval * 1000);
  try {
    const poll = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: clientId,
        device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }
    });
    tokens = poll.data; // { access_token, refresh_token, expires_in }
  } catch (err) {
    if (err.response?.data?.message === 'authorization_pending') continue;
    throw err; // 'expired_token' or 'access_denied'
  }
}

// Step 3: store in .env
setEnvValue('TWITCH_USER_ACCESS_TOKEN', tokens.access_token);
setEnvValue('TWITCH_USER_REFRESH_TOKEN', tokens.refresh_token);
setEnvValue('TWITCH_USER_TOKEN_EXPIRES_AT', String(Date.now() + tokens.expires_in * 1000));
```

### Token refresh
```js
async function ensureFreshToken() {
  const expiresAt = parseInt(process.env.TWITCH_USER_TOKEN_EXPIRES_AT || '0');
  if (Date.now() < expiresAt - 60000) return; // still valid with 1min buffer

  const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
    params: {
      grant_type: 'refresh_token',
      refresh_token: process.env.TWITCH_USER_REFRESH_TOKEN,
      client_id: process.env.TWITCH_CLIENT_ID,
    }
  });
  process.env.TWITCH_USER_ACCESS_TOKEN = res.data.access_token;
  process.env.TWITCH_USER_TOKEN_EXPIRES_AT = String(Date.now() + res.data.expires_in * 1000);
  // Persist so it survives restarts
  setEnvValue('TWITCH_USER_ACCESS_TOKEN', res.data.access_token);
  setEnvValue('TWITCH_USER_TOKEN_EXPIRES_AT', String(Date.now() + res.data.expires_in * 1000));
}
```

### Notes
- Device codes expire in ~30 min — if user doesn't activate, restart the flow
- `client_secret` not required for public clients (Device flow supports both)
- Call `ensureFreshToken()` before any API call that uses the user token
- Store `expires_at` as a Unix timestamp in milliseconds
