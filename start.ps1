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

# Poll until the server is ready, then open the browser.
# The server itself decides the correct page (setup wizard or dashboard)
# and redirects accordingly -- so we always open the root URL.
$openUrl = "http://localhost:3000/"
Write-Host "  Waiting for server, then opening browser..." -ForegroundColor DarkGray
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
