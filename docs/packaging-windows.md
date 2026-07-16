# Windows 打包说明

本文档说明如何在原生 Windows 环境中从源码构建 Windows 安装包。`backend`、`mobiinfer`、`llama.cpp` 都需要在 Windows 上源码构建，不能直接复用 Linux、WSL 或 macOS 的二进制文件。

## 前置要求

- Node.js 20 或更新版本。
- Python 3.11 或 3.12。
- Git。
- Visual Studio 2022 Build Tools，包含 MSVC C++ 生成工具；Windows 原生构建推荐使用 MSVC。
- CMake 和 Ninja。
- 完整版 Win64 OpenSSL，用于构建 MobiInfer `mnncli`。
- HarmonyOS `hdc.exe`，可通过 DevEco Studio 或 Command Line Tools 获取。
- CUDA Toolkit，仅在构建 CUDA 版 llama.cpp 时需要。

建议在 PowerShell 中检查：

```powershell
node --version
python --version
git --version
cmake --version
ninja --version
```

MobiInfer 的构建需要 OpenSSL。推荐安装完整 Win64 OpenSSL，并通过 `-OpenSslRoot` 传入安装目录，例如 `C:\Program Files\OpenSSL-Win64`。

## 初始化源码子模块

在仓库根目录执行：

```powershell
git submodule update --init --depth 1 3rdparty/mobiinfer 3rdparty/llama.cpp
```

## 资源目录

Windows x64 的桌面端资源会进入：

```text
desktop/resources-win-x64/
  backend/                  pc-server-backend.exe
  mobiinfer/                mnncli.exe 和相关 DLL
  llama-cpp/cpu/            llama-server.exe；如上游构建产生 DLL，也会放在这里
  llama-cpp/cuda/           CUDA 版 llama-server.exe；如上游构建产生 DLL，也会放在这里，可选
  hdc/                      hdc.exe 和相关 DLL
  frontend/                 frontend/dist
```

arm64 使用 `desktop/resources-win-arm64/`。这些目录是打包阶段产物，可以删除后重新生成，不建议手动长期维护。

## 一键打包

把 `hdc.exe` 所在目录加入 `PATH`，或通过 `-HdcBin` 指定实际路径。

x64 CPU 包：

```powershell
.\scripts\windows\release.ps1 `
  -Architecture x64 `
  -OpenSslRoot "C:\Program Files\OpenSSL-Win64"
```

x64 CPU + CUDA 包：

```powershell
.\scripts\windows\release.ps1 `
  -Architecture x64 `
  -Cuda `
  -CudaArch 89 `
  -OpenSslRoot "C:\Program Files\OpenSSL-Win64"
```

arm64 包：

```powershell
.\scripts\windows\release.ps1 `
  -Architecture arm64 `
  -OpenSslRoot "C:\Program Files\OpenSSL-Win64"
```

如果 `hdc.exe` 不在 `PATH`：

```powershell
.\scripts\windows\release.ps1 `
  -Architecture x64 `
  -OpenSslRoot "C:\Program Files\OpenSSL-Win64" `
  -HdcBin C:\path\to\hdc.exe
```

脚本会执行依赖安装、构建后端、构建 MobiInfer、构建 llama.cpp、构建前端并生成 Electron 安装包。产物位于：

```text
desktop/release/
```

## 分阶段手动打包

如果不使用一键脚本，可以按下面的顺序手动执行。这里以 Windows x64 为例，arm64 时把 `x64` 替换为 `arm64`。

先设置目标平台、架构和 `hdc.exe`：

```powershell
$env:PC_SERVER_DESKTOP_TARGET_PLATFORM = "win32"
$env:PC_SERVER_DESKTOP_TARGET_ARCH = "x64"
$env:HDC_BIN_WIN = "C:\path\to\hdc.exe"
```

安装前端和桌面端依赖：

```powershell
npm --prefix frontend ci
npm --prefix desktop ci
```

先构建 MobiInfer：

```powershell
.\scripts\windows\build-mobiinfer.ps1 `
  -Architecture x64 `
  -OpenSslRoot "C:\Program Files\OpenSSL-Win64"
```

再构建 llama.cpp CPU 运行时：

```powershell
.\scripts\windows\build-llama-cpp.ps1 `
  -Mode cpu `
  -Architecture x64
```

当前脚本会传入 `-DBUILD_SHARED_LIBS=OFF`，因此正常情况下只需要 `llama-server.exe` 本体；如果上游或某个后端仍生成运行所需 DLL，脚本会跟随构建目录一起复制。

需要 CUDA 包时，再构建 CUDA 运行时：

```powershell
.\scripts\windows\build-llama-cpp.ps1 `
  -Mode cuda `
  -Architecture x64 `
  -CudaArch 89
```

然后构建后端：

```powershell
.\scripts\windows\build-backend.ps1
```

最后构建前端并调用桌面端 npm 打包：

```powershell
npm --prefix frontend run build
npm --prefix desktop run build-win-x64
```

arm64 对应命令为：

```powershell
npm --prefix desktop run build-win-arm
```

手动流程完成后，安装包和 unpacked 目录同样位于：

```text
desktop/release/
```

阶段产物通常在这些位置：

```text
3rdparty/mobiinfer/apps/mnncli/build_mnncli_win_x64/
3rdparty/llama.cpp/build-windows-x64/
3rdparty/llama.cpp/build-cuda-windows-x64/
backend/dist/pc-server-backend.exe
desktop/resources-win-x64/
```

## 仅重新打包

已有同一平台和架构的构建产物时，可以跳过原生构建：

```powershell
.\scripts\windows\release.ps1 `
  -Architecture x64 `
  -OpenSslRoot "C:\Program Files\OpenSSL-Win64" `
  -SkipBackend `
  -SkipMobiInfer `
  -SkipLlamaCpp
```

手动流程中也可以只重新执行：

```powershell
npm --prefix frontend run build
.\scripts\windows\build-final-target.ps1 -Architecture x64
```

注意：Windows 后端和原生运行时必须在原生 Windows 环境构建。WSL 生成的是 Linux 二进制，不能用于 Windows 安装包。CUDA 打包仅支持 Windows x64。
