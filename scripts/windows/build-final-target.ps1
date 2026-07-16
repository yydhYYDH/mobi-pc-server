Param(
  [String]$Architecture,
  [Switch]$Help
)

$ErrorActionPreference = "Stop"

function Show-Usage {
  Write-Host @"
Usage: .\scripts\windows\build-final-target.ps1 [options]

Run only the final desktop npm packaging target for Windows. This script assumes
native runtime files, backend executable, frontend assets, and npm dependencies
have already been prepared.

Options:
  -Architecture <x64|arm64>  Target architecture. Defaults to
                             PC_SERVER_DESKTOP_TARGET_ARCH or host architecture.
  -Help                      Show this help text.

Examples:
  .\scripts\windows\build-final-target.ps1 -Architecture x64
  .\scripts\windows\build-final-target.ps1 -Architecture arm64
"@
}

if ($Help) {
  Show-Usage
  exit 0
}

if ($env:OS -ne "Windows_NT") {
  throw "Windows final packaging must run in native Windows PowerShell or PowerShell on Windows."
}

$RootDir = Resolve-Path "$PSScriptRoot\..\.."
$DesktopDir = Join-Path $RootDir "desktop"

if (-not $Architecture) {
  $Architecture = $env:PC_SERVER_DESKTOP_TARGET_ARCH
}
if (-not $Architecture) {
  $Architecture = $env:PROCESSOR_ARCHITECTURE
}
if (-not $Architecture) {
  throw "Unable to detect host architecture; pass -Architecture x64 or -Architecture arm64."
}

switch ($Architecture.ToLowerInvariant()) {
  "amd64" { $TargetArch = "x64" }
  "x86_64" { $TargetArch = "x64" }
  "x64" { $TargetArch = "x64" }
  "arm64" { $TargetArch = "arm64" }
  "aarch64" { $TargetArch = "arm64" }
  default { throw "Unsupported architecture '$Architecture'; use x64 or arm64." }
}

if (-not (Test-Path (Join-Path $DesktopDir "package.json"))) {
  throw "Missing desktop package manifest: $(Join-Path $DesktopDir 'package.json')"
}

$env:PC_SERVER_DESKTOP_TARGET_PLATFORM = "win32"
$env:PC_SERVER_DESKTOP_TARGET_ARCH = $TargetArch

$DesktopBuildScript = if ($TargetArch -eq "arm64") { "build-win-arm" } else { "build-win-x64" }

Write-Host "+ npm --prefix `"$DesktopDir`" run `"$DesktopBuildScript`""
npm --prefix $DesktopDir run $DesktopBuildScript
if ($LASTEXITCODE -ne 0) {
  throw "Final Windows desktop packaging failed with exit code $LASTEXITCODE"
}

Write-Host "Release artifacts are available under $(Join-Path $DesktopDir 'release')."
