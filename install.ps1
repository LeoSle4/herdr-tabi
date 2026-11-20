# One-line installer for Windows (PowerShell):
#   irm https://raw.githubusercontent.com/LeoSle4/herdr-tabi/main/install.ps1 | iex
# It puts the `tabi` command in ~\.local\bin, adds that folder to your user PATH and runs `tabi install`.
$ErrorActionPreference = 'Stop'

$raw = if ($env:TABI_RAW) { $env:TABI_RAW } else { 'https://raw.githubusercontent.com/LeoSle4/herdr-tabi/main' }
$bin = if ($env:TABI_BIN) { $env:TABI_BIN } else { Join-Path $HOME '.local\bin' }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host 'error: git is required: install it (winget install Git.Git) and run this again.' -ForegroundColor Red
  return
}

New-Item -ItemType Directory -Force -Path $bin | Out-Null
foreach ($f in 'tabi.ps1', 'tabi.cmd') {
  Invoke-WebRequest -UseBasicParsing -Uri "$raw/bin/$f" -OutFile (Join-Path $bin $f)
}
Write-Host "==> Installed the tabi command in $bin"

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($userPath -split ';') -notcontains $bin) {
  [Environment]::SetEnvironmentVariable('Path', ($userPath.TrimEnd(';') + ';' + $bin), 'User')
  Write-Host '==> Added it to your user PATH: open a new terminal to run "tabi" from anywhere.'
}

& (Join-Path $bin 'tabi.ps1') install
