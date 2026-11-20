# Tests for bin/tabi.ps1 against a throwaway local origin. Run from the repo root: pwsh test/tabi.test.ps1
# (or powershell, for Windows PowerShell 5.1). Everything happens inside a temp folder; nothing of yours is touched.
$ErrorActionPreference = 'Continue'

$repoRoot = Split-Path -Parent $PSScriptRoot
$tabi = Join-Path $repoRoot 'bin\tabi.ps1'
# The same PowerShell that runs the tests also runs the command.
$ps = (Get-Process -Id $PID).Path
$script:fails = 0

function Check([string]$name, [bool]$ok) {
  if ($ok) { Write-Host "ok   $name" } else { Write-Host "FAIL $name"; $script:fails++ }
}
function G {
  & git -c user.name=t -c user.email=t@t.test @args
  if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed" }
}
function Run {
  $out = & $ps -NoProfile -ExecutionPolicy Bypass -File $tabi @args 2>&1
  [pscustomobject]@{ Code = $LASTEXITCODE; Out = ($out | Out-String) }
}
function Text([string]$path) { (Get-Content -LiteralPath $path -Raw).Trim() }
function Put([string]$path, [string]$text) {
  New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
  [IO.File]::WriteAllText($path, "$text`n")
}

# 0. Every PowerShell script parses in this PowerShell (this catches "$Version:" style mistakes).
$skip = [regex]'\\(\.git|node_modules)\\'
foreach ($f in Get-ChildItem -Path $repoRoot -Recurse -Filter *.ps1 -File | Where-Object { $_.FullName -notmatch $skip }) {
  $errors = $null; $tokens = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$tokens, [ref]$errors)
  Check "parses: $($f.FullName.Substring($repoRoot.Length + 1))" ($errors.Count -eq 0)
  foreach ($e in $errors) { Write-Host "     $($e.Message) (line $($e.Extent.StartLineNumber))" }
}

$root = Join-Path ([IO.Path]::GetTempPath()) ('tabi-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
try {
  # An origin with one commit: a settings file and a mod.
  $origin = Join-Path $root 'origin.git'
  $work = Join-Path $root 'work'
  G init -q --bare -b main $origin
  G clone -q $origin $work 2>$null
  Put (Join-Path $work 'settings.json') 'upstream'
  Put (Join-Path $work 'mods\tabi-x\main.js') 'mod v1'
  G -C $work checkout -q -B main
  G -C $work add -A
  G -C $work commit -q -m one
  G -C $work push -q origin main
  $env:TABI_REPO = $origin

  # 1. A fresh install into an empty folder.
  $A = Join-Path $root 'a'
  $r = Run install -Dir $A -NoShell
  Check 'install: succeeds' ($r.Code -eq 0)
  Check 'install: tracked files arrive' ((Text (Join-Path $A 'mods\tabi-x\main.js')) -eq 'mod v1')
  Check 'install: folder is a checkout on main' ((& git -C $A symbolic-ref --short HEAD) -eq 'main')

  # 2. An install over an existing folder keeps the replaced file and the untracked ones.
  $B = Join-Path $root 'b'
  Put (Join-Path $B 'settings.json') 'mine'
  Put (Join-Path $B 'data\state.json') 'state'
  $r = Run install -Dir $B -NoShell
  Check 'install over existing: succeeds' ($r.Code -eq 0)
  Check 'install over existing: file replaced' ((Text (Join-Path $B 'settings.json')) -eq 'upstream')
  $backup = Get-ChildItem -LiteralPath $B -Directory -Filter '.tabi-backup-*' | Select-Object -First 1
  Check 'install over existing: old file backed up' ($backup -and (Text (Join-Path $backup.FullName 'settings.json')) -eq 'mine')
  Check 'install over existing: untracked data untouched' ((Text (Join-Path $B 'data\state.json')) -eq 'state')
  Check 'install over existing: identical files not backed up' (-not ($backup -and (Test-Path (Join-Path $backup.FullName 'mods'))))

  # 3. Update brings a new commit.
  Put (Join-Path $work 'mods\tabi-x\main.js') 'mod v2'
  G -C $work commit -q -am two
  G -C $work push -q origin main
  $r = Run update -Dir $A
  Check 'update: succeeds' ($r.Code -eq 0)
  Check 'update: new version arrives' ((Text (Join-Path $A 'mods\tabi-x\main.js')) -eq 'mod v2')
  $r = Run update -Dir $A
  Check 'update: running again says up to date' ($r.Code -eq 0 -and $r.Out -match 'Already up to date')

  # 4. Update refuses local edits to tracked files.
  Put (Join-Path $A 'settings.json') 'edited'
  $r = Run update -Dir $A
  Check 'update: refuses with local changes' ($r.Code -ne 0)
  Check 'update: leaves the edit alone' ((Text (Join-Path $A 'settings.json')) -eq 'edited')
  G -C $A checkout -q -- settings.json

  # 5. Update refuses when the folder is on another branch.
  G -C $A checkout -q -b other
  $r = Run update -Dir $A
  Check 'update: refuses off main' ($r.Code -ne 0)
  G -C $A checkout -q main

  # 6. Update on a folder that was never installed.
  $empty = Join-Path $root 'empty'
  New-Item -ItemType Directory -Path $empty | Out-Null
  $r = Run update -Dir $empty
  Check 'update: refuses a non-checkout' ($r.Code -ne 0)

  # 7. Install on an installed folder updates it instead of failing.
  $r = Run install -Dir $A -NoShell
  Check 'install again: behaves as update' ($r.Code -eq 0 -and $r.Out -match 'Already up to date')

  # 8. The version command and the help.
  $r = Run version
  Check 'version: prints the tool version' ($r.Out -match 'tabi \d+\.\d+\.\d+')
  $r = Run help
  Check 'help: prints usage and mentions shell' ($r.Code -eq 0 -and $r.Out -match 'shell')
  # 9. tabi memory: two machines share Engram chunks through a git repository (engram itself is a stub here).
  $bin = Join-Path $root 'bin'
  New-Item -ItemType Directory -Path $bin | Out-Null
  [IO.File]::WriteAllText((Join-Path $bin 'engram.cmd'), @'
@echo off
if "%2"=="--all" (
  if not exist .engram mkdir .engram
  for %%I in (.) do echo chunk> ".engram\chunk-%%~nxI"
)
if "%2"=="--import" echo imported>> "%STUB_LOG%"
if "%2"=="--status" echo Sync status:
'@)
  $env:PATH = "$bin;$env:PATH"
  $env:STUB_LOG = Join-Path $root 'stub.log'
  $memOrigin = Join-Path $root 'mem.git'
  G init -q --bare -b main $memOrigin
  foreach ($m in 'm1', 'm2') {
    $d = Join-Path $root $m
    G clone -q $memOrigin $d 2>$null
    G -C $d config user.name t
    G -C $d config user.email t@t.test
    G -C $d checkout -q -B main
  }
  $m1 = Join-Path $root 'm1'; $m2 = Join-Path $root 'm2'
  $env:TABI_MEMORY_TRUST = '1'

  $env:TABI_MEMORY_DIR = $m1
  $r = Run memory push
  Check 'memory: push sends the chunk' ($r.Code -eq 0 -and $r.Out -match 'Memories sent' -and ((& git -C $memOrigin ls-tree -r --name-only main) -contains '.engram/chunk-m1'))
  $r = Run memory push
  Check 'memory: push again has nothing new' ($r.Code -eq 0 -and $r.Out -match 'Nothing new')

  $env:TABI_MEMORY_DIR = $m2
  $r = Run memory pull
  Check 'memory: pull brings it and imports' ($r.Code -eq 0 -and (Test-Path (Join-Path $m2 '.engram\chunk-m1')) -and ((Get-Content -LiteralPath $env:STUB_LOG -Raw) -match 'imported'))
  $r = Run memory push
  $env:TABI_MEMORY_DIR = $m1
  $r2 = Run memory pull
  Check 'memory: the other machine sends its own chunk' ($r.Code -eq 0 -and $r2.Code -eq 0 -and (Test-Path (Join-Path $m1 '.engram\chunk-m2')))
  $r = Run memory status
  Check 'memory: status passes engram through' ($r.Out -match 'Sync status')
  $r = Run memory nonsense
  Check 'memory: unknown subcommand fails' ($r.Code -ne 0)

  $pubOrigin = Join-Path $root 'herdr-tabi.git'
  G init -q --bare -b main $pubOrigin
  $pub = Join-Path $root 'pub'
  G clone -q $pubOrigin $pub 2>$null
  $env:TABI_MEMORY_DIR = $pub
  $r = Run memory push
  Check 'memory: refuses the public tabi repository' ($r.Code -ne 0 -and $r.Out -match 'public tabi repository')
  $env:TABI_MEMORY_DIR = $empty
  $r = Run memory push
  Check 'memory: refuses a folder that is not a checkout' ($r.Code -ne 0)
  $env:TABI_MEMORY_DIR = $m1
  $env:TABI_MEMORY_TRUST = $null
  $r = Run memory push
  Check 'memory: refuses when privacy cannot be confirmed' ($r.Code -ne 0)
}
finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}

if ($script:fails -ne 0) { Write-Host "`n$($script:fails) test(s) failed"; exit 1 }
Write-Host "`nall passed"
# Some tests run tabi to prove that it fails, and the last one leaves $LASTEXITCODE at 1. GitHub's pwsh steps end with
# `exit $LASTEXITCODE`, so a green run would be reported as a failure: leave a clean code.
exit 0
