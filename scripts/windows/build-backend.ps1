$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path "$PSScriptRoot\..\.."
$BackendDir = Join-Path $RootDir "backend"
$DesktopBackendDir = Join-Path $RootDir "desktop\resources-win\backend"
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
  --add-data "app\legacy\screen.jpeg;app\legacy" `
  --add-data "app\legacy\prompts;app\legacy\prompts" `
  --add-data "app\legacy\wechat_collect;app\legacy\wechat_collect" `
  app\main.py
Pop-Location

New-Item -ItemType Directory -Force -Path $DesktopBackendDir | Out-Null
Copy-Item -Force `
  -Path (Join-Path $BackendDir "dist\pc-server-backend.exe") `
  -Destination (Join-Path $DesktopBackendDir "pc-server-backend.exe")

Write-Host "Backend executable copied to $DesktopBackendDir\pc-server-backend.exe"
