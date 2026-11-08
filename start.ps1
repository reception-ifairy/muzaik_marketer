<#
.SYNOPSIS
  Uruchamia aplikację lokalnie (Windows PowerShell 5.1 lub PowerShell 7).

.DESCRIPTION
  Sprawdza Node.js, instaluje zależności, tworzy plik .env (opcjonalnie pyta o klucz
  Anthropic API), buduje aplikację, uruchamia serwer i otwiera przeglądarkę.
  Zatrzymanie: Ctrl+C w tym oknie.

.EXAMPLE
  .\start.ps1
.EXAMPLE
  .\start.ps1 -Port 3001 -NoBrowser
.EXAMPLE
  .\start.ps1 -SetPassword   # zmiana hasła do logowania
.EXAMPLE
  .\start.ps1 -Dev        # tryb deweloperski (Vite, odświeżanie na żywo)
#>
[CmdletBinding()]
param(
  [int]$Port = 0,
  [switch]$Dev,
  [switch]$NoBrowser,
  [switch]$Reinstall,
  [switch]$SetKey,
  [switch]$SetPassword
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'  # no progress bars; also makes Invoke-WebRequest fast on 5.1
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$Root = $PSScriptRoot
Set-Location -LiteralPath $Root

# On Windows call the .cmd shims directly so execution policy never blocks npm.ps1.
$OnWindows = ($env:OS -eq 'Windows_NT')
$Npm = if ($OnWindows) { 'npm.cmd' } else { 'npm' }
$Npx = if ($OnWindows) { 'npx.cmd' } else { 'npx' }

function Write-Step([string]$Text) { Write-Host "`n==> $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host "    $Text" -ForegroundColor Green }
function Write-Warn([string]$Text) { Write-Host "    $Text" -ForegroundColor Yellow }
function Stop-WithError([string]$Text) {
  Write-Host "`nBŁĄD: $Text" -ForegroundColor Red
  # Keep the window open when started by double-clicking start.cmd.
  if ($env:APP_LAUNCHED_FROM_CMD) { Read-Host 'Naciśnij Enter, aby zamknąć' | Out-Null }
  exit 1
}

function Invoke-Native([string]$Exe, [string[]]$Arguments, [string]$What) {
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { Stop-WithError "$What nie powiodło się (kod $LASTEXITCODE)." }
}

# --- .env helpers (UTF-8 without BOM: dotenv would otherwise read the BOM into the first key) ---
$EnvPath = Join-Path $Root '.env'
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Read-Secret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Get-EnvValue([string]$Name) {
  if (-not (Test-Path -LiteralPath $EnvPath)) { return '' }
  foreach ($line in [System.IO.File]::ReadAllLines($EnvPath)) {
    if ($line -match "^\s*$Name\s*=\s*(.*)$") { return $Matches[1].Trim().Trim('"').Trim("'") }
  }
  return ''
}

function Set-EnvValue([string]$Name, [string]$Value) {
  $lines = @()
  if (Test-Path -LiteralPath $EnvPath) { $lines = @([System.IO.File]::ReadAllLines($EnvPath)) }
  if ($Value.Contains('"') -and $Value.Contains("'")) { Stop-WithError "Wartość $Name nie może zawierać jednocześnie znaków ' i `"." }
  $entry = if ($Value.Contains('"')) { "$Name='$Value'" } else { "$Name=`"$Value`"" }
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$Name\s*=") { $lines[$i] = $entry; $found = $true }
  }
  if (-not $found) { $lines += $entry }
  [System.IO.File]::WriteAllText($EnvPath, (($lines -join "`r`n") + "`r`n"), $Utf8NoBom)
}

# App name from src/config.ts (APP.name), so the window shows the project's own name.
$AppName = 'Aplikacja'
$configFile = Join-Path $Root 'src\config.ts'
if (Test-Path -LiteralPath $configFile) {
  $m = [regex]::Match([System.IO.File]::ReadAllText($configFile), "name:\s*'([^']+)'")
  if ($m.Success) { $AppName = $m.Groups[1].Value }
}

Write-Host ''
Write-Host "  $AppName" -ForegroundColor White
Write-Host '  ------------------------------------------------' -ForegroundColor DarkGray

# 1. Node.js
Write-Step 'Sprawdzam Node.js'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Stop-WithError ("Nie znaleziono Node.js. Zainstaluj wersję LTS (20 lub nowszą):`n" +
    "  winget install OpenJS.NodeJS.LTS`n" +
    "albo pobierz z https://nodejs.org, a potem otwórz NOWE okno PowerShell i uruchom skrypt ponownie.")
}
$nodeVersion = (& node --version).Trim()
$major = [int]($nodeVersion.TrimStart('v').Split('.')[0])
if ($major -lt 20) {
  Stop-WithError "Masz Node.js $nodeVersion — potrzebna jest wersja 20 lub nowsza (winget upgrade OpenJS.NodeJS.LTS)."
}
Write-Ok "Node.js $nodeVersion"

# 2. Dependencies
$modules = Join-Path $Root 'node_modules'
$lockFile = Join-Path $Root 'package-lock.json'
$stamp = Join-Path $modules '.package-lock.json'
$needInstall = $Reinstall -or -not (Test-Path -LiteralPath $modules) -or -not (Test-Path -LiteralPath $stamp) -or
  ((Get-Item -LiteralPath $lockFile -Force).LastWriteTime -gt (Get-Item -LiteralPath $stamp -Force).LastWriteTime)
if ($needInstall) {
  Write-Step 'Instaluję zależności (pierwsze uruchomienie trwa 1–3 minuty)'
  Invoke-Native $Npm @('install', '--no-audit', '--no-fund') 'Instalacja zależności (npm install)'
  Write-Ok 'Zależności zainstalowane'
} else {
  Write-Step 'Zależności są aktualne'
}

# 3. .env and API key
Write-Step 'Konfiguracja'
if (-not (Test-Path -LiteralPath $EnvPath)) {
  Copy-Item -LiteralPath (Join-Path $Root '.env.example') -Destination $EnvPath
  Write-Ok 'Utworzono plik .env'
}
$apiKey = Get-EnvValue 'ANTHROPIC_API_KEY'
if (-not $apiKey -or $SetKey) {
  Write-Host '    Klucz Anthropic API (sk-ant-...) znajdziesz na https://console.anthropic.com → API Keys.' -ForegroundColor Gray
  Write-Host '    Wklej go i naciśnij Enter, albo naciśnij sam Enter, żeby pominąć (klucz można też podać w aplikacji).' -ForegroundColor Gray
  $entered = (Read-Secret '    Klucz API').Trim()
  if ($entered) {
    if ($entered -notlike 'sk-ant-*') { Write-Warn 'Klucz nie zaczyna się od "sk-ant-" — sprawdź, czy wklejony został cały klucz.' }
    Set-EnvValue 'ANTHROPIC_API_KEY' $entered
    Write-Ok 'Klucz zapisany w pliku .env (tylko na tym komputerze)'
  } else {
    Write-Warn 'Pominięto — podaj klucz w aplikacji: Ustawienia → Klucz Anthropic API.'
  }
} else {
  Write-Ok 'Klucz API jest w pliku .env'
}

# Owner login (server/auth.ts): the app stays locked until OWNER_PASSWORD is set.
$ownerLogin = Get-EnvValue 'OWNER_LOGIN'
if (-not $ownerLogin) {
  $typed = (Read-Host '    Login do aplikacji (Enter = admin)').Trim().ToLower()
  $ownerLogin = if ($typed -match '^[a-z0-9._-]{2,40}$') { $typed } else { 'admin' }
  Set-EnvValue 'OWNER_LOGIN' $ownerLogin
}
if (-not (Get-EnvValue 'OWNER_PASSWORD') -or $SetPassword) {
  Write-Host "    Ustaw hasło do logowania w aplikacji (login: $ownerLogin)." -ForegroundColor Gray
  while ($true) {
    $pass1 = Read-Secret '    Nowe hasło (min. 8 znaków)'
    if ($pass1.Length -lt 8) { Write-Warn 'Hasło musi mieć co najmniej 8 znaków.'; continue }
    $pass2 = Read-Secret '    Powtórz hasło'
    if ($pass1 -cne $pass2) { Write-Warn 'Hasła się różnią — spróbuj jeszcze raz.'; continue }
    break
  }
  Set-EnvValue 'OWNER_PASSWORD' $pass1
  Write-Ok "Hasło zapisane w pliku .env (login: $ownerLogin)"
} else {
  Write-Ok "Logowanie skonfigurowane (login: $ownerLogin)"
}
if (-not (Get-EnvValue 'SESSION_SECRET')) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  Set-EnvValue 'SESSION_SECRET' (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
  Write-Ok 'Wygenerowano SESSION_SECRET (logowanie przetrwa restart)'
}

if ($Port -le 0) {
  $fromEnv = Get-EnvValue 'PORT'
  $Port = if ($fromEnv -match '^\d+$') { [int]$fromEnv } else { 3000 }
}
$env:PORT = "$Port"
$Url = "http://localhost:$Port"

# 4. Port check
$listener = $null
try {
  $listener = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback), $Port
  $listener.Start()
} catch {
  Stop-WithError "Port $Port jest zajęty. Aplikacja może już działać — otwórz $Url — albo uruchom: .\start.ps1 -Port 3001"
} finally {
  if ($listener) { $listener.Stop() }
}

# 5. Build (production mode)
if (-not $Dev) {
  Write-Step 'Buduję aplikację'
  Invoke-Native $Npm @('run', 'build', '--silent') 'Budowanie aplikacji (npm run build)'
  Write-Ok 'Gotowe'
}

# 6. Open the browser once the server answers
if (-not $NoBrowser) {
  $null = Start-Job -ArgumentList $Url -ScriptBlock {
    param($u)
    for ($i = 0; $i -lt 90; $i++) {
      try {
        Invoke-WebRequest -Uri "$u/api/status" -UseBasicParsing -TimeoutSec 2 | Out-Null
        break
      } catch { Start-Sleep -Seconds 1 }
    }
    if ($i -lt 90) { Start-Process $u }
  }
}

# 7. Run
Write-Step "Uruchamiam $AppName → $Url"
Write-Host '    Zatrzymanie: Ctrl+C. Okno musi pozostać otwarte, dopóki korzystasz z aplikacji.' -ForegroundColor Gray
Write-Host ''
$serverArgs = @('tsx', 'server.ts')
if (-not $Dev) { $serverArgs += '--production' }
try {
  & $Npx @serverArgs
} finally {
  Get-Job | Remove-Job -Force -ErrorAction SilentlyContinue
}
if ($LASTEXITCODE -ne 0) { Stop-WithError 'Serwer zakończył działanie z błędem (szczegóły powyżej).' }
