<#
.SYNOPSIS
  Shows a Windows notification (a toast) laid out like an agent's card: a round portrait, the name, a second line and a third.
  Used by tabi-status when Herdr is not the active window.
.DESCRIPTION
  Runs in Windows PowerShell 5.1 (the `powershell` that every Windows has): it is the one that can reach the Windows
  notification classes. It borrows PowerShell's own application id, because a toast from an unregistered app can be dropped.
  -Image is the path of a picture; it is shown cropped to a circle. Missing or unreadable, the toast simply has no picture.
  It prints nothing and exits 1 if the notification could not be shown.
#>
param(
  [string]$Title = 'Herdr',
  [string]$Subtitle = '',
  [string]$Body = '',
  [string]$Image = ''
)

try {
  [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
  [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  $xml.LoadXml('<toast><visual><binding template="ToastGeneric"><image placement="appLogoOverride" hint-crop="circle"/><text></text><text></text><text></text></binding></visual></toast>')
  $image = $xml.GetElementsByTagName('image').Item(0)
  if ($Image -and (Test-Path -LiteralPath $Image)) {
    $image.SetAttribute('src', ([System.Uri]$Image).AbsoluteUri)
  } else {
    [void]$image.ParentNode.RemoveChild($image)
  }
  $texts = $xml.GetElementsByTagName('text')
  # InnerText, not string building: a title with <, & or quotes can never break the XML.
  $texts.Item(0).InnerText = $Title
  $texts.Item(1).InnerText = $Subtitle
  $texts.Item(2).InnerText = $Body
  # A line with nothing in it would still take its space: take those out (from the end, so the indexes hold).
  for ($i = $texts.Length - 1; $i -ge 0; $i--) {
    if (-not $texts.Item($i).InnerText) { [void]$texts.Item($i).ParentNode.RemoveChild($texts.Item($i)) }
  }
  $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
  $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
} catch {
  exit 1
}
