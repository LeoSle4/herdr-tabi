# tabi: install and update the tabi layout for Herdr (Windows).
# The Herdr config folder is a git checkout of this repository, so installing is a clone into it
# and updating is a fast-forward pull. Nothing outside tracked files is ever touched.
param(
  [Parameter(Position = 0)][string]$Command = 'help',
  [string]$Dir
)

$ErrorActionPreference = 'Stop'
$Version = '0.1.0'
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
  if ($before -eq $after) { Say "Already up to date ($(Invoke-Git rev-parse --short HEAD))" }
  else {
    Say "Updated $(Invoke-Git rev-parse --short $before) -> $(Invoke-Git rev-parse --short $after)"
    Restart-Notice
  }
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
  foreach ($pkg in @(@('starship', 'Starship.Starship'), @('zoxide', 'ajeetdsouza.zoxide'))) {
    if (Get-Command $pkg[0] -ErrorAction SilentlyContinue) { continue }
    if (Get-Command winget -ErrorAction SilentlyContinue) {
      Say "Installing $($pkg[0]) with winget"
      & winget install --id $pkg[1] -e --accept-package-agreements --accept-source-agreements | Out-Null
    } else { Say "$($pkg[0]) is missing and winget is not available: install it by hand." }
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
  Say 'Open a new terminal. For the branch symbol, pick a Nerd Font in your terminal.'
}

function Show-Usage {
  @"
tabi $Version: install and update the tabi layout for Herdr

Usage: tabi <command> [-Dir <folder>]

Commands:
  install   Set up tabi in the Herdr config folder (updates it if already installed)
  update    Pull the latest version (fast-forward only; refuses if you have local edits)
  status    Show the folder, the installed version and what is missing
  shell     Set up the Starship prompt and inline autocompletion in your PowerShell profiles
  version   Print the tool version

The folder defaults to `$env:HERDR_APP_HOME, else the first of ~\.config\herdr-app, %APPDATA%\herdr-app
and %LOCALAPPDATA%\herdr-app that exists.
"@
}

switch ($Command) {
  'install' { $script:Target = Find-Folder; Install-Tabi }
  'update'  { $script:Target = Find-Folder; Update-Tabi }
  'status'  { $script:Target = Find-Folder; Show-Status }
  'shell'   { $script:Target = Find-Folder; Install-Shell }
  { $_ -in 'version', '--version', '-v' } { Write-Host "tabi $Version" }
  { $_ -in 'help', '--help', '-h' } { Show-Usage }
  default { Show-Usage; exit 1 }
}
