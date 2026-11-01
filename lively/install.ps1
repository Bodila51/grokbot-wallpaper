# One-click install of the Grok Bot wallpaper for Lively, no admin rights (install.cmd runs this):
#  1. a Startup-folder shortcut starts the Bot HQ server hidden at every Windows login (server.ps1);
#  2. starts the server now and builds lively\dist\grokbot-wallpaper.zip (build.ps1);
#  3. Lively from its own installer: the wallpaper goes into Lively's library and is set on the main screen;
#     otherwise (or the Microsoft Store version) the folder with the zip opens, to drag it into Lively.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Нужен Node.js 24 или новее (https://nodejs.org). Поставь его и запусти install.cmd ещё раз.' -ForegroundColor Yellow
  exit 1
}

$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($ShortcutPath)
$lnk.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $PSScriptRoot 'server.ps1')`""
$lnk.WorkingDirectory = $Root
$lnk.WindowStyle = 7   # minimized: no window flashes at login
$lnk.Description = 'Bot HQ server for the Grok Bot wallpaper (Lively)'
$lnk.Save()
Write-Host "Автозапуск сервера при входе в Windows: $ShortcutPath"

& (Join-Path $PSScriptRoot 'server.ps1') -Wait
if ($LASTEXITCODE) { Write-Host "Сервер не запустился, смотри $Data\autostart.err.log" -ForegroundColor Red; exit 1 }
Write-Host "Сервер работает: $Base"

& (Join-Path $PSScriptRoot 'build.ps1')
$zip = Join-Path $PSScriptRoot 'dist\grokbot-wallpaper.zip'

$lively = Find-Lively
if ($lively) {
  $dest = Join-Path (Get-LivelyWallpaperDir) $LibraryFolderName
  Expand-Archive -Path $zip -DestinationPath $dest -Force
  if (-not (Get-Process Lively -ErrorAction SilentlyContinue)) { Start-Process $lively; Start-Sleep -Seconds 8 }
  Start-Process $lively -ArgumentList 'setwp', '--file', "`"$dest`"" -Wait
  Write-Host 'Готово: обои Grok Bot стоят в Lively (главный экран).' -ForegroundColor Green
} else {
  Start-Process explorer.exe "/select,`"$zip`""
  Write-Host 'Осталось: перетащи grokbot-wallpaper.zip в окно Lively (или «Добавить обои» → выбрать этот файл).' -ForegroundColor Green
}
