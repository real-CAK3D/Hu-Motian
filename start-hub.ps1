# Starts the Human Radar PC hub in the background (dashboard on http://127.0.0.1:8765/).
# Safe to run repeatedly: if the hub is already listening, nothing happens.
# Phone access over Tailscale (one-time): tailscale serve --bg --set-path /radar http://127.0.0.1:8765
param([switch]$Window)
$port = 8765
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
  Write-Output "Hub already running on port $port"
  return
}
$py = (Get-Command python -ErrorAction Stop).Source
$pc = Join-Path $PSScriptRoot 'pc'
$argList = @((Join-Path $pc 'radar.py'))
if (-not $Window) { $argList += '--no-window' }
Start-Process -FilePath $py -ArgumentList $argList -WorkingDirectory $pc -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $pc 'hub.log') -RedirectStandardError (Join-Path $pc 'hub.err.log')
Write-Output "Hub started: http://127.0.0.1:$port/"
