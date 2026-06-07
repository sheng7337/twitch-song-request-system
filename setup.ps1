# ============================================================
#  VTuber Song Queue - First-time Setup Wizard
#  Run once: right-click -> Run with PowerShell
# ============================================================

$ErrorActionPreference = "Stop"
$HOST.UI.RawUI.WindowTitle = "VTuber Song Queue Setup"

function Write-Header($text) {
    Write-Host ""
    Write-Host "  ======================================" -ForegroundColor DarkMagenta
    Write-Host "  $text" -ForegroundColor Magenta
    Write-Host "  ======================================" -ForegroundColor DarkMagenta
    Write-Host ""
}
function Write-Step($text)  { Write-Host "  >> $text" -ForegroundColor Cyan }
function Write-OK($text)    { Write-Host "  [OK] $text" -ForegroundColor Green }
function Write-Warn($text)  { Write-Host "  [!] $text" -ForegroundColor Yellow }
function Write-Err($text)   { Write-Host "  [X] $text" -ForegroundColor Red }
function Ask($prompt)       { Write-Host "  --> $prompt" -ForegroundColor White -NoNewline; return (Read-Host " ") }
function Pause-Key          { Write-Host "  Press any key to continue..." -ForegroundColor DarkGray; $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") }

function Get-EnvValue($key) {
    $lines = [System.IO.File]::ReadAllLines($envPath, [System.Text.UTF8Encoding]::new($false))
    $line = $lines | Where-Object { $_ -match "^$key=" }
    if ($line) { return ($line -split "=", 2)[1].Trim() }
    return ""
}
function Set-EnvValue($key, $value) {
    $content = [System.IO.File]::ReadAllText($envPath, [System.Text.UTF8Encoding]::new($false))
    if ($content -match "(?m)^$key=.*$") {
        $content = $content -replace "(?m)^$key=.*$", "$key=$value"
    } else {
        $content += "`n$key=$value"
    }
    [System.IO.File]::WriteAllText($envPath, $content, [System.Text.UTF8Encoding]::new($false))
    [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
}

Clear-Host
Write-Host ""
Write-Host "  VTuber Song Queue - Setup Wizard" -ForegroundColor Magenta
Write-Host "  --------------------------------------" -ForegroundColor DarkMagenta
Write-Host ""

# ── Step 1: Check Node.js ──────────────────────────────────────────────────────
Write-Header "Step 1 - Check Prerequisites"
Write-Step "Checking Node.js..."
$nodeVer = node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "Node.js not found. Please install from https://nodejs.org (LTS version)"
    Pause-Key; exit 1
}
Write-OK "Node.js: $nodeVer"
Write-Step "Installing npm packages..."
npm install --silent
Write-OK "npm packages installed"

# ── Step 2: .env ───────────────────────────────────────────────────────────────
Write-Header "Step 2 - Configuration File"
$envPath = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envPath)) {
    Copy-Item (Join-Path $PSScriptRoot ".env.example") $envPath
    Write-OK "Created .env from template"
} else {
    Write-Warn ".env already exists — will update missing values only"
}

# ── Step 3: Twitch Client ID ───────────────────────────────────────────────────
Write-Header "Step 3 - Twitch App Client ID"
Write-Host "  Go to: https://dev.twitch.tv/console/apps" -ForegroundColor DarkCyan
Write-Host "  Click [Register Your Application] and fill in:" -ForegroundColor DarkGray
Write-Host "    Name: anything (e.g. Song Queue Bot)" -ForegroundColor DarkGray
Write-Host "    OAuth Redirect URL: http://localhost" -ForegroundColor DarkGray
Write-Host "    Category: Other" -ForegroundColor DarkGray
Write-Host "  After creating, click [Manage] -- Client ID is shown at the top." -ForegroundColor DarkGray
Write-Host "  Note: you do NOT need a Client Secret." -ForegroundColor DarkGray
Write-Host ""

$clientId = Get-EnvValue "TWITCH_CLIENT_ID"
if (-not $clientId -or $clientId -eq "your_client_id_here") {
    $clientId = Ask "Paste your Client ID"
    Set-EnvValue "TWITCH_CLIENT_ID" $clientId
}
Write-OK "Client ID: $clientId"

# ── Step 4: Twitch Authorization (Device Flow) ─────────────────────────────────
Write-Header "Step 4 - Connect Twitch Account"
Write-Host "  We will use Twitch Device Authorization -- no copy-pasting URLs needed." -ForegroundColor DarkGray
Write-Host "  You will visit a page and enter a short code to authorize this app." -ForegroundColor DarkGray
Write-Host ""
Write-Step "Requesting authorization code..."

$deviceRes = Invoke-RestMethod -Method Post -Uri "https://id.twitch.tv/oauth2/device" -Body @{
    client_id = $clientId
    scopes    = "channel:read:redemptions channel:manage:redemptions"
}
$deviceCode   = $deviceRes.device_code
$userCode     = $deviceRes.user_code
$pollInterval = if ($deviceRes.interval) { $deviceRes.interval } else { 5 }

Write-Host ""
Write-Host "  =============================================" -ForegroundColor Magenta
Write-Host "  Visit: https://www.twitch.tv/activate" -ForegroundColor Cyan
Write-Host "  Enter this code: $userCode" -ForegroundColor Yellow
Write-Host "  =============================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Make sure you are logged in as your BROADCASTER account." -ForegroundColor DarkGray
Write-Host "  Waiting for authorization..." -ForegroundColor DarkGray

$userToken = $null
$pollCount = 0
while (-not $userToken) {
    Start-Sleep -Seconds $pollInterval
    $pollCount++
    try {
        $tokenRes = Invoke-RestMethod -Method Post -Uri "https://id.twitch.tv/oauth2/token" -Body @{
            client_id   = $clientId
            device_code = $deviceCode
            grant_type  = "urn:ietf:params:oauth:grant-type:device_code"
        }
        $userToken    = $tokenRes.access_token
        $refreshToken = $tokenRes.refresh_token
        $expiresAt    = [string]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + ($tokenRes.expires_in * 1000))

        $userInfo      = Invoke-RestMethod -Uri "https://api.twitch.tv/helix/users" `
            -Headers @{ "Client-Id" = $clientId; "Authorization" = "Bearer $userToken" }
        $broadcasterId = $userInfo.data[0].id
        $displayName   = $userInfo.data[0].display_name

        Set-EnvValue "TWITCH_USER_ACCESS_TOKEN" $userToken
        Set-EnvValue "TWITCH_USER_REFRESH_TOKEN" $refreshToken
        Set-EnvValue "TWITCH_USER_TOKEN_EXPIRES_AT" $expiresAt
        Set-EnvValue "TWITCH_BROADCASTER_ID" $broadcasterId
        Write-OK "Authorized as: $displayName (ID: $broadcasterId)"
    } catch {
        if ($pollCount -gt 120) {
            Write-Err "Timed out. Please re-run this script."
            Pause-Key; exit 1
        }
        # authorization_pending is normal -- keep polling
    }
}

# ── Step 5: Channel Points Rewards ────────────────────────────────────────────
Write-Header "Step 5 - Channel Points Rewards"
Write-Host "  Creating two reward buttons for your viewers:" -ForegroundColor DarkGray
Write-Host "  - Song Request (viewers type a song title)" -ForegroundColor DarkGray
Write-Host "  - Random Song (picks a song automatically)" -ForegroundColor DarkGray
Write-Host ""

$rewardHeaders = @{
    "Client-Id"     = $clientId
    "Authorization" = "Bearer $userToken"
    "Content-Type"  = "application/json"
}

# Fetch existing rewards
$existingRewards = @()
try {
    $res = Invoke-RestMethod `
        -Uri "https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=$broadcasterId" `
        -Headers $rewardHeaders
    $existingRewards = $res.data
} catch {
    Write-Warn "Could not fetch existing rewards (channel may not be Affiliate yet)"
}

function Pick-Reward($label, $envKey, $requireTextInput) {
    $current = Get-EnvValue $envKey
    if ($current -and $current -ne "") {
        Write-OK "$label already set: $current"
        return $current
    }

    Write-Host ""
    Write-Host "  === $label ===" -ForegroundColor Cyan

    if ($existingRewards.Count -gt 0) {
        Write-Host "  Your current Channel Points rewards:" -ForegroundColor DarkGray
        for ($i = 0; $i -lt $existingRewards.Count; $i++) {
            $r = $existingRewards[$i]
            $textTag = if ($r.is_user_input_required) { "[text input]   " } else { "[no text input]" }
            Write-Host "  $($i+1). $textTag $($r.title) ($($r.cost) pts)" -ForegroundColor White
        }
        Write-Host "  N. Create a new reward" -ForegroundColor DarkGray
        Write-Host ""
        $choice = Ask "Enter a number to select, or N to create new"
    } else {
        Write-Host "  No existing rewards found -- will create a new one." -ForegroundColor DarkGray
        $choice = "N"
    }

    if ($choice -match '^\d+$') {
        $idx = [int]$choice - 1
        if ($idx -ge 0 -and $idx -lt $existingRewards.Count) {
            $selected = $existingRewards[$idx]
            Set-EnvValue $envKey $selected.id
            Write-OK "Selected: $($selected.title)"
            return $selected.id
        } else {
            Write-Warn "Invalid number -- will create a new reward"
        }
    }

    # Create new reward
    $title = Ask "Enter new reward name"
    $cost  = Ask "Enter point cost (e.g. 500)"
    if (-not $cost -match '^\d+$') { $cost = "500" }

    $body = @{ title = $title; cost = [int]$cost; is_user_input_required = $requireTextInput }
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json))
    try {
        $r = Invoke-RestMethod -Method Post `
            -Uri "https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=$broadcasterId" `
            -Headers $rewardHeaders -Body $bodyBytes
        $newId = $r.data[0].id
        Set-EnvValue $envKey $newId
        Write-OK "Created: $title ($cost pts)"
        return $newId
    } catch {
        Write-Warn "Could not create -- please create manually in Twitch Dashboard"
        Write-Host "  Go to https://dashboard.twitch.tv -> Viewer Rewards -> Channel Points -> +" -ForegroundColor DarkGray
        $manualId = Ask "Paste reward ID (or press Enter to skip)"
        if ($manualId) { Set-EnvValue $envKey $manualId }
        return $manualId
    }
}

$rewardId       = Pick-Reward "Song Request (viewer types a song title)" "TWITCH_REWARD_ID" $true
$randomRewardId = Pick-Reward "Random Song (auto-picks a song)" "TWITCH_RANDOM_REWARD_ID" $false


# ── Step 6: Google Sheets ──────────────────────────────────────────────────────
Write-Header "Step 6 - Google Sheets"

$credPath = Join-Path $PSScriptRoot "google-credentials.json"
if (-not (Test-Path $credPath)) {
    Write-Host "  No google-credentials.json found. Follow these steps:" -ForegroundColor Yellow
    Write-Host "  1. Go to https://console.cloud.google.com" -ForegroundColor DarkGray
    Write-Host "  2. Create a project, enable Google Sheets API" -ForegroundColor DarkGray
    Write-Host "  3. IAM -> Service Accounts -> Create -> Keys -> JSON" -ForegroundColor DarkGray
    Write-Host "  4. Rename the downloaded file to google-credentials.json" -ForegroundColor DarkGray
    Write-Host "  5. Place it in: $PSScriptRoot" -ForegroundColor DarkGray
    Write-Host ""
    while (-not (Test-Path $credPath)) {
        Write-Host "  Waiting for google-credentials.json in: $PSScriptRoot" -ForegroundColor DarkGray
        Write-Host "  Press any key to re-check, or S to skip..." -ForegroundColor DarkGray
        $key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        if ($key.Character -eq 's' -or $key.Character -eq 'S') {
            Write-Warn "Skipped -- add google-credentials.json manually later"
            break
        }
    }
    if (Test-Path $credPath) {
        Write-OK "google-credentials.json found!"
    }
} else {
    $credsJson = Get-Content $credPath -Raw | ConvertFrom-Json
    Write-OK "google-credentials.json found"
    Write-Host "  Service account email: $($credsJson.client_email)" -ForegroundColor DarkGray
    Write-Host "  Share your Google Sheets with this email (Viewer for song list, Editor for history)." -ForegroundColor DarkGray
}

$sheetId = Get-EnvValue "GOOGLE_SHEET_ID"
if (-not $sheetId -or $sheetId -eq "") {
    Write-Host "  Sheet URL format: https://docs.google.com/spreadsheets/d/[ID HERE]/edit" -ForegroundColor DarkCyan
    $sheetId = Ask "Paste your song list Sheet ID"
    Set-EnvValue "GOOGLE_SHEET_ID" $sheetId
}
Write-OK "Song list sheet ID saved"

$songCol = Get-EnvValue "SHEET_SONG_COLUMN"
if (-not $songCol -or $songCol -eq "title") {
    Write-Host "  Enter the column header for song titles in your sheet (row 1)." -ForegroundColor DarkGray
    Write-Host "  e.g. title, song, song name (default: title)" -ForegroundColor DarkGray
    $input = Ask "Song title column name (press Enter for default: title)"
    $colVal = if ($input) { $input } else { "title" }
    Set-EnvValue "SHEET_SONG_COLUMN" $colVal
}
Write-OK "Song column: $(Get-EnvValue 'SHEET_SONG_COLUMN')"

$artistCol = Get-EnvValue "SHEET_ARTIST_COLUMN"
if (-not $artistCol -or $artistCol -eq "artist") {
    Write-Host "  Enter the column header for artist names (default: artist)" -ForegroundColor DarkGray
    $input = Ask "Artist column name (press Enter for default: artist)"
    $colVal = if ($input) { $input } else { "artist" }
    Set-EnvValue "SHEET_ARTIST_COLUMN" $colVal
}
Write-OK "Artist column: $(Get-EnvValue 'SHEET_ARTIST_COLUMN')"
Write-Host "  Note: the key (transposition) column must be named exactly 'key' in your sheet." -ForegroundColor DarkGray

$historyId = Get-EnvValue "HISTORY_SHEET_ID"
if (-not $historyId -or $historyId -eq "") {
    Write-Host "  Optional: create a blank sheet for request history tracking." -ForegroundColor DarkGray
    Write-Host "  Share it with the service account email above (Editor access)." -ForegroundColor DarkGray
    $historyId = Ask "Paste history sheet ID (or press Enter to skip)"
    if ($historyId) { Set-EnvValue "HISTORY_SHEET_ID" $historyId }
}
if ($historyId) { Write-OK "History sheet ID saved" }

# ── Done ───────────────────────────────────────────────────────────────────────
Write-Header "Setup Complete!"
Write-OK ".env configured"
Write-OK "Twitch authorized"
Write-OK "npm packages installed"
Write-Host ""
Write-Host "  Every stream, just run:" -ForegroundColor White
Write-Host "  .\start.ps1" -ForegroundColor Cyan
Write-Host "  No ngrok needed -- the system connects directly to Twitch!" -ForegroundColor DarkGray
Write-Host ""
Pause-Key
