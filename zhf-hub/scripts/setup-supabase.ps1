<#
  ZHF Hub - first-time setup of a Supabase database.

  Creates the tables (in their own "zhf" schema), locks Supabase's public Data API out of them,
  and adds the reference data + first administrator account.

  The database password is typed by YOU at the prompt (hidden) and only kept in memory for the
  duration of this script. Nothing is written to disk except a log with secrets removed.

  Usage (from the zhf-hub folder):
    powershell -ExecutionPolicy Bypass -File scripts\setup-supabase.ps1 `
      -ProjectRef <ref> -PoolerHost aws-0-us-west-1.pooler.supabase.com `
      -AdminEmail you@example.org -AdminName "Your Name"
#>
param(
  [Parameter(Mandatory = $true)][string]$ProjectRef,
  [Parameter(Mandatory = $true)][string]$PoolerHost,
  [Parameter(Mandatory = $true)][string]$AdminEmail,
  [string]$AdminName = "ZHF Administrator"
)
$ErrorActionPreference = "Stop"
$appDir = Split-Path -Parent $PSScriptRoot
$log = Join-Path $appDir ".setup-supabase.log"
Set-Location $appDir

function Write-Log([string]$line) { Add-Content -Path $log -Value $line -Encoding utf8 }
Set-Content -Path $log -Value "ZHF Hub Supabase setup - $(Get-Date -Format s) - project $ProjectRef via $PoolerHost" -Encoding utf8

Write-Host ""
Write-Host "ZHF Hub - Supabase setup" -ForegroundColor Cyan
Write-Host "Project: $ProjectRef   Host: $PoolerHost   First admin: $AdminEmail"
Write-Host ""
$secure = Read-Host "Paste the Supabase DATABASE password (input is hidden)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if (-not $plain) { throw "No password entered." }
  $pw = [uri]::EscapeDataString($plain)
  $env:DATABASE_URL = "postgresql://postgres.$($ProjectRef):$pw@$($PoolerHost):5432/postgres?schema=zhf"
  $env:ADMIN_EMAIL = $AdminEmail
  $env:ADMIN_NAME = $AdminName

  Write-Host "`n1/2  Creating tables and locking down the Data API..." -ForegroundColor Cyan
  $out = cmd /c "npm run db:deploy 2>&1"
  $out | ForEach-Object { Write-Host $_ }
  $out | ForEach-Object { Write-Log ($_ -replace [regex]::Escape($plain), "<password>" -replace [regex]::Escape($pw), "<password>") }
  if ($LASTEXITCODE -ne 0) { throw "db:deploy failed - see the messages above." }

  Write-Host "`n2/2  Adding reference data and the first administrator..." -ForegroundColor Cyan
  $out = cmd /c "npm run db:init 2>&1"
  $hide = $false
  foreach ($line in $out) {
    Write-Host $line
    if ($line -match "Temporary admin password") { $hide = $true; Write-Log $line; continue }
    if ($hide -and $line.Trim()) { Write-Log "  <temporary password hidden from log>"; $hide = $false; continue }
    Write-Log ($line -replace [regex]::Escape($plain), "<password>" -replace [regex]::Escape($pw), "<password>")
  }
  if ($LASTEXITCODE -ne 0) { throw "db:init failed - see the messages above." }

  Write-Host "`nDone." -ForegroundColor Green
  Write-Host "For Vercel, DATABASE_URL is the TRANSACTION pooler (port 6543):"
  Write-Host "  postgresql://postgres.$($ProjectRef):<password>@$($PoolerHost):6543/postgres?pgbouncer=true&connection_limit=1&schema=zhf"
  Write-Log "SETUP COMPLETED OK"
}
catch {
  Write-Host "`nSetup stopped: $($_.Exception.Message)" -ForegroundColor Red
  Write-Log ("SETUP FAILED: " + $_.Exception.Message)
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Variable plain, pw -ErrorAction SilentlyContinue
  Remove-Item Env:DATABASE_URL, Env:ADMIN_EMAIL, Env:ADMIN_NAME -ErrorAction SilentlyContinue
  # switch this computer back to the local SQLite database
  cmd /c "node scripts/prisma-provider.mjs --generate >nul 2>&1"
  Write-Host "(Local development switched back to the SQLite database.)"
}
