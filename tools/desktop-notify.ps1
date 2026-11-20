<#
.SYNOPSIS
  Shows a Windows notification (a toast) with a title and a body. Used by tabi-status when Herdr is not the active window.
.DESCRIPTION
  Runs in Windows PowerShell 5.1 (the `powershell` that every Windows has): it is the one that can reach the Windows
  notification classes. It borrows PowerShell's own application id, because a toast from an unregistered app can be dropped.
  It prints nothing and exits 1 if the notification could not be shown.
#>
param(
  [string]$Title = 'Herdr',
  [string]$Body = ''
)

try {
  [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
  [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  $xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text></text><text></text></binding></visual></toast>')
  $texts = $xml.GetElementsByTagName('text')
  # InnerText, not string building: a title with <, & or quotes can never break the XML.
  $texts.Item(0).InnerText = $Title
  $texts.Item(1).InnerText = $Body
  $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
  $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
} catch {
  exit 1
}
