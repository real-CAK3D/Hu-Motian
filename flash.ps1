# Build + flash the Human Radar firmware. Usage: .\flash.ps1 [-Port COM6] [-BuildOnly]
# Finds PlatformIO from $env:PIO, then PATH, then the default PlatformIO install.
# Machine-specific overrides (e.g. $env:PIO, $env:PLATFORMIO_CORE_DIR) can go in flash.local.ps1 (git-ignored).
param([string]$Port = "COM6", [switch]$BuildOnly)
$local = Join-Path $PSScriptRoot 'flash.local.ps1'
if (Test-Path $local) { . $local }
$pio = $env:PIO
if (-not $pio) { $pio = (Get-Command pio -ErrorAction SilentlyContinue).Source }
if (-not $pio) { $pio = Join-Path $env:USERPROFILE '.platformio\penv\Scripts\pio.exe' }
if (-not (Test-Path $pio)) { throw "PlatformIO not found. Install it or set `$env:PIO to pio.exe." }
Push-Location $PSScriptRoot\firmware
try {
  $target = if ($BuildOnly) { @() } else { @("-t", "upload", "--upload-port", $Port) }
  & $pio run @target 2>&1 |
    Select-String -Pattern ' error|Error [0-9]|RAM:|Flash:|Hash of data verified|SUCCESS|FAILED|busy|denied'
} finally { Pop-Location }
