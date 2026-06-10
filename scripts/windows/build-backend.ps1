$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path "$PSScriptRoot\..\.."
$BackendDir = Join-Path $RootDir "backend"
$DesktopBackendDir = Join-Path $RootDir "desktop\resources\backend"
$PythonBin = $env:PC_SERVER_PYTHON

if (-not $PythonBin) {
  $PythonBin = Join-Path $BackendDir ".venv\Scripts\python.exe"
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
  app\main.py
Pop-Location

New-Item -ItemType Directory -Force -Path $DesktopBackendDir | Out-Null
Copy-Item -Force `
  -Path (Join-Path $BackendDir "dist\pc-server-backend.exe") `
  -Destination (Join-Path $DesktopBackendDir "pc-server-backend.exe")

Write-Host "Backend executable copied to $DesktopBackendDir\pc-server-backend.exe"
