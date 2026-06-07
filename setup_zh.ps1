# ============================================================
#  VTuber 點歌系統 - 首次安裝精靈
#  只需執行一次：對檔案按右鍵 -> 以 PowerShell 執行
# ============================================================

$ErrorActionPreference = "Stop"
$HOST.UI.RawUI.WindowTitle = "VTuber 點歌系統 - 安裝精靈"
chcp 65001 | Out-Null

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
function Pause-Key          { Write-Host "  按任意鍵繼續..." -ForegroundColor DarkGray; $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") }

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
Write-Host "  VTuber 點歌系統 - 安裝精靈" -ForegroundColor Magenta
Write-Host "  --------------------------------------" -ForegroundColor DarkMagenta
Write-Host ""

# ── 步驟 1：檢查 Node.js ────────────────────────────────────────────────────────
Write-Header "步驟 1 - 檢查必要工具"
Write-Step "檢查 Node.js..."
$nodeVer = node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "找不到 Node.js，請至 https://nodejs.org 安裝 LTS 版本"
    Pause-Key; exit 1
}
Write-OK "Node.js 已安裝：$nodeVer"
Write-Step "安裝 npm 套件..."
npm install --silent
Write-OK "npm 套件安裝完成"

# ── 步驟 2：建立 .env ───────────────────────────────────────────────────────────
Write-Header "步驟 2 - 設定檔"
$envPath = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envPath)) {
    Copy-Item (Join-Path $PSScriptRoot ".env.example") $envPath
    Write-OK "已從範本建立 .env"
} else {
    Write-Warn ".env 已存在，僅補填空白欄位"
}

# ── 步驟 3：Twitch Client ID ────────────────────────────────────────────────────
Write-Header "步驟 3 - Twitch 應用程式 Client ID"
Write-Host "  前往：https://dev.twitch.tv/console/apps" -ForegroundColor DarkCyan
Write-Host "  點擊 [Register Your Application]，填寫：" -ForegroundColor DarkGray
Write-Host "    名稱：隨意（例如 Song Queue Bot）" -ForegroundColor DarkGray
Write-Host "    OAuth 轉址 URL：http://localhost" -ForegroundColor DarkGray
Write-Host "    類別：Other" -ForegroundColor DarkGray
Write-Host "  建立完成後點擊 [Manage]，Client ID 顯示在頁面上方。" -ForegroundColor DarkGray
Write-Host "  注意：不需要 Client Secret。" -ForegroundColor DarkGray
Write-Host ""

$clientId = Get-EnvValue "TWITCH_CLIENT_ID"
if (-not $clientId -or $clientId -eq "your_client_id_here") {
    $clientId = Ask "貼上你的 Client ID"
    Set-EnvValue "TWITCH_CLIENT_ID" $clientId
}
Write-OK "Client ID：$clientId"

# ── 步驟 4：Twitch 授權（裝置授權流程）─────────────────────────────────────────
Write-Header "步驟 4 - 連結 Twitch 帳號"
Write-Host "  使用裝置授權流程——不需要複製貼上任何網址。" -ForegroundColor DarkGray
Write-Host "  你只需要前往一個頁面並輸入短代碼即可完成授權。" -ForegroundColor DarkGray
Write-Host ""
Write-Step "請求授權代碼..."

$deviceRes = Invoke-RestMethod -Method Post -Uri "https://id.twitch.tv/oauth2/device" -Body @{
    client_id = $clientId
    scopes    = "channel:read:redemptions channel:manage:redemptions"
}
$deviceCode   = $deviceRes.device_code
$userCode     = $deviceRes.user_code
$pollInterval = if ($deviceRes.interval) { $deviceRes.interval } else { 5 }

Write-Host ""
Write-Host "  =============================================" -ForegroundColor Magenta
Write-Host "  請前往：https://www.twitch.tv/activate" -ForegroundColor Cyan
Write-Host "  輸入此代碼：$userCode" -ForegroundColor Yellow
Write-Host "  =============================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  請確認瀏覽器登入的是你的主播帳號。" -ForegroundColor DarkGray
Write-Host "  等待授權完成..." -ForegroundColor DarkGray

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
        Write-OK "已授權：$displayName（ID：$broadcasterId）"
    } catch {
        if ($pollCount -gt 120) {
            Write-Err "授權逾時，請重新執行腳本。"
            Pause-Key; exit 1
        }
        # authorization_pending -- 繼續等待
    }
}

# ── 步驟 5：頻道點數兌換項目 ────────────────────────────────────────────────────
Write-Header "步驟 5 - 頻道點數兌換項目"
Write-Host "  建立兩個讓觀眾使用點數兌換的按鈕：" -ForegroundColor DarkGray
Write-Host "  - 點歌券（觀眾輸入歌名）" -ForegroundColor DarkGray
Write-Host "  - 隨機點歌券（自動選歌）" -ForegroundColor DarkGray
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
    Write-Warn "無法取得現有兌換項目（頻道可能尚未成為聯盟主播）"
}

function Pick-Reward($label, $envKey, $requireTextInput) {
    $current = Get-EnvValue $envKey
    if ($current -and $current -ne "") {
        Write-OK "$label 已設定：$current"
        return $current
    }

    Write-Host ""
    Write-Host "  === $label ===" -ForegroundColor Cyan

    if ($existingRewards.Count -gt 0) {
        Write-Host "  你目前的頻道點數兌換項目：" -ForegroundColor DarkGray
        for ($i = 0; $i -lt $existingRewards.Count; $i++) {
            $r = $existingRewards[$i]
            $textTag = if ($r.is_user_input_required) { "[需輸入文字]" } else { "[不需輸入]  " }
            Write-Host "  $($i+1). $textTag $($r.title) ($($r.cost) 點)" -ForegroundColor White
        }
        Write-Host "  N. 建立新的兌換項目" -ForegroundColor DarkGray
        Write-Host ""
        $choice = Ask "輸入編號選擇，或按 N 建立新項目"
    } else {
        Write-Host "  找不到現有兌換項目，將建立新的。" -ForegroundColor DarkGray
        $choice = "N"
    }

    if ($choice -match '^\d+$') {
        $idx = [int]$choice - 1
        if ($idx -ge 0 -and $idx -lt $existingRewards.Count) {
            $selected = $existingRewards[$idx]
            Set-EnvValue $envKey $selected.id
            Write-OK "已選擇：$($selected.title)"
            return $selected.id
        } else {
            Write-Warn "無效的編號，將建立新項目"
        }
    }

    # Create new reward
    $title = Ask "輸入新兌換項目名稱"
    $cost  = Ask "輸入點數花費（例如 500）"
    if (-not $cost -match '^\d+$') { $cost = "500" }

    $body = @{ title = $title; cost = [int]$cost; is_user_input_required = $requireTextInput }
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json))
    try {
        $r = Invoke-RestMethod -Method Post `
            -Uri "https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=$broadcasterId" `
            -Headers $rewardHeaders -Body $bodyBytes
        $newId = $r.data[0].id
        Set-EnvValue $envKey $newId
        Write-OK "已建立：$title（$cost 點）"
        return $newId
    } catch {
        Write-Warn "無法建立，請手動在 Twitch 後台建立後輸入 ID"
        Write-Host "  前往 https://dashboard.twitch.tv -> 觀眾獎勵 -> 頻道點數 -> +" -ForegroundColor DarkGray
        $manualId = Ask "貼上兌換項目 ID（可按 Enter 略過）"
        if ($manualId) { Set-EnvValue $envKey $manualId }
        return $manualId
    }
}

$rewardId       = Pick-Reward "點歌券（觀眾輸入歌名）" "TWITCH_REWARD_ID" $true
$randomRewardId = Pick-Reward "隨機點歌券（自動選歌）" "TWITCH_RANDOM_REWARD_ID" $false


# ── 步驟 6：Google 試算表 ───────────────────────────────────────────────────────
Write-Header "步驟 6 - Google 試算表"

$credPath = Join-Path $PSScriptRoot "google-credentials.json"
if (-not (Test-Path $credPath)) {
    Write-Host "  找不到 google-credentials.json，請依以下步驟建立 Google 服務帳戶：" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  服務帳戶是 Google 提供給程式使用的帳號（非個人帳號），" -ForegroundColor DarkGray
    Write-Host "  讓此系統能自動讀寫你的 Google 試算表。" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  步驟如下：" -ForegroundColor DarkGray
    Write-Host "  1. 前往 https://console.cloud.google.com 並登入 Google 帳號" -ForegroundColor DarkGray
    Write-Host "  2. 左上角下拉選單 -> 新增專案（名稱隨意）" -ForegroundColor DarkGray
    Write-Host "  3. 上方搜尋列輸入 [Google Sheets API] -> 點擊啟用" -ForegroundColor DarkGray
    Write-Host "  4. 左側選單 -> IAM 與管理 -> 服務帳戶 -> 建立服務帳戶" -ForegroundColor DarkGray
    Write-Host "  5. 名稱隨意 -> 完成" -ForegroundColor DarkGray
    Write-Host "  6. 點擊剛建立的服務帳戶 -> 金鑰 -> 新增金鑰 -> JSON" -ForegroundColor DarkGray
    Write-Host "  7. 將下載的 JSON 檔重新命名為 google-credentials.json" -ForegroundColor DarkGray
    Write-Host "  8. 放入此目錄：$PSScriptRoot" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  完成後按任意鍵繼續（系統會持續等待，直到檔案放入為止）..." -ForegroundColor Yellow
    Write-Host ""
    while (-not (Test-Path $credPath)) {
        Write-Host "  等待 google-credentials.json 出現在：$PSScriptRoot" -ForegroundColor DarkGray
        Write-Host "  按任意鍵重新檢查，或輸入 S 跳過..." -ForegroundColor DarkGray
        $key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        if ($key.Character -eq 's' -or $key.Character -eq 'S') {
            Write-Warn "已跳過，之後可手動放入 google-credentials.json"
            break
        }
    }
    if (Test-Path $credPath) {
        Write-OK "google-credentials.json 已找到"
    }
} else {
    $credsJson = Get-Content $credPath -Raw | ConvertFrom-Json
    Write-OK "google-credentials.json 已存在"
    Write-Host "  服務帳戶電子郵件：$($credsJson.client_email)" -ForegroundColor DarkGray
    Write-Host "  請將你的 Google 試算表共用給此電子郵件（歌曲清單：檢視者，點歌紀錄：編輯者）。" -ForegroundColor DarkGray
}

$sheetId = Get-EnvValue "GOOGLE_SHEET_ID"
if (-not $sheetId -or $sheetId -eq "") {
    Write-Host "  試算表網址格式：https://docs.google.com/spreadsheets/d/[ID在此]/edit" -ForegroundColor DarkCyan
    $sheetId = Ask "貼上歌曲清單試算表 ID"
    Set-EnvValue "GOOGLE_SHEET_ID" $sheetId
}
Write-OK "歌曲清單試算表 ID 已儲存"
Write-Host "  提醒：請確認已將此試算表共用給服務帳戶電子郵件（檢視者權限）" -ForegroundColor DarkGray
Write-Host ""

$songCol = Get-EnvValue "SHEET_SONG_COLUMN"
if (-not $songCol -or $songCol -eq "title") {
    Write-Host "  請輸入試算表中歌曲名稱的欄位標題（第一列的欄名）。" -ForegroundColor DarkGray
    Write-Host "  例如：title、曲名、歌名（預設為 title）" -ForegroundColor DarkGray
    $input = Ask "歌曲名稱欄位名稱（直接按 Enter 使用預設值 title）"
    $colVal = if ($input) { $input } else { "title" }
    Set-EnvValue "SHEET_SONG_COLUMN" $colVal
}
Write-OK "歌曲名稱欄位：$(Get-EnvValue 'SHEET_SONG_COLUMN')"

$artistCol = Get-EnvValue "SHEET_ARTIST_COLUMN"
if (-not $artistCol -or $artistCol -eq "artist") {
    Write-Host "  請輸入歌手名稱的欄位標題（預設為 artist）" -ForegroundColor DarkGray
    $input = Ask "歌手名稱欄位名稱（直接按 Enter 使用預設值 artist）"
    $colVal = if ($input) { $input } else { "artist" }
    Set-EnvValue "SHEET_ARTIST_COLUMN" $colVal
}
Write-OK "歌手名稱欄位：$(Get-EnvValue 'SHEET_ARTIST_COLUMN')"
Write-Host "  注意：key（移調）欄位固定使用欄名 key，請確認試算表中的欄名一致。" -ForegroundColor DarkGray

$historyId = Get-EnvValue "HISTORY_SHEET_ID"
if (-not $historyId -or $historyId -eq "") {
    Write-Host "  選填：請建立一份新的空白試算表作為點歌紀錄。" -ForegroundColor DarkGray
    Write-Host "  建立後共用給服務帳戶電子郵件（編輯者權限）。" -ForegroundColor DarkGray
    $historyId = Ask "貼上點歌紀錄試算表 ID（可按 Enter 略過）"
    if ($historyId) { Set-EnvValue "HISTORY_SHEET_ID" $historyId }
}
if ($historyId) { Write-OK "點歌紀錄試算表 ID 已儲存" }

# ── 完成 ────────────────────────────────────────────────────────────────────────
Write-Header "安裝完成！"
Write-OK ".env 設定完成"
Write-OK "Twitch 帳號已授權"
Write-OK "npm 套件已安裝"
Write-Host ""
Write-Host "  每次直播開始時，執行：" -ForegroundColor White
Write-Host '  .\start_zh.ps1' -ForegroundColor Cyan
Write-Host "  不再需要 ngrok！系統直接連線至 Twitch。" -ForegroundColor DarkGray
Write-Host ""
Pause-Key
