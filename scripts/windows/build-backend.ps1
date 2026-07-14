$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path "$PSScriptRoot\..\.."
$BackendDir = Join-Path $RootDir "backend"
$TargetArch = $env:PC_SERVER_DESKTOP_TARGET_ARCH
if (-not $TargetArch) {
  try {
    $ProcessArchitecture = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture
    if ($null -ne $ProcessArchitecture) {
      $TargetArch = $ProcessArchitecture.ToString().ToLowerInvariant()
    }
  } catch {
    Write-Warning "Unable to detect the process architecture automatically: $($_.Exception.Message)"
  }
}
if (-not $TargetArch) {
  $TargetArch = $env:PROCESSOR_ARCHITEW6432
}
if (-not $TargetArch) {
  $TargetArch = $env:PROCESSOR_ARCHITECTURE
}
switch ($TargetArch) {
  "amd64" { $TargetArch = "x64" }
  "x86_64" { $TargetArch = "x64" }
  "x64" { $TargetArch = "x64" }
  "arm64" { $TargetArch = "arm64" }
  "aarch64" { $TargetArch = "arm64" }
}
if ($TargetArch -notin @("x64", "arm64")) {
  Write-Host "Unable to determine the target architecture automatically."
  Write-Host "Confirm the architecture for the package you are building:"
  Write-Host "  x64   - Intel or AMD 64-bit Windows"
  Write-Host "  arm64 - Windows on ARM"
  Write-Host "  x86   - not supported by this desktop package"
  Write-Host "Then set it before rerunning, for example:"
  Write-Host "  `$env:PC_SERVER_DESKTOP_TARGET_ARCH = 'x64'"
  throw "Set PC_SERVER_DESKTOP_TARGET_ARCH to x64 or arm64 after confirming the target architecture."
}
$DesktopBackendDir = Join-Path $RootDir "desktop\resources-win-$TargetArch\backend"
$PythonBin = $env:PC_SERVER_PYTHON

if (-not $PythonBin) {
  $PythonBin = Join-Path $BackendDir ".venv-win\Scripts\python.exe"
}

if (-not (Test-Path $PythonBin)) {
  $PythonBin = "python"
}

Push-Location $BackendDir
& $PythonBin -m pip install -e .
& $PythonBin -m pip install pyinstaller
& $PythonBin -m PyInstaller `
  --name pc-server-backend `
  --onefile `
  --clean `
  --noconfirm `
  --hidden-import app.legacy.hdc_server `
  --hidden-import harmony_agent `
  --hidden-import wechat_collect `
  --hidden-import wechat_collect.service `
  --hidden-import wechat_collect.collector `
  --hidden-import wechat_collect.config `
  --hidden-import wechat_collect.device `
  --hidden-import wechat_collect.parser `
  --hidden-import wechat_collect.render `
  --add-data "app\legacy\harmony_agent.py;app\legacy" `
  --add-data "app\legacy\serve_model.py;app\legacy" `
  --add-data "app\legacy\prompts;app\legacy\prompts" `
  --add-data "app\legacy\wechat_collect;app\legacy\wechat_collect" `
  app\main.py
Pop-Location

New-Item -ItemType Directory -Force -Path $DesktopBackendDir | Out-Null
Copy-Item -Force `
  -Path (Join-Path $BackendDir "dist\pc-server-backend.exe") `
  -Destination (Join-Path $DesktopBackendDir "pc-server-backend.exe")

Write-Host "Backend executable copied to $DesktopBackendDir\pc-server-backend.exe"
