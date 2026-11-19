# Windows helper of the tabi-party mod (macOS uses `sips`, `stat` and `file` instead).
#   powershell -NoProfile -ExecutionPolicy Bypass -File portraits.ps1 -Mode list  -Dir <folder>
#   powershell -NoProfile -ExecutionPolicy Bypass -File portraits.ps1 -Mode thumb -Src <image> -Out <png> [-Size 96]
# list : one line per regular file of the folder, "<unix seconds>TAB<file name>TAB<mime type>". The mime type is filled only
#        for a file without extension, from its first bytes (png or jpeg), exactly what parseFolder in lib.js reads.
# thumb: the centered square of an image, scaled to Size px, saved as png (the EXIF rotation is applied first).
# Read-only on the source images: it only writes the thumbnail.
param(
  [Parameter(Mandatory = $true)][ValidateSet('list', 'thumb')][string]$Mode,
  [string]$Dir,
  [string]$Src,
  [string]$Out,
  [int]$Size = 96
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

function Get-Mime([string]$Path) {
  $b = New-Object byte[] 8
  $s = [System.IO.File]::OpenRead($Path)
  try { [void]$s.Read($b, 0, 8) } finally { $s.Dispose() }
  if ($b[0] -eq 0x89 -and $b[1] -eq 0x50 -and $b[2] -eq 0x4E -and $b[3] -eq 0x47) { return 'image/png' }
  if ($b[0] -eq 0xFF -and $b[1] -eq 0xD8 -and $b[2] -eq 0xFF) { return 'image/jpeg' }
  return ''
}

if ($Mode -eq 'list') {
  foreach ($f in Get-ChildItem -LiteralPath $Dir -File -Force) {
    $mime = ''
    if ($f.Extension -eq '') { $mime = Get-Mime $f.FullName }
    $secs = ([DateTimeOffset]$f.LastWriteTimeUtc).ToUnixTimeSeconds()
    [Console]::Out.Write(('{0}{3}{1}{3}{2}' -f $secs, $f.Name, $mime, [char]9) + "`n")
  }
  exit 0
}

Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($Src)
try {
  if ($img.PropertyIdList -contains 0x0112) {
    switch ($img.GetPropertyItem(0x0112).Value[0]) {
      3 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
      6 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
      8 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
    }
  }
  $side = [Math]::Min($img.Width, $img.Height)
  $x = [int](($img.Width - $side) / 2)
  $y = [int](($img.Height - $side) / 2)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  try {
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $dest = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
      $g.DrawImage($img, $dest, $x, $y, $side, $side, [System.Drawing.GraphicsUnit]::Pixel)
    } finally { $g.Dispose() }
    $tmp = "$Out.tmp.png"
    $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $bmp.Dispose() }
} finally { $img.Dispose() }
Move-Item -LiteralPath $tmp -Destination $Out -Force
