<#
.SYNOPSIS
  Sets up a second Claude Code account on Windows that shares your settings with the main one, but never its login.

.DESCRIPTION
  Safe to run again: every step checks first and skips what is already done.

  Shared by junction (no administrator needed): skills, agents, output-styles, plugins, commands.
  Shared by copy, main -> second account, every time the wrapper starts: CLAUDE.md, settings.json.
  Registered again in the second account (same command and arguments as in the main one): the MCP servers in -Mcp.

  Never shared: .credentials.json, .claude.json, history.jsonl, projects, sessions, file-history and the rest of the
  account's own state. A server with env, headers or a url (it may hold a key) is skipped with a warning, not copied.
  Only the mcpServers section of ~/.claude.json is read.

.PARAMETER Name       Command that starts the second account (a wrapper <Name>.cmd in -BinDir). Default: claude2.
.PARAMETER ConfigDir  Config folder of the second account. Default: ~/.claude-cuenta2.
.PARAMETER BinDir     Where claude.exe and the wrapper live. Default: ~/.local/bin.
.PARAMETER Mcp        MCP servers to register in the second account.
.PARAMETER Force      Replace an existing wrapper whose content differs.
.PARAMETER DryRun     Print what would be done and change nothing.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File setup-claude2.ps1 -DryRun
#>
[CmdletBinding()]
param(
  [string]$Name = 'claude2',
  [string]$ConfigDir = (Join-Path $env:USERPROFILE '.claude-cuenta2'),
  [string]$BinDir = (Join-Path $env:USERPROFILE '.local\bin'),
  [string[]]$Mcp = @('engram', 'codegraph', 'context7'),
  [switch]$Force,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$main = Join-Path $env:USERPROFILE '.claude'
$claudeExe = Join-Path $BinDir 'claude.exe'
$linked = 'skills', 'agents', 'output-styles', 'plugins', 'commands'
$copied = 'CLAUDE.md', 'settings.json'

function Say([string]$text) { Write-Output "  $text" }
function Act([string]$what, [scriptblock]$do) {
  if ($DryRun) { Say "[dry-run] $what"; return }
  & $do
  Say "done: $what"
}

if (-not (Test-Path -LiteralPath $main)) { throw "The main account folder does not exist: $main" }
if (-not (Test-Path -LiteralPath $claudeExe)) { throw "claude.exe not found: $claudeExe" }
if ((Resolve-Path -LiteralPath $main).Path.TrimEnd('\') -ieq $ConfigDir.TrimEnd('\')) { throw '-ConfigDir cannot be the main account folder.' }

Write-Output "Second account '$Name' -> $ConfigDir"

# 1. Config folder.
if (Test-Path -LiteralPath $ConfigDir) { Say "ok: $ConfigDir exists" }
else { Act "create $ConfigDir" { New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null } }

# 2. Folders shared by junction. Remove one later with `rmdir <link>`, never with `del /s`: that would delete the real files.
foreach ($n in $linked) {
  $target = Join-Path $main $n
  $link = Join-Path $ConfigDir $n
  if (-not (Test-Path -LiteralPath $target)) { Act "create the empty shared folder $target" { New-Item -ItemType Directory -Force -Path $target | Out-Null } }
  if (Test-Path -LiteralPath $link) {
    $item = Get-Item -LiteralPath $link -Force
    if ($item.LinkType -eq 'Junction' -and (($item.Target -join ',').TrimEnd('\') -ieq $target)) { Say "ok: $n is a junction to the main account" }
    else { Write-Warning "$link exists and is not a junction to $target. Left alone: move it away and run again to share $n." }
    continue
  }
  Act "junction $link -> $target" { cmd /c mklink /J "$link" "$target" | Out-Null; if ($LASTEXITCODE -ne 0) { throw "mklink failed for $link" } }
}

# 3. The wrapper: points the account's config folder, copies the two loose files from the main account, runs claude.exe.
$profileDir = $env:USERPROFILE.TrimEnd('\')
$cfg = if ($ConfigDir.StartsWith($profileDir + '\', [StringComparison]::OrdinalIgnoreCase)) { '%USERPROFILE%' + $ConfigDir.Substring($profileDir.Length) } else { $ConfigDir }
$lines = @('@echo off', "set `"CLAUDE_CONFIG_DIR=$cfg`"",
  'rem One-way sync from the main account: CLAUDE.md and settings.json (the folders are junctions).')
foreach ($f in $copied) { $lines += "if exist `"%USERPROFILE%\.claude\$f`" copy /Y `"%USERPROFILE%\.claude\$f`" `"%CLAUDE_CONFIG_DIR%\$f`" >nul" }
$lines += '"%~dp0claude.exe" %*'
$text = ($lines -join "`r`n") + "`r`n"
$wrapper = Join-Path $BinDir "$Name.cmd"
$current = if (Test-Path -LiteralPath $wrapper) { [System.IO.File]::ReadAllText($wrapper) } else { $null }
if ($current -eq $text) { Say "ok: $wrapper is up to date" }
elseif ($null -ne $current -and -not $Force) { Write-Warning "$wrapper exists with other content. Left alone; use -Force to replace it (only the CLAUDE_CONFIG_DIR line is needed for the account)." }
else { Act "write $wrapper" { New-Item -ItemType Directory -Force -Path $BinDir | Out-Null; [System.IO.File]::WriteAllText($wrapper, $text, [System.Text.Encoding]::ASCII) } }

# 4. First copy of the loose files, so the account is complete before its first start.
foreach ($f in $copied) {
  $src = Join-Path $main $f
  if (-not (Test-Path -LiteralPath $src)) { Say "skip: $src does not exist"; continue }
  $dst = Join-Path $ConfigDir $f
  if ((Test-Path -LiteralPath $dst) -and ((Get-FileHash -LiteralPath $src).Hash -eq (Get-FileHash -LiteralPath $dst).Hash)) { Say "ok: $f is up to date" }
  else { Act "copy $f from the main account" { Copy-Item -LiteralPath $src -Destination $dst -Force } }
}

# 5. MCP servers: same command and arguments as in the main account, user scope. Only the mcpServers section is read.
function Get-McpServers([string]$file) {
  if (-not (Test-Path -LiteralPath $file)) { return $null }
  $json = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
  return $json.mcpServers
}
$mainServers = Get-McpServers (Join-Path $env:USERPROFILE '.claude.json')
$mineServers = Get-McpServers (Join-Path $ConfigDir '.claude.json')
foreach ($n in $Mcp) {
  $s = if ($mainServers) { $mainServers.PSObject.Properties[$n].Value } else { $null }
  if ($mineServers -and $mineServers.PSObject.Properties[$n]) { Say "ok: MCP $n is already registered"; continue }
  if (-not $s) { Write-Warning "MCP $n is not in the main account: skipped."; continue }
  $type = if ($s.type) { [string]$s.type } else { 'stdio' }
  $filled = { param($o) $o -and @($o.PSObject.Properties).Count -gt 0 }
  $hasSecrets = (& $filled $s.env) -or (& $filled $s.headers) -or [bool]$s.url
  if ($type -ne 'stdio' -or $hasSecrets) { Write-Warning "MCP $n has env, headers or a url (it may hold a key): not copied. Add it by hand with: claude mcp add"; continue }
  $argv = @($s.args | ForEach-Object { [string]$_ })
  Act "register MCP $n ($($s.command) $($argv -join ' '))" {
    $before = $env:CLAUDE_CONFIG_DIR
    $env:CLAUDE_CONFIG_DIR = $ConfigDir
    try { & $claudeExe mcp add --scope user $n -- $s.command @argv | Out-Null; if ($LASTEXITCODE -ne 0) { throw "claude mcp add failed for $n" } }
    finally { $env:CLAUDE_CONFIG_DIR = $before }
  }
}

Write-Output ''
Write-Output "Next: run '$Name' and type /login. The login is not shared with the main account."
