# Keeps the laptop reachable from the Claude app's Code tab, as the session named in $name. Started at logon by the
# "Cave Remote Control" task (setup\remote-control-task.ps1). same-dir and capacity 1 give the
# phone this real checkout (.env, data\, MCP config) with one session at a time. No permission flag is
# passed here; the project's deny rules on .env and data\ still apply. remote-control exits after
# about 10 minutes offline, so the loop starts it again.
$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
$name = "cave $([char]0x00B7) laptop"
$logDir = Join-Path $env:LOCALAPPDATA 'cave'
$log = Join-Path $logDir 'remote-control.log'
New-Item -ItemType Directory -Force $logDir | Out-Null

function Write-Log($message) {
  Add-Content -Path $log -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $message)
}

# A task started at logon gets the PATH of that moment; claude's own install folder is added.
$env:Path = "$env:Path;$env:USERPROFILE\.local\bin"
Set-Location $root
while ($true) {
  $claude = Get-Command claude -ErrorAction SilentlyContinue
  if (-not $claude) {
    Write-Log 'claude not found on PATH; retrying in 30 s'
  } else {
    Write-Log 'starting remote-control'
    & $claude.Source remote-control --name $name --spawn same-dir --capacity 1
    Write-Log "remote-control exited with $LASTEXITCODE; restarting in 30 s"
  }
  Start-Sleep -Seconds 30
}
