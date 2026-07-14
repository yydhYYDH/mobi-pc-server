Param(
  [ValidateSet("x64", "arm64")][String]$Architecture = "x64",
  [Switch]$Cuda,
  [Int]$CudaArch = 89,
  [String]$OpenSslRoot,
  [String]$HdcBin,
  [Switch]$SkipBackend,
  [Switch]$SkipMobiInfer,
  [Switch]$SkipLlamaCpp
)

$ErrorActionPreference = "Stop"

function Invoke-Checked {
  Param(
    [Parameter(Mandatory = $true)][String]$Label,
    [Parameter(Mandatory = $true)][ScriptBlock]$Command
  )

  Write-Host "==> $Label"
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

function Require-Path {
  Param(
    [Parameter(Mandatory = $true)][String]$Path,
    [Parameter(Mandatory = $true)][String]$Description
  )

  if (-not (Test-Path $Path)) {
    throw "Missing ${Description}: $Path"
  }
}

if ($env:OS -ne "Windows_NT") {
  throw "Windows releases must be built in native Windows PowerShell or PowerShell on Windows."
}

$RootDir = Resolve-Path "$PSScriptRoot\..\.."
$FrontendDir = Join-Path $RootDir "frontend"
$DesktopDir = Join-Path $RootDir "desktop"
if (-not $HdcBin) {
  $HdcBin = $env:HDC_BIN_WIN
}
if (-not $HdcBin) {
  $HdcBin = $env:HDC_BIN
}

if (-not $HdcBin) {
  $HdcCommand = Get-Command hdc.exe -ErrorAction SilentlyContinue
  if (-not $HdcCommand) {
    $HdcCommand = Get-Command hdc -ErrorAction SilentlyContinue
  }
  if ($HdcCommand) {
    $HdcBin = $HdcCommand.Source
  }
}

if (-not $HdcBin -or -not (Test-Path $HdcBin)) {
  throw "hdc.exe was not found. Install DevEco Studio or Command Line Tools, then add hdc.exe to PATH or pass -HdcBin C:\path\to\hdc.exe."
}
if ($Cuda -and $Architecture -ne "x64") {
  throw "CUDA packaging is supported only for Windows x64."
}

Require-Path (Join-Path $RootDir "3rdparty\mobiinfer\CMakeLists.txt") "MobiInfer source"
Require-Path (Join-Path $RootDir "3rdparty\llama.cpp\CMakeLists.txt") "llama.cpp source"
Require-Path (Join-Path $FrontendDir "package.json") "frontend package manifest"
Require-Path (Join-Path $DesktopDir "package.json") "desktop package manifest"

$env:PC_SERVER_DESKTOP_TARGET_ARCH = $Architecture
$env:PC_SERVER_DESKTOP_TARGET_PLATFORM = "win32"
$env:HDC_BIN_WIN = (Resolve-Path $HdcBin).Path

if (-not $SkipBackend) {
  Invoke-Checked "Build backend" { & (Join-Path $RootDir "scripts\windows\build-backend.ps1") }
}

if (-not $SkipMobiInfer) {
  $MobiInferArgs = @{ Architecture = $Architecture }
  if ($OpenSslRoot) {
    $MobiInferArgs.OpenSslRoot = $OpenSslRoot
  }
  Invoke-Checked "Build MobiInfer" { & (Join-Path $RootDir "scripts\windows\build-mobiinfer.ps1") @MobiInferArgs }
}

if (-not $SkipLlamaCpp) {
  Invoke-Checked "Build llama.cpp CPU runtime" {
    & (Join-Path $RootDir "scripts\windows\build-llama-cpp.ps1") -Mode cpu -Architecture $Architecture
  }
  if ($Cuda) {
    Invoke-Checked "Build llama.cpp CUDA runtime" {
      & (Join-Path $RootDir "scripts\windows\build-llama-cpp.ps1") -Mode cuda -Architecture $Architecture -CudaArch $CudaArch
    }
  }
}

Invoke-Checked "Build frontend" { Push-Location $FrontendDir; try { npm run build } finally { Pop-Location } }
$DesktopBuildScript = if ($Architecture -eq "arm64") { "build-win-arm" } else { "build-win-x64" }
Invoke-Checked "Package Windows $Architecture release" {
  Push-Location $DesktopDir
  try {
    npm run $DesktopBuildScript
  } finally {
    Pop-Location
  }
}

Write-Host "Release artifacts are available under $(Join-Path $DesktopDir 'release')."
