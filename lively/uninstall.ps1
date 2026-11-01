# Undo install.ps1 (uninstall.cmd runs this): the login autostart, the server it started, our wallpaper in Lively's
# library and the built zip (it holds the view key). The repo and data\ (journal, password, key) stay.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

if (Test-Path $ShortcutPath) { Remove-Item $ShortcutPath; Write-Host 'Автозапуск сервера убран.' }

# Only the server server.ps1 started (its pid and its flags), never someone's dev server on the same port.
$pidFile = Join-Path $Data 'autostart.pid'
if (Test-Path $pidFile) {
  $id = [int](Get-Content $pidFile -Raw).Trim()
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction SilentlyContinue
  if ($proc -and $proc.CommandLine -like '*server.js*--no-cache*') {
    & taskkill.exe /PID $id /T /F | Out-Null   # the cmd.exe and the node server under it
    Write-Host 'Сервер обоев остановлен.'
  }
  Remove-Item $pidFile
}

$dest = Join-Path (Get-LivelyWallpaperDir) $LibraryFolderName
if (Test-Path $dest) {
  $lively = Find-Lively
  $layout = Join-Path $env:LOCALAPPDATA 'Lively Wallpaper\WallpaperLayout.json'
  $active = (Test-Path $layout) -and ((Get-Content $layout -Raw) -match [regex]::Escape($LibraryFolderName))
  if ($lively -and $active -and (Get-Process Lively -ErrorAction SilentlyContinue)) {
    Start-Process $lively -ArgumentList 'closewp', '--monitor', '-1' -Wait
  }
  Remove-Item -Recurse -Force $dest
  Write-Host 'Обои Grok Bot убраны из библиотеки Lively.'
}

$dist = Join-Path $PSScriptRoot 'dist'
if (Test-Path $dist) {
  Remove-Item -Recurse -Force $dist -ErrorAction SilentlyContinue
  if (Test-Path $dist) { Write-Host "Не вышло удалить $dist (файл занят): удали папку вручную, в zip ключ." -ForegroundColor Yellow }
}
Write-Host 'Если ставил обои из zip вручную: в Lively правый клик по обоям Grok Bot → «Удалить».' -ForegroundColor Green
