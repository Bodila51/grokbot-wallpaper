# Build lively\dist\grokbot-wallpaper.zip: a Lively "webpage link" wallpaper that opens the LIVE page
# <server>/face/ from the local Bot HQ server (nothing is copied, edits in web\ and assets\ show after a reload).
# The view key from data\view-key.txt goes into the link, so the zip is git-ignored: never share it.
#   -NoShot   skip the fresh screenshot and use the committed lively\preview.jpg as the tile picture
param([switch]$NoShot)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

if (-not (Test-Server)) { & (Join-Path $PSScriptRoot 'server.ps1') -Wait }

# The key is made by the server on its first start with auth; if another server (e.g. --no-auth) holds the port, make it the same way.
$keyFile = Join-Path $Data 'view-key.txt'
if (-not (Test-Path $keyFile)) {
  $auth = ([Uri](Join-Path $Root 'server\auth.js')).AbsoluteUri
  & node --input-type=module -e "import { loadViewKey } from '$auth'; loadViewKey({ dataDir: process.argv[1] });" $Data
}
$key = (Get-Content $keyFile -Raw).Trim()
$url = "$Base/face/?key=$key"

$dist = Join-Path $PSScriptRoot 'dist'
$zip = Join-Path $dist 'grokbot-wallpaper.zip'
$pkg = Join-Path $env:TEMP ('gbw-pkg-' + [guid]::NewGuid().ToString('N'))   # fresh staging folder, only the zip stays
New-Item -ItemType Directory -Force $dist, $pkg | Out-Null

$info = Get-Content (Join-Path $PSScriptRoot 'LivelyInfo.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$info.FileName = $url
[IO.File]::WriteAllText((Join-Path $pkg 'LivelyInfo.json'), ($info | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))

# Tile picture: a fresh 640x360 shot of the live page (headless Edge), else the committed one.
function Save-Shot([string]$from, [string]$jpg) {
  $edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" |
    Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $edge) { return $false }
  $tmp = Join-Path $env:TEMP ('gbw-shot-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory $tmp | Out-Null
  $png = Join-Path $tmp 'shot.png'
  try {
    $p = Start-Process $edge -WindowStyle Hidden -PassThru -ArgumentList @(
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--mute-audio', "--user-data-dir=`"$tmp\profile`"",
      '--window-size=1280,720', '--virtual-time-budget=6000', "--screenshot=`"$png`"", "`"$from`"")
    $null = $p.WaitForExit(30000)
    if (-not (Test-Path $png)) { return $false }
    Add-Type -AssemblyName System.Drawing
    $src = [Drawing.Image]::FromFile($png)
    $bmp = New-Object Drawing.Bitmap 640, 360
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($src, 0, 0, 640, 360)
    $jpeg = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
    $q = New-Object Drawing.Imaging.EncoderParameters 1
    $q.Param[0] = New-Object Drawing.Imaging.EncoderParameter ([Drawing.Imaging.Encoder]::Quality), 85L
    $bmp.Save($jpg, $jpeg, $q)
    $g.Dispose(); $bmp.Dispose(); $src.Dispose()
    return $true
  } catch { return $false } finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}
$shot = Join-Path $pkg 'preview.jpg'
if ($NoShot -or -not (Save-Shot $url $shot)) { Copy-Item (Join-Path $PSScriptRoot 'preview.jpg') $shot }

$tmpZip = "$pkg.zip"
Compress-Archive -Path (Join-Path $pkg '*') -DestinationPath $tmpZip -Force
Remove-Item -Recurse -Force $pkg -ErrorAction SilentlyContinue
# A just-written zip can be held for a moment (antivirus, indexer): retry the swap a few times.
for ($i = 1; ; $i++) {
  try { Move-Item $tmpZip $zip -Force -ErrorAction Stop; break }
  catch { if ($i -ge 10) { throw }; Start-Sleep -Seconds 1 }
}
Write-Host "Готово: $zip"
Write-Host 'В архиве ключ просмотра: не выкладывай и не пересылай его.'
