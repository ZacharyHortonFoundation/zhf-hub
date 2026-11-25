<#
  ZHF Hub - copy a verified trial migration (local SQLite) into the Supabase production database.

  Runs scripts/load-trial-into-production.mjs: one all-or-nothing transaction, refused if production
  already holds constituents, gifts, events or opportunities. See docs/03-migration-plan.md.

  The database password is typed by YOU at the prompt (hidden) and only kept in memory for the
  duration of this script. Nothing is written to disk.

  Usage (from the zhf-hub folder):
    powershell -ExecutionPolicy Bypass -File scripts\load-to-supabase.ps1 `
      -ProjectRef <ref> -PoolerHost aws-1-us-west-1.pooler.supabase.com [-TrialDb prisma\trial-migration.db] [-Check]
#>
param(
  [Parameter(Mandatory = $true)][string]$ProjectRef,
  [Parameter(Mandatory = $true)][string]$PoolerHost,
  [string]$TrialDb = "prisma\trial-migration.db",
  [switch]$Check
)
$ErrorActionPreference = "Stop"
$appDir = Split-Path -Parent $PSScriptRoot
Set-Location $appDir

Write-Host ""
Write-Host "ZHF Hub - load the migrated AHA data into Supabase" -ForegroundColor Cyan
Write-Host "Project: $ProjectRef   Host: $PoolerHost   Trial copy: $TrialDb"
if (-not (Test-Path $TrialDb)) { Write-Host "Trial database not found: $TrialDb" -ForegroundColor Red; exit 1 }
Write-Host ""
$secure = Read-Host "Paste the Supabase DATABASE password (input is hidden)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if (-not $plain) { throw "No password entered." }
  $pw = [uri]::EscapeDataString($plain)
  $env:PROD_DATABASE_URL = "postgresql://postgres.$($ProjectRef):$pw@$($PoolerHost):5432/postgres?schema=zhf"
  $env:TRIAL_DB = (Resolve-Path $TrialDb).Path

  $nodeArgs = @("scripts/load-trial-into-production.mjs")
  if ($Check) { $nodeArgs += "--check" }
  & node @nodeArgs 2>&1 | ForEach-Object {
    Write-Host (("$_" -replace [regex]::Escape($plain), "<password>") -replace [regex]::Escape($pw), "<password>")
  }
  if ($LASTEXITCODE -ne 0) { throw "The load stopped - see the messages above. Nothing was copied unless it says Done." }
  Write-Host "`nFinished." -ForegroundColor Green
}
catch {
  Write-Host "`n$($_.Exception.Message)" -ForegroundColor Red
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Variable plain, pw -ErrorAction SilentlyContinue
  Remove-Item Env:PROD_DATABASE_URL, Env:TRIAL_DB -ErrorAction SilentlyContinue
}
