# ============================================================
#  VTuber 點歌系統 - 直播啟動腳本
#  每次直播開始時執行：對檔案按右鍵 -> 以 PowerShell 執行
# ============================================================

$ErrorActionPreference = "Stop"
$HOST.UI.RawUI.WindowTitle = "VTuber 點歌系統"
chcp 65001 | Out-Null

function Write-Step($text) { Write-Host "  >> $text" -ForegroundColor Cyan }
function Write-OK($text)   { Write-Host "  [OK] $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "  [!] $text" -ForegroundColor Yellow }
function Write-Err($text)  { Write-Host "  [X] $text" -ForegroundColor Red }

Clear-Host
Write-Host ""
Write-Host "  VTuber 點歌系統 - 啟動中..." -ForegroundColor Magenta
Write-Host "  --------------------------------------" -ForegroundColor DarkMagenta
Write-Host ""

# Check Node.js
$nodeVer = node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "找不到 Node.js，請至 https://nodejs.org 安裝"
    Read-Host "按 Enter 離開"; exit 1
}
Write-OK "Node.js：$nodeVer"

# Ensure packages are installed
Write-Step "檢查 npm 套件..."
npm install --silent
Write-OK "npm 套件已就緒"

# Start server
Write-Step "啟動伺服器..."
Write-Host ""
Write-Host "  ---------------------------------------------" -ForegroundColor DarkMagenta
Write-Host "  控制台：http://localhost:3000/dashboard" -ForegroundColor White
Write-Host "  顯示層：http://localhost:3000/overlay/index.html" -ForegroundColor White
Write-Host "  安裝精靈：http://localhost:3000/setup?lang=zh-TW" -ForegroundColor DarkGray
Write-Host "  ---------------------------------------------" -ForegroundColor DarkMagenta
Write-Host ""
Write-Host "  直播結束後按 Ctrl+C 停止伺服器。" -ForegroundColor DarkGray
Write-Host "  提醒：請確認 OBS 瀏覽器來源已設定並顯示於場景中。" -ForegroundColor DarkGray
Write-Host ""

Set-Location $PSScriptRoot

# Poll until the server is ready, then open the browser.
# The server itself decides the correct page (setup wizard or dashboard)
# and redirects accordingly -- so we always open the root URL.
$openUrl = "http://localhost:3000/?lang=zh-TW"
Write-Host "  等待伺服器就緒後自動開啟瀏覽器..." -ForegroundColor DarkGray
Start-Job -ScriptBlock {
    param($u)
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep 1
        try {
            Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop | Out-Null
            $ready = $true
            break
        } catch {}
    }
    if ($ready) { Start-Process $u }
} -ArgumentList $openUrl | Out-Null

npm start
