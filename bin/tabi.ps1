# tabi: install and update the tabi layout for Herdr (Windows).
# The Herdr config folder is a git checkout of this repository, so installing is a clone into it
# and updating is a fast-forward pull. Nothing outside tracked files is ever touched.
param(
  [Parameter(Position = 0)][string]$Command = 'help',
  [Parameter(Position = 1)][string]$Sub,
  [string]$Dir,
  [switch]$WithShell,
  [switch]$NoShell
)

$ErrorActionPreference = 'Stop'
$Version = '0.4.0'
$Repo = if ($env:TABI_REPO) { $env:TABI_REPO } else { 'https://github.com/LeoSle4/herdr-tabi.git' }
$Branch = if ($env:TABI_BRANCH) { $env:TABI_BRANCH } else { 'main' }

function Say($msg) { Write-Host "==> $msg" }
function Fail($msg) { Write-Host "error: $msg" -ForegroundColor Red; exit 1 }

function Invoke-Git {
  # Runs git against the chosen folder and stops on a non-zero exit code.
  # Windows PowerShell 5.1 turns any stderr line from a native command into an error under 'Stop'; the exit code decides here.
  $ErrorActionPreference = 'Continue'
  $out = & git -C $script:Target @args 2>&1
  if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed: $out" }
  $out
}

function Find-Folder {
  if ($Dir) { return $Dir }
  if ($env:HERDR_APP_HOME) { return $env:HERDR_APP_HOME }
  $candidates = @(
    (Join-Path $HOME '.config\herdr-app'),
    (Join-Path $env:APPDATA 'herdr-app'),
    (Join-Path $env:LOCALAPPDATA 'herdr-app')
  )
  foreach ($c in $candidates) { if (Test-Path -LiteralPath $c) { return $c } }
  Fail "Herdr's config folder was not found. Open Herdr once, then run again, or pass -Dir <folder> (the one that holds settings.json)."
}

function Restart-Notice { Say 'Restart Herdr to load the new version.' }

function Install-Tabi {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail 'git is required: install it (winget install Git.Git) and run this again.' }
  if (Test-Path -LiteralPath (Join-Path $Target '.git')) {
    Say "$Target is already a checkout: updating it"
    Update-Tabi
    return
  }
  Say "Installing tabi into $Target"
  New-Item -ItemType Directory -Force -Path $Target | Out-Null
  Invoke-Git init -q | Out-Null
  Invoke-Git remote add origin $Repo | Out-Null
  try { Invoke-Git fetch -q origin $Branch | Out-Null } catch { Fail "could not fetch $Repo ($Branch)" }

  # Keep a copy of every file the checkout is about to replace, so nothing of yours is lost.
  $backup = Join-Path $Target ('.tabi-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  foreach ($f in (Invoke-Git ls-tree -r --name-only "origin/$Branch")) {
    $mine = Join-Path $Target $f
    if (-not (Test-Path -LiteralPath $mine -PathType Leaf)) { continue }
    $a = (Invoke-Git hash-object $mine)
    $b = (Invoke-Git rev-parse "origin/${Branch}:$f")
    if ($a -eq $b) { continue }
    $copy = Join-Path $backup $f
    New-Item -ItemType Directory -Force -Path (Split-Path $copy) | Out-Null
    Copy-Item -LiteralPath $mine -Destination $copy
  }
  if (Test-Path -LiteralPath $backup) { Say "Your previous versions were saved in $backup" }

  Invoke-Git checkout -q -f -B $Branch "origin/$Branch" | Out-Null
  Invoke-Git branch -q --set-upstream-to="origin/$Branch" $Branch | Out-Null
  Say "Installed $(Invoke-Git rev-parse --short HEAD)"
  Restart-Notice
}

function Update-Self {
  # A command installed by install.ps1 (in ~\.local\bin) follows the repository; one from another place does not.
  $binDir = if ($env:TABI_BIN) { $env:TABI_BIN } else { Join-Path $HOME '.local\bin' }
  $resolved = Resolve-Path -LiteralPath $binDir -ErrorAction SilentlyContinue
  if (-not $resolved -or (Split-Path -Parent $PSCommandPath) -ne $resolved.Path) { return }
  $source = Join-Path $Target 'bin\tabi.ps1'
  if (-not (Test-Path -LiteralPath $source)) { return }
  if ((Get-FileHash -LiteralPath $source).Hash -eq (Get-FileHash -LiteralPath $PSCommandPath).Hash) { return }
  try {
    Copy-Item -LiteralPath $source -Destination "$PSCommandPath.new" -Force
    Move-Item -LiteralPath "$PSCommandPath.new" -Destination $PSCommandPath -Force
    Say 'Updated the tabi command'
  } catch { Say "could not update the tabi command: $($_.Exception.Message)" }
}

function Update-Tabi {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail 'git is required: install it (winget install Git.Git) and run this again.' }
  if (-not (Test-Path -LiteralPath (Join-Path $Target '.git'))) { Fail "$Target is not a tabi checkout: run 'tabi install' first." }
  $current = & git -C $Target symbolic-ref --short -q HEAD 2>$null
  if ($current -ne $Branch) { Fail "$Target is on '$current', not '$Branch': switch to $Branch first." }
  if (Invoke-Git status --porcelain --untracked-files=no) { Fail "you have local changes in ${Target}: commit or discard them, then run this again." }
  $before = Invoke-Git rev-parse HEAD
  try { Invoke-Git fetch -q origin $Branch | Out-Null } catch { Fail "could not fetch $Repo ($Branch)" }
  try { Invoke-Git merge -q --ff-only "origin/$Branch" | Out-Null } catch { Fail "your $Branch diverged from origin/${Branch}: resolve it by hand." }
  $after = Invoke-Git rev-parse HEAD
  Update-Self
  if ($before -eq $after) { Say "Already up to date ($(Invoke-Git rev-parse --short HEAD))" }
  else {
    Say "Updated $(Invoke-Git rev-parse --short $before) -> $(Invoke-Git rev-parse --short $after)"
    Restart-Notice
  }
}

function Ask-Extras {
  # Offer the terminal extras after an install. Flags decide without asking; a piped or redirected run never asks.
  if ($NoShell) { return $false }
  if ($WithShell) { return $true }
  if ([Console]::IsInputRedirected) { return $false }
  $answer = Read-Host 'Install the terminal extras (Starship prompt, autocompletion, zoxide, fzf, eza, bat, Nerd Font)? [y/N]'
  return ($answer -match '^(y|yes|s|si|sí)$')
}

function Show-Status {
  Write-Host "tabi $Version"
  Write-Host "folder: $Target"
  if (Get-Command git -ErrorAction SilentlyContinue) { Write-Host 'git: ok' } else { Write-Host 'git: MISSING (required)' }
  if ((Get-Command python -ErrorAction SilentlyContinue) -or (Get-Command py -ErrorAction SilentlyContinue)) { Write-Host 'python: ok' }
  else { Write-Host 'python: missing (the sessions and backdrop mods need it)' }
  if (Test-Path -LiteralPath (Join-Path $Target '.git')) { Write-Host "checkout: $(Invoke-Git rev-parse --short HEAD)" }
  else { Write-Host "checkout: not installed (run 'tabi install')" }
}

function Install-Shell {
  # Prompt (Starship), inline autocompletion (PSReadLine) and smart cd (zoxide). The profile only loads
  # shell\profile.ps1 from this repo, so 'tabi update' changes the setup without touching the profile again.
  $loader = Join-Path $Target 'shell\profile.ps1'
  if (-not (Test-Path -LiteralPath $loader)) { Fail "$loader not found: run 'tabi update' first." }
  # The same tools as the macOS zsh setup: prompt, smart cd, fuzzy finder, ls and cat replacements, a Nerd Font
  # (for other terminals) and PowerShell 7 (inline predictions need PSReadLine 2.2+).
  $packages = @(
    @('starship', 'Starship.Starship'), @('zoxide', 'ajeetdsouza.zoxide'), @('fzf', 'junegunn.fzf'),
    @('eza', 'eza-community.eza'), @('bat', 'sharkdp.bat'), @('pwsh', 'Microsoft.PowerShell'),
    @($null, 'DEVCOM.JetBrainsMonoNerdFont')
  )
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Say 'winget is not available: install Starship, zoxide, fzf, eza, bat and PowerShell 7 by hand.'
  } else {
    foreach ($pkg in $packages) {
      if ($pkg[0] -and (Get-Command $pkg[0] -ErrorAction SilentlyContinue)) { continue }
      Say "Installing $($pkg[1]) with winget"
      & winget install --id $pkg[1] -e --accept-package-agreements --accept-source-agreements | Out-Null
      # 0 = installed; -1978335189 = already installed and up to date.
      if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) { Say "could not install $($pkg[1]) (winget exit $LASTEXITCODE): install it by hand." }
    }
  }
  # PSFzf gives Ctrl+R and Ctrl+T in both PowerShell flavours; each keeps its own modules folder.
  foreach ($exe in 'powershell', 'pwsh') {
    if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { continue }
    Say "Checking the PSFzf module for $exe"
    & $exe -NoProfile -Command "if (-not (Get-Module -ListAvailable -Name PSFzf)) { try { Install-Module PSFzf -Scope CurrentUser -Force -AllowClobber -ErrorAction Stop } catch { Write-Host ('could not install PSFzf: ' + `$_.Exception.Message) } }"
  }
  $quoted = $loader.Replace("'", "''")
  $block = "# >>> tabi shell >>>`r`nif (Test-Path -LiteralPath '$quoted') { . '$quoted' }`r`n# <<< tabi shell <<<"
  $pattern = '(?s)# >>> tabi shell >>>.*?# <<< tabi shell <<<'
  $docs = [Environment]::GetFolderPath('MyDocuments')
  # Windows PowerShell 5.1 and PowerShell 7 read different profiles: set up both.
  foreach ($file in @((Join-Path $docs 'WindowsPowerShell\profile.ps1'), (Join-Path $docs 'PowerShell\profile.ps1'))) {
    New-Item -ItemType Directory -Force -Path (Split-Path $file) | Out-Null
    $text = ''
    if (Test-Path -LiteralPath $file) { $text = [string](Get-Content -LiteralPath $file -Raw) }
    if ($text -match $pattern) { $text = [regex]::Replace($text, $pattern, $block.Replace('$', '$$')) }
    else { $text = $text.TrimEnd() + "`r`n`r`n" + $block + "`r`n" }
    Set-Content -LiteralPath $file -Value $text -Encoding UTF8
    Say "Profile updated: $file"
  }
  Say 'Open a new terminal. Herdr already uses JetBrains Mono; in other terminals pick "JetBrainsMono Nerd Font" for the branch symbol.'
}

function Get-MemoryDir {
  if ($env:TABI_MEMORY_DIR) { return $env:TABI_MEMORY_DIR }
  Join-Path $HOME 'engram-memory'
}

# Engram memories hold everything said to the agents: they may only go to a repository confirmed private.
function Test-Memory($dir) {
  $ErrorActionPreference = 'Continue' # Windows PowerShell 5.1 turns native stderr into errors under 'Stop'
  if (-not (Get-Command engram -ErrorAction SilentlyContinue)) { Fail 'engram is not installed (gentle-ai installs it).' }
  if (-not (Test-Path -LiteralPath (Join-Path $dir '.git'))) { Fail "$dir is not a git checkout: clone your private memory repository there, or set TABI_MEMORY_DIR." }
  $url = & git -C $dir remote get-url origin 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $url) { Fail "$dir has no 'origin' remote." }
  if ($url -match 'herdr-tabi') { Fail "refusing: $url is the public tabi repository; memories must go to a private one." }
  if ($env:TABI_MEMORY_TRUST -eq '1') { return }
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Fail 'cannot confirm the repository is private without gh: install it, or set TABI_MEMORY_TRUST=1 if you are sure.' }
  Push-Location $dir
  try { $private = & gh repo view --json isPrivate -q .isPrivate 2>$null } finally { Pop-Location }
  if ($private -ne 'true') { Fail "$url is not confirmed private (gh repo view): memories hold everything you told your agents." }
}

function Invoke-Memory([string]$sub) {
  $ErrorActionPreference = 'Continue' # see Test-Memory
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail 'git is required: install it (winget install Git.Git) and run this again.' }
  $dir = Get-MemoryDir
  $script:Target = $dir
  switch ($sub) {
    'push' {
      Test-Memory $dir
      & git -C $dir ls-remote --exit-code origin HEAD *> $null
      if ($LASTEXITCODE -eq 0) {
        try { Invoke-Git pull -q --rebase | Out-Null } catch { Fail "could not update $dir from origin." }
      }
      Push-Location $dir
      try { & engram sync --all; if ($LASTEXITCODE -ne 0) { Fail 'engram sync failed.' } } finally { Pop-Location }
      if (-not (Invoke-Git status --porcelain -- .engram)) { Say 'Nothing new to send'; return }
      Invoke-Git add .engram | Out-Null
      try { Invoke-Git commit -q -m "memory: $env:COMPUTERNAME $(Get-Date -Format yyyy-MM-dd)" | Out-Null } catch { Fail "could not commit in $dir (is your git identity set?)." }
      try { Invoke-Git push -q -u origin HEAD | Out-Null }
      catch {
        try { Invoke-Git pull -q --rebase | Out-Null; Invoke-Git push -q -u origin HEAD | Out-Null } catch { Fail "could not push $dir." }
      }
      Say 'Memories sent'
    }
    'pull' {
      Test-Memory $dir
      try { Invoke-Git pull -q --ff-only | Out-Null } catch { Fail "could not update $dir from origin." }
      Push-Location $dir
      try { & engram sync --import; if ($LASTEXITCODE -ne 0) { Fail 'engram sync --import failed.' } } finally { Pop-Location }
      Say 'Memories imported'
    }
    'status' {
      if (-not (Get-Command engram -ErrorAction SilentlyContinue)) { Fail 'engram is not installed (gentle-ai installs it).' }
      if (-not (Test-Path -LiteralPath $dir)) { Fail "$dir does not exist: clone your private memory repository there, or set TABI_MEMORY_DIR." }
      Push-Location $dir
      try { & engram sync --status } finally { Pop-Location }
    }
    default { Fail 'usage: tabi memory push | pull | status' }
  }
}

# net-watch: keeps Tailscale (and so the link between your machines and the phone) up.
# 'run' is one check: healthy -> nothing; offline -> up to 3 repairs (down/up), one per run; still offline -> one ntfy alert.
$NwTask = 'tabi net-watch'
$NwMaxRepairs = 3

function Find-Tailscale {
  if ($null -ne $env:TABI_TAILSCALE) {
    if ($env:TABI_TAILSCALE -and (Test-Path -LiteralPath $env:TABI_TAILSCALE)) { return $env:TABI_TAILSCALE }
    return $null
  }
  $cmd = Get-Command tailscale -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $p = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
  if (Test-Path -LiteralPath $p) { return $p }
  return $null
}

function Test-TailscaleHealthy([string]$ts) {
  $ErrorActionPreference = 'Continue'
  try {
    $raw = & $ts status --json 2>$null
    if ($LASTEXITCODE -ne 0) { return $false }
    $d = ($raw | Out-String) | ConvertFrom-Json
    return ($d.BackendState -eq 'Running' -and $d.Self.Online -eq $true)
  } catch { return $false }
}

# 'tailscale up' refuses to run when your settings differ from the defaults (for example --accept-routes) and prints the
# command that keeps them; run exactly that one so a repair never changes your settings.
function Invoke-TailscaleUp([string]$ts) {
  $ErrorActionPreference = 'Continue'
  $out = & $ts up --timeout=20s 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) { return $true }
  $m = [regex]::Match($out, '(?m)^\s*tailscale up (.+?)\s*$')
  if (-not $m.Success) { return $false }
  & $ts up @($m.Groups[1].Value -split '\s+') *> $null
  return ($LASTEXITCODE -eq 0)
}

function Send-NetWatchAlert([string]$folder) {
  $cfgPath = Join-Path $folder 'data\tabi\notify.json'
  if (-not (Test-Path -LiteralPath $cfgPath)) { return }
  try { $c = Get-Content -LiteralPath $cfgPath -Raw | ConvertFrom-Json } catch { return }
  $topic = [string]$c.topic
  $server = if ($c.server) { [string]$c.server } else { 'https://ntfy.sh' }
  if ($topic -notmatch '^[A-Za-z0-9_-]{8,64}$' -or $server -notlike 'https://*') { return }
  $body = 'Tailscale is offline and the automatic repair did not work'
  if ($c.details -eq $true) { $body += " on $env:COMPUTERNAME" }
  $ErrorActionPreference = 'Continue'
  & curl.exe -fsS -m 10 -H 'Title: tabi net-watch' -H 'Priority: 4' -d $body "$($server.TrimEnd('/'))/$topic" *> $null
}

# Machines that lost their link while Tailscale was down get reconnected now instead of at their next retry.
function Restore-HerdrMachines {
  if (-not (Get-Command hc -ErrorAction SilentlyContinue)) { return }
  $ErrorActionPreference = 'Continue'
  try {
    $list = (& hc machine ls 2>$null | Out-String) | ConvertFrom-Json
    foreach ($m in $list.machines) { if ($m.state -ne 'connected' -and $m.name) { & hc machine login $m.name *> $null } }
  } catch { }
}

function Invoke-NetWatchRun([string]$folder) {
  $ts = Find-Tailscale
  if (-not $ts) { Say 'net-watch: tailscale is not installed, nothing to watch'; return }
  $stateFile = Join-Path $folder 'data\tabi\net-watch.json'
  if (Test-TailscaleHealthy $ts) {
    if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile -Force; Say 'net-watch: Tailscale is back'; Restore-HerdrMachines }
    return
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $stateFile) | Out-Null
  $attempts = 0; $alerted = $false
  if (Test-Path -LiteralPath $stateFile) {
    try { $st = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json; $attempts = [int]$st.attempts; $alerted = [bool]$st.alerted } catch { }
  }
  $wait = if ($env:TABI_NETWATCH_WAIT) { [int]$env:TABI_NETWATCH_WAIT } else { 3 }
  if ($attempts -lt $NwMaxRepairs) {
    $attempts++
    (@{ attempts = $attempts; alerted = $alerted } | ConvertTo-Json -Compress) | Set-Content -LiteralPath $stateFile
    Say "net-watch: Tailscale is offline, repair $attempts of $NwMaxRepairs"
    $ErrorActionPreference = 'Continue'
    & $ts down *> $null
    Start-Sleep -Seconds $wait
    if (-not (Invoke-TailscaleUp $ts)) { Say "net-watch: 'tailscale up' failed (run it by hand to see why)" }
    Start-Sleep -Seconds $wait
    if (Test-TailscaleHealthy $ts) { Remove-Item -LiteralPath $stateFile -Force; Say 'net-watch: Tailscale is back'; Restore-HerdrMachines }
    return
  }
  if (-not $alerted) {
    (@{ attempts = $attempts; alerted = $true } | ConvertTo-Json -Compress) | Set-Content -LiteralPath $stateFile
    Say "net-watch: still offline after $NwMaxRepairs repairs, sending the alert"
    Send-NetWatchAlert $folder
  }
}

function Install-NetWatch([string]$folder) {
  $self = $PSCommandPath
  $exe = (Get-Process -Id $PID).Path
  $argLine = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$self`" net-watch run -Dir `"$folder`""
  $action = New-ScheduledTaskAction -Execute $exe -Argument $argLine
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
  $user = "$env:USERDOMAIN\$env:USERNAME"
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 4) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $NwTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Say 'net-watch installed: it checks Tailscale every 5 minutes (Task Scheduler: "tabi net-watch")'
}

function Remove-NetWatch {
  if (Get-ScheduledTask -TaskName $NwTask -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $NwTask -Confirm:$false }
  Say 'net-watch removed'
}

function Invoke-NetWatch([string]$sub, [string]$folder) {
  switch ($sub) {
    { $_ -in '', 'run' } { Invoke-NetWatchRun $folder }
    'install' { Install-NetWatch $folder }
    'remove' { Remove-NetWatch }
    default { Fail 'usage: tabi net-watch [run | install | remove]' }
  }
}

function Show-Usage {
  @"
tabi ${Version}: install and update the tabi layout for Herdr

Usage: tabi <command> [-Dir <folder>] [-WithShell | -NoShell]

Commands:
  install   Set up tabi in the Herdr config folder (updates it if already installed), then offer the
            terminal extras; -WithShell accepts them without asking, -NoShell skips the question
  update    Pull the latest version (fast-forward only; refuses if you have local edits)
  status    Show the folder, the installed version and what is missing
  shell     Install the terminal extras (Starship, zoxide, fzf, eza, bat, Nerd Font) and wire your PowerShell profiles
  memory    Share Engram memories between machines through a private git repository:
            push | pull | status (the repository is ~\engram-memory, or $env:TABI_MEMORY_DIR)
  net-watch Keep Tailscale up so your machines and phone stay connected: run (one check), install
            (every 5 minutes, Task Scheduler), remove. Offline -> 3 automatic repairs, then one ntfy alert
  version   Print the tool version

The folder defaults to `$env:HERDR_APP_HOME, else the first of ~\.config\herdr-app, %APPDATA%\herdr-app
and %LOCALAPPDATA%\herdr-app that exists.
"@
}

switch ($Command) {
  'install' { $script:Target = Find-Folder; Install-Tabi; if (Ask-Extras) { Install-Shell } }
  'update'  { $script:Target = Find-Folder; Update-Tabi }
  'status'  { $script:Target = Find-Folder; Show-Status }
  'shell'   { $script:Target = Find-Folder; Install-Shell }
  'memory'  { Invoke-Memory $Sub }
  'net-watch' { $script:Target = Find-Folder; Invoke-NetWatch $Sub $script:Target }
  { $_ -in 'version', '--version', '-v' } { Write-Host "tabi $Version" }
  { $_ -in 'help', '--help', '-h' } { Show-Usage }
  default { Show-Usage; exit 1 }
}
