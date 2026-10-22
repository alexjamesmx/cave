# Registers (or with -Remove, removes) the per-user "Cave Remote Control" task, which runs
# setup/remote-control.sh inside WSL, hidden, at logon. Run it from the WSL checkout, for example
# from Ubuntu: powershell.exe -File "$(wslpath -w setup/remote-control-task.ps1)". Needs no admin
# rights; running it again replaces the task with the same definition.
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

# The distro and the checkout's Linux path come from where this script lives.
$root = Split-Path $PSScriptRoot -Parent
if ($root -notmatch '^\\\\wsl(?:\.localhost|\$)\\([^\\]+)(\\.*)$') {
  throw "Run this from the WSL checkout (\\wsl.localhost\<distro>\...), not from $root"
}
$distro = $Matches[1]
$linuxRoot = $Matches[2] -replace '\\', '/'

# The attached wsl.exe keeps the distro and the WSL VM running, so vmIdleTimeout never stops the
# loop. If WSL goes away (wsl --shutdown, an update), the outer loop starts it again after 30 s.
$loop = "while (`$true) { wsl.exe -d $distro --cd '$linuxRoot' -- bash setup/remote-control.sh; Start-Sleep -Seconds 30 }"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$loop`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
# The loop runs for the whole logon: no time limit, and it keeps running on battery.
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Force | Out-Null
Write-Host "Task `"$taskName`" registered: it runs $linuxRoot/setup/remote-control.sh in $distro at logon."
Write-Host "Start it now with: Start-ScheduledTask -TaskName '$taskName'"
Write-Host 'Log, inside WSL: ~/.local/state/cave/remote-control.log'
Write-Host 'Optional, your call: keep the laptop awake while plugged in with  powercfg /change standby-timeout-ac 0'
