Param(
  [Switch]$Clean,
  [Switch]$SkipCopy,
  [Switch]$SkipSmokeTest,
  [String]$Generator = "Ninja",
  [String]$Architecture = "x64",
  [String]$BuildType = "Release",
  [String]$InstallDir,
  [String]$OpenSslRoot,
  [String]$CMakeToolchainFile,
  [String]$VsInstallDir,
  [String]$VcpkgRoot,
  [String]$VcpkgTriplet
)

$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path "$PSScriptRoot\..\.."
$MobiInferDir = Join-Path $RootDir "3rdparty\mobiinfer"
$MnnCliDir = Join-Path $MobiInferDir "apps\mnncli"

switch ($Architecture) {
  "amd64" { $TargetArch = "x64" }
  "x86_64" { $TargetArch = "x64" }
  "x64" { $TargetArch = "x64" }
  "arm64" { $TargetArch = "arm64" }
  "aarch64" { $TargetArch = "arm64" }
  default { $TargetArch = $Architecture }
}

$MnnBuildDir = Join-Path $MobiInferDir "build_mnn_static_win_$TargetArch"
$MnnCliBuildDir = Join-Path $MnnCliDir "build_mnncli_win_$TargetArch"
$Architecture = $TargetArch

if (-not $InstallDir) {
  $InstallDir = Join-Path $RootDir "desktop\resources-win-$TargetArch\mobiinfer"
}

if (-not $VcpkgTriplet) {
  if ($TargetArch -eq "arm64") {
    $VcpkgTriplet = "arm64-windows-static"
  } else {
    $VcpkgTriplet = "x64-windows-static"
  }
}

if (-not $OpenSslRoot -and $env:OPENSSL_ROOT_DIR) {
  $OpenSslRoot = $env:OPENSSL_ROOT_DIR
}

if (-not $VcpkgRoot -and $env:VCPKG_ROOT) {
  $VcpkgRoot = $env:VCPKG_ROOT
}

if (-not $CMakeToolchainFile -and $VcpkgRoot) {
  $CMakeToolchainFile = Join-Path $VcpkgRoot "scripts\buildsystems\vcpkg.cmake"
}

function Invoke-Checked {
  Param(
    [Parameter(Mandatory = $true)][String]$FilePath,
    [String]$BuildDir,
    [Parameter(ValueFromRemainingArguments = $true)][String[]]$Arguments
  )

  Write-Host "> $FilePath $($Arguments -join ' ')"
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    if ($BuildDir) {
      Write-Host ""
      Write-Host "Build directory: $BuildDir"
      $CMakeErrorLog = Join-Path $BuildDir "CMakeFiles\CMakeError.log"
      $CMakeOutputLog = Join-Path $BuildDir "CMakeFiles\CMakeOutput.log"
      if (Test-Path $CMakeErrorLog) {
        Write-Host "CMake error log: $CMakeErrorLog"
      }
      if (Test-Path $CMakeOutputLog) {
        Write-Host "CMake output log: $CMakeOutputLog"
      }
      Write-Host ""
    }
    throw "Command failed with exit code $LASTEXITCODE`: $FilePath"
  }
}

function Find-FirstFile {
  Param(
    [Parameter(Mandatory = $true)][String]$Root,
    [Parameter(Mandatory = $true)][String]$Filter
  )

  Get-ChildItem -Path $Root -Recurse -Filter $Filter -File -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

function Find-VisualStudioInstallDir {
  if ($VsInstallDir) {
    return $VsInstallDir
  }

  if ($env:VSINSTALLDIR) {
    return $env:VSINSTALLDIR
  }

  $VsWhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
  if (Test-Path $VsWhere) {
    $Found = & $VsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($LASTEXITCODE -eq 0 -and $Found) {
      return ($Found | Select-Object -First 1)
    }
  }

  return $null
}

function Import-VisualStudioEnvironment {
  if (Get-Command cl.exe -ErrorAction SilentlyContinue) {
    Write-Host "MSVC compiler found: $((Get-Command cl.exe).Source)"
    return
  }

  $InstallDir = Find-VisualStudioInstallDir
  if (-not $InstallDir) {
    throw "cl.exe was not found on PATH and Visual Studio could not be located. Run from a Developer PowerShell, or pass -VsInstallDir."
  }

  $VsDevCmd = Join-Path $InstallDir "Common7\Tools\VsDevCmd.bat"
  if (-not (Test-Path $VsDevCmd)) {
    throw "VsDevCmd.bat was not found: $VsDevCmd"
  }

  Write-Host "Importing MSVC environment: $VsDevCmd"
  $Cmd = "`"$VsDevCmd`" -arch=$Architecture -host_arch=$Architecture >nul && set"
  $EnvLines = & cmd.exe /d /s /c $Cmd
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to import Visual Studio environment from $VsDevCmd"
  }

  foreach ($Line in $EnvLines) {
    if ($Line -match "^([^=]+)=(.*)$") {
      [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], "Process")
    }
  }

  if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) {
    throw "Visual Studio environment was imported, but cl.exe is still not on PATH."
  }

  Write-Host "MSVC compiler found: $((Get-Command cl.exe).Source)"
}

function Clear-CMakeScratch {
  Param(
    [Parameter(Mandatory = $true)][String]$BuildDir
  )

  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue `
    (Join-Path $BuildDir "CMakeFiles\CMakeScratch")
}

if (-not (Test-Path $MobiInferDir)) {
  throw "mobiinfer source directory not found: $MobiInferDir"
}

if (-not (Test-Path $MnnCliDir)) {
  throw "mnncli source directory not found: $MnnCliDir"
}

if ($Clean) {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $MnnBuildDir, $MnnCliBuildDir
}

New-Item -ItemType Directory -Force -Path $MnnBuildDir, $MnnCliBuildDir | Out-Null

Write-Host "CMake generator: $Generator"

$ExtraCMakeArgs = @()
$GeneratorArgs = @("-G", $Generator)
$CompilerArgs = @()
if ($Generator -like "Visual Studio*") {
  $GeneratorArgs += "-A"
  $GeneratorArgs += $Architecture
} elseif (($IsWindows -or $env:OS -eq "Windows_NT") -and $Generator -eq "Ninja") {
  Import-VisualStudioEnvironment
  $CompilerArgs += "-DCMAKE_C_COMPILER=cl"
  $CompilerArgs += "-DCMAKE_CXX_COMPILER=cl"
}

if ($CMakeToolchainFile) {
  if (-not (Test-Path $CMakeToolchainFile)) {
    throw "CMake toolchain file not found: $CMakeToolchainFile"
  }
  $ExtraCMakeArgs += "-DCMAKE_TOOLCHAIN_FILE=$CMakeToolchainFile"
  $ExtraCMakeArgs += "-DVCPKG_TARGET_TRIPLET=$VcpkgTriplet"
}
if ($OpenSslRoot) {
  if (-not (Test-Path $OpenSslRoot)) {
    throw "OpenSSL root directory not found: $OpenSslRoot"
  }
  $ExtraCMakeArgs += "-DOPENSSL_ROOT_DIR=$OpenSslRoot"
  $OpenSslIncludeDir = Join-Path $OpenSslRoot "include"
  if (Test-Path $OpenSslIncludeDir) {
    $IncludeParts = @($OpenSslIncludeDir, $env:INCLUDE) | Where-Object { $_ } | Select-Object -Unique
    $env:INCLUDE = [string]::Join(";", $IncludeParts)
  }
}
$ExtraCMakeArgs += "-DOPENSSL_USE_STATIC_LIBS=TRUE"
if ($IsWindows -or $env:OS -eq "Windows_NT") {
  $ExtraCMakeArgs += "-DOPENSSL_MSVC_STATIC_RT=TRUE"
}

if ($Generator -eq "Ninja" -and -not (Get-Command ninja -ErrorAction SilentlyContinue)) {
  throw "Ninja was not found on PATH. Install Ninja or run with -Generator 'Visual Studio 17 2022'."
}
if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) {
  throw "cmake was not found on PATH."
}

Write-Host "Stage 1/2: Building mobiinfer MNN static library"
Clear-CMakeScratch -BuildDir $MnnBuildDir
$MnnConfigureArgs = @(
  "-S",
  $MobiInferDir,
  "-B",
  $MnnBuildDir,
  "-DCMAKE_BUILD_TYPE=$BuildType",
  "-DMNN_BUILD_SHARED_LIBS=OFF",
  "-DMNN_WIN_RUNTIME_MT=ON",
  "-DMNN_BUILD_CONVERTER=ON",
  "-DMNN_BUILD_LLM=ON",
  "-DMNN_BUILD_LLM_OMNI=ON",
  "-DMNN_LOW_MEMORY=ON",
  "-DMNN_CPU_WEIGHT_DEQUANT_GEMM=ON",
  "-DMNN_SUPPORT_TRANSFORMER_FUSE=ON",
  "-DMNN_AVX512=ON",
  "-DLLM_SUPPORT_VISION=ON",
  "-DMNN_BUILD_OPENCV=ON",
  "-DMNN_IMGCODECS=ON",
  "-DMNN_SEP_BUILD=OFF",
  "-DMNN_USE_OPENCV=ON"
)
$MnnConfigureArgs += $GeneratorArgs
$MnnConfigureArgs += $CompilerArgs
$MnnConfigureArgs += $ExtraCMakeArgs
Invoke-Checked cmake -BuildDir $MnnBuildDir @MnnConfigureArgs

Invoke-Checked cmake -BuildDir $MnnBuildDir "--build" $MnnBuildDir "--config" $BuildType "--target" "MNN"

$MnnLib = Find-FirstFile -Root $MnnBuildDir -Filter "MNN.lib"
if (-not $MnnLib) {
  $MnnLib = Find-FirstFile -Root $MnnBuildDir -Filter "libMNN.a"
}
if (-not $MnnLib) {
  throw "MNN static library was not found under $MnnBuildDir"
}

Write-Host "MNN library: $($MnnLib.FullName)"

Write-Host "Stage 2/2: Building mnncli"
Clear-CMakeScratch -BuildDir $MnnCliBuildDir
$MnnCliConfigureArgs = @(
  "-S",
  $MnnCliDir,
  "-B",
  $MnnCliBuildDir,
  "-DCMAKE_BUILD_TYPE=$BuildType",
  "-DMNN_BUILD_DIR=$MnnBuildDir",
  "-DMNN_SOURCE_DIR=$MobiInferDir",
  "-DCMAKE_CXX_FLAGS=/utf-8"
)
$MnnCliConfigureArgs += $GeneratorArgs
$MnnCliConfigureArgs += $CompilerArgs
$MnnCliConfigureArgs += $ExtraCMakeArgs
Invoke-Checked cmake -BuildDir $MnnCliBuildDir @MnnCliConfigureArgs

Invoke-Checked cmake -BuildDir $MnnCliBuildDir "--build" $MnnCliBuildDir "--config" $BuildType "--target" "mnncli"

$MnnCliExe = Find-FirstFile -Root $MnnCliBuildDir -Filter "mnncli.exe"
if (-not $MnnCliExe) {
  throw "mnncli.exe was not found under $MnnCliBuildDir"
}

if (-not $SkipSmokeTest) {
  Write-Host "Smoke test: mnncli --help"
  & $MnnCliExe.FullName --help | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "mnncli --help failed with exit code $LASTEXITCODE"
  }
}

if (-not $SkipCopy) {
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  Copy-Item -Force -Path $MnnCliExe.FullName -Destination (Join-Path $InstallDir "mnncli.exe")

  $Dlls = @()
  $Dlls += Get-ChildItem -Path $MnnBuildDir -Recurse -Filter "*.dll" -File -ErrorAction SilentlyContinue
  $Dlls += Get-ChildItem -Path $MnnCliBuildDir -Recurse -Filter "*.dll" -File -ErrorAction SilentlyContinue
  foreach ($Dll in ($Dlls | Sort-Object FullName -Unique)) {
    Copy-Item -Force -Path $Dll.FullName -Destination (Join-Path $InstallDir $Dll.Name)
  }

  Write-Host "mnncli copied to $(Join-Path $InstallDir 'mnncli.exe')"
  if ($Dlls.Count -gt 0) {
    Write-Host "Copied $($Dlls.Count) DLL file(s) to $InstallDir"
  }
}

Write-Host "Build completed: $($MnnCliExe.FullName)"
