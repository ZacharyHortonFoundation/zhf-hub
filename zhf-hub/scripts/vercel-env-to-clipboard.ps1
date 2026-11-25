<#
  ZHF Hub - put Vercel's environment variables on the clipboard (secrets never shown on screen).

  Asks for the Supabase database password (hidden), generates fresh AUTH_SECRET and CRON_SECRET
  values, and copies a KEY=VALUE block to the clipboard. Paste it into the first "Key" box of
  Vercel's Environment Variables section - Vercel splits it into one row per variable.

  Usage (from the zhf-hub folder):
    powershell -ExecutionPolicy Bypass -File scripts\vercel-env-to-clipboard.ps1 `
      -ProjectRef <ref> -PoolerHost aws-1-us-west-1.pooler.supabase.com -AppUrl https://zhf-hub.vercel.app
#>
param(
  [Parameter(Mandatory = $true)][string]$ProjectRef,
  [Parameter(Mandatory = $true)][string]$PoolerHost,
  [Parameter(Mandatory = $true)][string]$AppUrl
)
$ErrorActionPreference = "Stop"

function New-Secret([int]$bytes = 48) {
  $b = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return ([Convert]::ToBase64String($b)).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

Write-Host ""
Write-Host "ZHF Hub - Vercel environment variables" -ForegroundColor Cyan
$secure = Read-Host "Paste the Supabase DATABASE password (input is hidden)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if (-not $plain) { throw "No password entered." }
  $pw = [uri]::EscapeDataString($plain)
  $lines = @(
    "DATABASE_URL=postgresql://postgres.$($ProjectRef):$pw@$($PoolerHost):6543/postgres?pgbouncer=true&connection_limit=1&schema=zhf",
    "AUTH_SECRET=$(New-Secret 48)",
    "CRON_SECRET=$(New-Secret 32)",
    "APP_URL=$AppUrl",
    "ORG_TIMEZONE=America/Los_Angeles"
  )
  Set-Clipboard -Value ($lines -join "`n")
  Write-Host ""
  Write-Host "Copied 5 variables to the clipboard:" -ForegroundColor Green
  Write-Host "  DATABASE_URL, AUTH_SECRET, CRON_SECRET, APP_URL, ORG_TIMEZONE  (values not shown)"
  Write-Host "Now click the first 'Key' box under Environment Variables in Vercel and press Ctrl+V."
  Write-Host "After pasting, you can clear the clipboard by copying anything else."
}
catch {
  Write-Host "Stopped: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Variable plain, pw, lines -ErrorAction SilentlyContinue
}
