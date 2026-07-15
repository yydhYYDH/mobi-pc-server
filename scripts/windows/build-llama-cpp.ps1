Param(
  [ValidateSet("cpu", "cuda")][String]$Mode = "cpu",
  [Switch]$Clean,
  [Switch]$SkipCopy,
  [Switch]$SkipSmokeTest,
  [String]$Generator = "Ninja",
  [String]$Architecture = "x64",
  [String]$BuildType = "Release",
  [String]$Target = "llama-server",
  [Int]$Jobs = 8,
  [String]$CudaArch = "89",
  [Switch]$AllowUnsupportedCudaCompiler,
  [String]$VsInstallDir,
  [String]$CudaToolkitRoot,
  [String]$BuildDir,
  [String]$InstallDir
)

$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path "$PSScriptRoot\..\.."
$LlamaCppDir = Join-Path $RootDir "3rdparty\llama.cpp"

switch ($Architecture) {
  "amd64" { $TargetArch = "x64" }
  "x86_64" { $TargetArch = "x64" }
  "x64" { $TargetArch = "x64" }
  "arm64" { $TargetArch = "arm64" }
  "aarch64" { $TargetArch = "arm64" }
  default { $TargetArch = $Architecture }
}
$Architecture = $TargetArch

if (-not $BuildDir) {
  if ($Mode -eq "cuda") {
    $BuildDir = Join-Path $LlamaCppDir "build-cuda-windows-$TargetArch"
  } else {
    $BuildDir = Join-Path $LlamaCppDir "build-windows-$TargetArch"
  }
}

if (-not $InstallDir) {
  if ($Mode -eq "cuda") {
    $InstallDir = Join-Path $RootDir "desktop\resources-win-$TargetArch\llama-cpp\cuda"
  } else {
    $InstallDir = Join-Path $RootDir "desktop\resources-win-$TargetArch\llama-cpp\cpu"
  }
}

function Invoke-Checked {
  Param(
    [Parameter(Mandatory = $true)][String]$FilePath,
    [String]$CurrentBuildDir,
    [Parameter(ValueFromRemainingArguments = $true)][String[]]$Arguments
  )

  Write-Host "> $FilePath $($Arguments -join ' ')"
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    if ($CurrentBuildDir) {
      Write-Host ""
      Write-Host "Build directory: $CurrentBuildDir"
      $CMakeErrorLog = Join-Path $CurrentBuildDir "CMakeFiles\CMakeError.log"
      $CMakeOutputLog = Join-Path $CurrentBuildDir "CMakeFiles\CMakeOutput.log"
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

function Add-PathPrefix {
  Param(
    [Parameter(Mandatory = $true)][String]$Path
  )

  if (-not (Test-Path $Path)) {
    return
  }

  $ExistingParts = @($env:PATH -split ";" | Where-Object { $_ })
  if ($ExistingParts -notcontains $Path) {
    $env:PATH = [string]::Join(";", @($Path) + $ExistingParts)
  }
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

function Configure-CudaToolkit {
  if (-not $CudaToolkitRoot -and $env:CUDA_PATH) {
    $CudaToolkitRoot = $env:CUDA_PATH
  }

  if ($CudaToolkitRoot) {
    if (-not (Test-Path $CudaToolkitRoot)) {
      throw "CUDA Toolkit root not found: $CudaToolkitRoot"
    }

    $Nvcc = Join-Path $CudaToolkitRoot "bin\nvcc.exe"
    if (-not (Test-Path $Nvcc)) {
      throw "nvcc.exe was not found under CUDA Toolkit root: $CudaToolkitRoot"
    }

    [Environment]::SetEnvironmentVariable("CUDA_PATH", $CudaToolkitRoot, "Process")
    Add-PathPrefix -Path (Join-Path $CudaToolkitRoot "bin")
    return $Nvcc
  }

  $NvccCommand = Get-Command nvcc.exe -ErrorAction SilentlyContinue
  if (-not $NvccCommand) {
    throw "CUDA mode requires nvcc on PATH. Install CUDA Toolkit, pass -CudaToolkitRoot, or use -Mode cpu."
  }

  return $NvccCommand.Source
}

if (-not (Test-Path (Join-Path $LlamaCppDir "CMakeLists.txt"))) {
  throw "llama.cpp source directory not found: $LlamaCppDir"
}

if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) {
  throw "cmake was not found on PATH."
}

if ($Generator -eq "Ninja" -and -not (Get-Command ninja -ErrorAction SilentlyContinue)) {
  throw "Ninja was not found on PATH. Install Ninja or run with -Generator 'Visual Studio 17 2022'."
}

if ($Clean) {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $BuildDir
}

New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null

Import-VisualStudioEnvironment

$NvccPath = $null
if ($Mode -eq "cuda") {
  $NvccPath = Configure-CudaToolkit
  Write-Host "CUDA compiler: $NvccPath"
}

$ConfigureArgs = @(
  "-S",
  $LlamaCppDir,
  "-B",
  $BuildDir,
  "-G",
  $Generator,
  "-DCMAKE_BUILD_TYPE=$BuildType",
  "-DBUILD_SHARED_LIBS=OFF",
  "-DLLAMA_BUILD_UI=OFF",
  "-DGGML_NATIVE=ON"
)

if ($Mode -eq "cuda") {
  $ConfigureArgs += "-DGGML_CUDA=ON"
  $ConfigureArgs += "-DCMAKE_CUDA_ARCHITECTURES=$CudaArch"
  $ConfigureArgs += "-DCMAKE_CUDA_COMPILER=$NvccPath"
  if ($CudaToolkitRoot) {
    $ConfigureArgs += "-DCUDAToolkit_ROOT=$CudaToolkitRoot"
  }
  if ($AllowUnsupportedCudaCompiler) {
    $ConfigureArgs += "-DCMAKE_CUDA_FLAGS=-allow-unsupported-compiler"
  }
}

Write-Host "Building llama.cpp target '$Target' in $Mode mode"
Invoke-Checked cmake -CurrentBuildDir $BuildDir @ConfigureArgs
Invoke-Checked cmake -CurrentBuildDir $BuildDir "--build" $BuildDir "--config" $BuildType "--target" $Target "--parallel" $Jobs

$ExpectedName = if ($Target.EndsWith(".exe")) { $Target } else { "$Target.exe" }
$TargetExe = Find-FirstFile -Root $BuildDir -Filter $ExpectedName

if (-not $TargetExe -and $Target -eq "llama-server") {
  $TargetExe = Find-FirstFile -Root $BuildDir -Filter "server.exe"
}

if (-not $TargetExe) {
  throw "$ExpectedName was not found under $BuildDir"
}

if (-not $SkipSmokeTest) {
  Write-Host "Smoke test: $($TargetExe.Name) --help"
  & $TargetExe.FullName --help | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "$($TargetExe.Name) --help failed with exit code $LASTEXITCODE"
  }
}

if (-not $SkipCopy) {
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  Copy-Item -Force -Path $TargetExe.FullName -Destination (Join-Path $InstallDir "llama-server.exe")

  $Dlls = Get-ChildItem -Path $BuildDir -Recurse -Filter "*.dll" -File -ErrorAction SilentlyContinue
  foreach ($Dll in ($Dlls | Sort-Object FullName -Unique)) {
    Copy-Item -Force -Path $Dll.FullName -Destination (Join-Path $InstallDir $Dll.Name)
  }

  Write-Host "llama-server copied to $(Join-Path $InstallDir 'llama-server.exe')"
  if ($Dlls.Count -gt 0) {
    Write-Host "Copied $($Dlls.Count) DLL file(s) to $InstallDir"
  }
}

Write-Host "Build completed: $($TargetExe.FullName)"
