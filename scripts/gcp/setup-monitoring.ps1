<#
.SYNOPSIS
  Creates or updates JSMF's alerting in Google Cloud: one email notification
  channel, the crash-report log metric, and the alert policies in
  scripts/gcp/monitoring/policies. See docs/observability/README.md.

.DESCRIPTION
  Safe to run again: everything is matched by name and updated in place, never
  duplicated. It only creates or updates - it never deletes anything. Run
  with -DryRun first to see what it would do.

  Needs: gcloud signed in as someone with Monitoring Editor and Logs
  Configuration Writer on the project.

.EXAMPLE
  ./scripts/gcp/setup-monitoring.ps1 -ProjectId my-project -AlertEmail alerts@jsmf.me -DryRun
  ./scripts/gcp/setup-monitoring.ps1 -ProjectId my-project -AlertEmail alerts@jsmf.me
#>
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')][string]$ProjectId,
  [Parameter(Mandatory = $true)][ValidatePattern('^[^@\s]+@[^@\s]+\.[^@\s]+$')][string]$AlertEmail,
  # Crash reports from one app in 10 minutes before the spike alert fires.
  [ValidateRange(1, 100000)][int]$ClientErrorThreshold = 20,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$monitoring = Join-Path $here 'monitoring'

function Invoke-Gcloud {
  param([string[]]$Arguments, [switch]$Mutating)
  if ($Mutating -and $DryRun) {
    Write-Host "  [dry run] gcloud $($Arguments -join ' ')" -ForegroundColor Yellow
    return ''
  }
  $output = & gcloud @Arguments --project $ProjectId --quiet 2>&1
  if ($LASTEXITCODE -ne 0) { throw "gcloud $($Arguments[0..2] -join ' ') failed:`n$output" }
  return ($output | Out-String).Trim()
}

Write-Host "JSMF monitoring setup for project '$ProjectId'$(if ($DryRun) { ' (dry run)' })" -ForegroundColor Cyan

# 1. Email notification channel - reused if one for this address exists.
Write-Host "`n1. Notification channel for $AlertEmail"
$channel = Invoke-Gcloud @('beta', 'monitoring', 'channels', 'list',
  "--filter=type = 'email' AND labels.email_address = '$AlertEmail'", '--format=value(name)', '--limit=1')
if ($channel) {
  Write-Host "  exists: $channel"
} else {
  $channel = Invoke-Gcloud -Mutating @('beta', 'monitoring', 'channels', 'create',
    "--display-name=JSMF alerts ($AlertEmail)", '--type=email',
    "--channel-labels=email_address=$AlertEmail", '--format=value(name)')
  if ($DryRun) { $channel = 'projects/<new-channel>' }
  Write-Host "  created: $channel"
}

# 2. Log-based metric counting crash reports, per app.
Write-Host "`n2. Log metric jsmf_client_errors"
$metricFile = Join-Path $monitoring 'client-errors.metric.json'
$existingMetrics = Invoke-Gcloud @('logging', 'metrics', 'list', '--format=value(name)')
$metricExists = ($existingMetrics -split "`r?`n") -contains 'jsmf_client_errors'
$verb = if ($metricExists) { 'update' } else { 'create' }
Invoke-Gcloud -Mutating @('logging', 'metrics', $verb, 'jsmf_client_errors', "--config-from-file=$metricFile") | Out-Null
Write-Host "  $($verb)d"

# 3. Alert policies, matched by display name. Names stay plain ASCII: Windows
# PowerShell can mangle other characters on their way into gcloud's --filter,
# and a name that no longer matches would be created again instead of updated.
Write-Host "`n3. Alert policies"
$temp = New-Item -ItemType Directory -Path (Join-Path ([IO.Path]::GetTempPath()) "jsmf-monitoring-$([guid]::NewGuid())")
try {
  $rawPolicies = Invoke-Gcloud @('monitoring', 'policies', 'list', '--format=json')
  $allPolicies = if ($rawPolicies) { $rawPolicies | ConvertFrom-Json } else { @() }
  foreach ($file in Get-ChildItem (Join-Path $monitoring 'policies') -Filter '*.json') {
    $json = (Get-Content $file.FullName -Raw -Encoding utf8).
      Replace('${CHANNEL}', $channel).
      Replace('${CLIENT_ERROR_THRESHOLD}', [string]$ClientErrorThreshold)
    $displayName = ($json | ConvertFrom-Json).displayName
    $filled = Join-Path $temp.FullName $file.Name
    [IO.File]::WriteAllText($filled, $json, (New-Object Text.UTF8Encoding $false))

    $existing = ($allPolicies | Where-Object { $_.displayName -eq $displayName }).name | Select-Object -First 1
    if ($existing) {
      Invoke-Gcloud -Mutating @('monitoring', 'policies', 'update', $existing, "--policy-from-file=$filled") | Out-Null
      Write-Host "  updated: $displayName"
    } else {
      Invoke-Gcloud -Mutating @('monitoring', 'policies', 'create', "--policy-from-file=$filled") | Out-Null
      Write-Host "  created: $displayName"
    }
  }
} finally {
  Remove-Item -Recurse -Force $temp.FullName
}

Write-Host "`nDone." -ForegroundColor Green
Write-Host 'One manual step remains: Error Reporting -> "Configure notifications" -> pick the same channel,'
Write-Host 'so a brand-new kind of error emails you the first time it appears.'
