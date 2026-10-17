# Registers (or with -Remove, removes) the per-user "Cave Remote Control" task, which runs
# setup\remote-control.ps1 hidden at logon. Needs no admin rights; running it again replaces
# the task with the same definition.
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$taskName = 'Cave Remote Control'
$user = "$env:USERDOMAIN\$env:USERNAME"

if ($Remove) {
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed the task `"$taskName`". A remote-control process already running keeps going until you end it or log off."
  } else {
    Write-Host "No task `"$taskName`" to remove."
  }
  return
}

$script = Join-Path $PSScriptRoot 'remote-control.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
# The loop runs for the whole logon: no time limit, and it keeps running on battery.
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Force | Out-Null
Write-Host "Task `"$taskName`" registered: it starts at logon. Start it now with: Start-ScheduledTask -TaskName '$taskName'"
Write-Host "Log: $(Join-Path $env:LOCALAPPDATA 'cave\remote-control.log')"
Write-Host 'Optional, your call: keep the laptop awake while plugged in with  powercfg /change standby-timeout-ac 0'
