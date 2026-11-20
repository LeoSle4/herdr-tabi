# tabi shell: prompt, inline autocompletion and smart cd for PowerShell.
# Loaded from your profile by `tabi shell`; edit this file (not the profile) and run `tabi update` to share changes.

# Prompt: the same Starship look as on macOS (folder, "on" branch, git status, "took 8s").
if (Get-Command starship -ErrorAction SilentlyContinue) {
  $env:STARSHIP_CONFIG = Join-Path $PSScriptRoot 'starship.toml'
  Invoke-Expression (& starship init powershell)
}

# Autocompletion: gray suggestion from your history while you type; Right arrow accepts it, Ctrl+Right takes one word.
# Tab opens a menu of matching files and folders (cd her<Tab>).
if (Get-Module -ListAvailable -Name PSReadLine) {
  Import-Module PSReadLine
  try {
    Set-PSReadLineOption -PredictionSource HistoryAndPlugin -PredictionViewStyle InlineView -ErrorAction Stop
  } catch {
    # Older PSReadLine (Windows PowerShell 5.1 ships 2.0): no predictions there. Run `Install-Module PSReadLine -Force` to get them.
  }
  Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete
  Set-PSReadLineKeyHandler -Key Ctrl+RightArrow -Function ForwardWord
}

# Smart cd: `z her` jumps to the folder you visit most that matches "her".
if (Get-Command zoxide -ErrorAction SilentlyContinue) {
  Invoke-Expression (& { (zoxide init powershell | Out-String) })
}
