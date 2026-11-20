<#
.SYNOPSIS
  Fallback: starts herdr-core when Windows starts, as your user and not elevated, even before you sign in.
.DESCRIPTION
  Use it only if the restart test in README.md showed the core does not come up over SSH.
  It registers one scheduled task. Without -Apply it only prints what it would do.
  The task needs your Windows password to run before you sign in; Task Scheduler stores it, this script does not.
.PARAMETER Apply   Register the task (asks for your password). Needs an administrator PowerShell.
.PARAMETER Remove  Unregister the task.
.PARAMETER Hc      Full path of hc.exe. Default: the one on the PATH, else ~\.local\bin\hc.exe.
.PARAMETER TaskName  Name of the task. Default: "Herdr core".
#>
param(
  [switch]$Apply,
  [switch]$Remove,
  [string]$Hc,
  [string]$TaskName = 'Herdr core'
)

$ErrorActionPreference = 'Stop'

function Say($msg) { Write-Host "==> $msg" }

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  (New-Object Security.Principal.WindowsPrincipal $id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if ($Remove) {
  if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) { Say "No task named '$TaskName': nothing to remove."; return }
  if (-not (Test-Admin)) { throw 'Removing the task needs an administrator PowerShell.' }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Say "Removed '$TaskName'."
  return
}

if (-not $Hc) {
  $found = Get-Command hc -ErrorAction SilentlyContinue
  $Hc = if ($found) { $found.Source } else { Join-Path $HOME '.local\bin\hc.exe' }
}
if (-not (Test-Path -LiteralPath $Hc)) { throw "hc.exe not found at $Hc. Pass -Hc <full path>." }

$user = "$env:USERDOMAIN\$env:USERNAME"
Say "Task:    $TaskName"
Say "Runs:    $Hc server start"
Say "As:      $user, at Windows startup, not elevated (RunLevel Limited), whether or not you are signed in"
Say 'Restart: up to 3 times, one minute apart, if it fails'

if (-not $Apply) {
  Say 'Nothing changed. Add -Apply to register it.'
  return
}
if (-not (Test-Admin)) { throw 'Registering the task needs an administrator PowerShell.' }

$secure = Read-Host "Windows password for $user (stored by Task Scheduler)" -AsSecureString
$plain = [System.Net.NetworkCredential]::new('', $secure).Password
try {
  $action = New-ScheduledTaskAction -Execute $Hc -Argument 'server start'
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -User $user -Password $plain -RunLevel Limited -Force | Out-Null
  Say "Registered '$TaskName'. Restart the PC without signing in and repeat the test in README.md."
} finally {
  $plain = $null
}
