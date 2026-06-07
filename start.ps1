# ============================================================
#  VTuber Song Queue - Stream Startup
#  Run every stream: right-click -> Run with PowerShell
# ============================================================

$ErrorActionPreference = "Stop"
$HOST.UI.RawUI.WindowTitle = "VTuber Song Queue"

function Write-Step($text) { Write-Host "  >> $text" -ForegroundColor Cyan }
function Write-OK($text)   { Write-Host "  [OK] $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "  [!] $text" -ForegroundColor Yellow }
function Write-Err($text)  { Write-Host "  [X] $text" -ForegroundColor Red }

Clear-Host
Write-Host ""
Write-Host "  VTuber Song Queue - Starting..." -ForegroundColor Magenta
Write-Host "  --------------------------------------" -ForegroundColor DarkMagenta
Write-Host ""

# Check Node.js
$nodeVer = node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "Node.js not found. Please install from https://nodejs.org"
    Read-Host "Press Enter to exit"; exit 1
}
Write-OK "Node.js: $nodeVer"

# Ensure packages are installed
Write-Step "Checking npm packages..."
npm install --silent
Write-OK "npm packages ready"

# Start server
Write-Step "Starting server..."
Write-Host ""
Write-Host "  ---------------------------------------------" -ForegroundColor DarkMagenta
Write-Host "  Dashboard: http://localhost:3000/dashboard" -ForegroundColor White
Write-Host "  Overlay:   http://localhost:3000/overlay/index.html" -ForegroundColor White
Write-Host "  Setup:     http://localhost:3000/setup" -ForegroundColor DarkGray
Write-Host "  ---------------------------------------------" -ForegroundColor DarkMagenta
Write-Host ""
Write-Host "  Press Ctrl+C to stop the server when done streaming." -ForegroundColor DarkGray
Write-Host "  Reminder: make sure your OBS Browser Source is visible in your scene." -ForegroundColor DarkGray
Write-Host ""

Set-Location $PSScriptRoot

# Open browser after short delay so server has time to start
$openUrl = if (-not (Test-Path (Join-Path $PSScriptRoot ".env")) -or (Get-Content (Join-Path $PSScriptRoot ".env") -Raw) -notmatch "TWITCH_USER_ACCESS_TOKEN=.+") { "http://localhost:3000/setup" } else { "http://localhost:3000/dashboard" }
Write-Host "  Opening setup wizard in browser... $openUrl" -ForegroundColor DarkGray
Start-Job -ScriptBlock { param($u) Start-Sleep 3; Start-Process $u } -ArgumentList $openUrl | Out-Null

npm start
