# Windows 打包说明

本文档说明如何在 Windows 原生环境里打包数据归家。不要在 WSL 里生成 Windows 包；WSL 适合生成 Linux 包。

## 产物结构

Windows 包需要这些运行时资源：

```text
desktop/resources/
  frontend/                 由 frontend/dist 自动复制
  backend/
    pc-server-backend.exe   Windows 后端可执行文件
  mnn/
    mnncli.exe              Windows 版 MNN 命令行/服务程序
    MNN.dll                 如 MNN 构建产生 DLL，也放这里
    *.dll                   其他 MNN 运行所需 DLL
  llama-cpp/
    cpu/
      llama-server.exe      Windows CPU 版 llama.cpp OpenAI 兼容服务
      *.dll                 CPU 运行所需 DLL
    cuda/
      llama-server.exe      Windows CUDA 版 llama.cpp OpenAI 兼容服务
      *.dll                 CUDA 运行所需 DLL
  hdc/
    hdc.exe                 Windows 版 hdc
```

Electron Builder 会把 `desktop/resources/` 下的内容复制到最终安装包的 `resources/` 目录。

## 前置要求

建议安装：

- Node.js 20 或更新版本。
- Python 3.11 或 3.12。
- Visual Studio 2022 Build Tools。
- CMake。
- Ninja，可选但推荐。
- Win64 OpenSSL 完整安装包，用于构建 `mnncli` 的 HTTPS 下载能力。
- CUDA Toolkit，仅打包 CUDA 版 `llama.cpp` 时需要。
- Git。

检查命令：

```powershell
node --version
npm --version
python --version
cmake --version
git --version
```

如果安装了 Python Launcher，也可以检查：

```powershell
py --version
py -0p
```

### OpenSSL

`mnncli` 的 CMake 工程会执行 `find_package(OpenSSL REQUIRED)`。Windows 上推荐安装完整 Win64 OpenSSL，不要安装 Light 版。

推荐安装项：

```text
Win64 OpenSSL v4.x.x
```

不要选择：

```text
Win64 OpenSSL v4.x.x Light
Win32 OpenSSL v4.x.x
```

默认安装路径通常是：

```text
C:\Program Files\OpenSSL-Win64
```

安装后检查头文件和库文件：

```powershell
Test-Path "C:\Program Files\OpenSSL-Win64\include\openssl\ssl.h"
Get-ChildItem "C:\Program Files\OpenSSL-Win64\lib" -Recurse -Filter "*crypto*.lib"
Get-ChildItem "C:\Program Files\OpenSSL-Win64\lib" -Recurse -Filter "*ssl*.lib"
```

## 1. 安装前端和 Electron 依赖

在项目根目录执行：

```powershell
cd E:\WAIC\pc_server

cd frontend
npm install

cd ..\desktop
npm install
```

## 2. 生成 Windows 后端 exe

后端 exe 必须在 Windows 原生环境生成。WSL 里生成的是 Linux ELF，不能放进 Windows 安装包。

推荐使用独立虚拟环境 `.venv-win`，避免和 WSL/Linux 的 `backend/.venv` 混用：

```powershell
cd E:\WAIC\pc_server\backend
python -m venv .venv-win
.\.venv-win\Scripts\Activate.ps1

python -m pip install -U pip
pip install -e .
pip install pyinstaller
```

如果 `python` 没有指向想使用的解释器，可以改用 Windows Python 的完整路径：

```powershell
C:\Python311\python.exe -m venv .venv-win
.\.venv-win\Scripts\Activate.ps1
```

如果 PowerShell 禁止执行激活脚本，执行一次：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

然后回到项目根目录运行：

```powershell
cd E:\WAIC\pc_server
.\scripts\windows\build-backend.ps1
```

成功后应该出现：

```text
backend/dist/pc-server-backend.exe
desktop/resources/backend/pc-server-backend.exe
```

如果你没有使用 `.venv-win`，可以显式指定 Python：

```powershell
$env:PC_SERVER_PYTHON="E:\WAIC\pc_server\backend\.venv-win\Scripts\python.exe"
.\scripts\windows\build-backend.ps1
```

## 3. 准备 Windows 版 mobiinfer / mnncli

Windows 包需要 Windows 版 `mnncli.exe`。不要使用 WSL 里构建出来的 Linux `mnncli`。

推荐在 Windows 的 “x64 Native Tools Command Prompt for VS 2022” 或配置好 MSVC 环境的 PowerShell 中构建：

```powershell
cd E:\WAIC\pc_server
.\scripts\windows\build-mobiinfer.ps1 -OpenSslRoot "C:\Program Files\OpenSSL-Win64"
```

脚本会构建：

- `3rdparty/mobiinfer/build_mnn_static_win/`
- `3rdparty/mobiinfer/apps/mnncli/build_mnncli_win/`

并把产物复制到：

```text
desktop/resources/mobiinfer/
```

至少需要：

```text
desktop/resources/mobiinfer/
  mnncli.exe
```

如果构建生成了 DLL，脚本也会一起复制：

```text
desktop/resources/mobiinfer/
  MNN.dll
  *.dll
```

常用参数：

```powershell
.\scripts\windows\build-mobiinfer.ps1 -Clean
.\scripts\windows\build-mobiinfer.ps1 -SkipSmokeTest
.\scripts\windows\build-mobiinfer.ps1 -OpenSslRoot "C:\Program Files\OpenSSL-Win64"
.\scripts\windows\build-mobiinfer.ps1 -InstallDir E:\WAIC\pc_server\desktop\resources\mobiinfer
```

如果脚本失败，通常是缺少 MSVC、CMake、Ninja 或 OpenSSL。可以先检查：

```powershell
where cmake
where ninja
where cl
where openssl
```

## 4. 准备 Windows 版 llama.cpp

如果需要在安装包里内置 `llama.cpp` 后端，建议同时构建 CPU 和 CUDA 两套 runtime。后端启动时会优先探测 CUDA 版；如果 CUDA 运行时不可用，会自动回退到 CPU 版，并使用 `--n-gpu-layers 0`。

构建 CPU 版：

```powershell
cd E:\WAIC\pc_server
.\scripts\windows\build-llama-cpp.ps1 -Mode cpu
```

脚本会构建：

```text
3rdparty/llama.cpp/build-windows/
```

并把产物复制到：

```text
desktop/resources/llama-cpp/cpu/llama-server.exe
```

构建 CUDA 版时，先确保 CUDA Toolkit 的 `nvcc` 在 PATH 里，或显式传入 CUDA Toolkit 路径，然后运行：

```powershell
cd E:\WAIC\pc_server
.\scripts\windows\build-llama-cpp.ps1 -Mode cuda -CudaArch 89
```

如果使用 CUDA 11.x 搭配 Visual Studio 2026，`nvcc` 可能报 `unsupported Microsoft Visual Studio version`。更稳的方案是使用 VS2022 工具链或升级到支持当前 MSVC 的 CUDA Toolkit；临时绕过可以加：

```powershell
.\scripts\windows\build-llama-cpp.ps1 -Mode cuda -CudaArch 89 -AllowUnsupportedCudaCompiler
```

常用参数：

```powershell
.\scripts\windows\build-llama-cpp.ps1 -Clean
.\scripts\windows\build-llama-cpp.ps1 -Mode cpu
.\scripts\windows\build-llama-cpp.ps1 -Mode cuda -CudaArch 89
.\scripts\windows\build-llama-cpp.ps1 -Mode cuda -CudaArch 89 -AllowUnsupportedCudaCompiler
.\scripts\windows\build-llama-cpp.ps1 -SkipSmokeTest
.\scripts\windows\build-llama-cpp.ps1 -Mode cpu -InstallDir E:\WAIC\pc_server\desktop\resources\llama-cpp\cpu
.\scripts\windows\build-llama-cpp.ps1 -Mode cuda -InstallDir E:\WAIC\pc_server\desktop\resources\llama-cpp\cuda
```

检查命令：

```powershell
where cmake
where ninja
where cl
where nvcc
```

`where nvcc` 只在 CUDA 模式下需要。

## 5. 准备 hdc

把 Windows 版 `hdc.exe` 放到：

```text
desktop/resources/hdc/hdc.exe
```

当前验证过的 DevEco Studio SDK 版本是 `hdc 3.2.0c`，来源目录为：

```text
E:\Software\DevEco Studio\sdk\default\openharmony\toolchains
```

这个版本除了 `hdc.exe`，还需要同目录的 `libusb_shared.dll`：

```text
desktop/resources/hdc/hdc.exe
desktop/resources/hdc/libusb_shared.dll
```

如果后续升级 SDK，重新检查 `toolchains` 目录里是否还有新的 DLL 依赖，并把依赖文件一起放到 `desktop/resources/hdc/`。

## 6. 构建 Windows 安装包

执行：

```powershell
cd E:\WAIC\pc_server\desktop
npm run dist:win
```

产物在：

```text
desktop/release/
```

默认目标是 NSIS 安装包。

### Electron Builder 下载失败时使用离线缓存

`electron-builder` 会在打包时下载 Electron 运行时。当前桌面端使用的是 `electron@31.7.0`，实际解析到的 Windows x64 运行时包为：

```text
electron-v31.7.7-win32-x64.zip
```

如果 GitHub 下载超时，可以手动下载后放入 Electron 本机缓存：

```text
C:\Users\32022\AppData\Local\electron\Cache\electron-v31.7.7-win32-x64.zip
```

也就是：

```powershell
$env:LOCALAPPDATA\electron\Cache\electron-v31.7.7-win32-x64.zip
```

下载链接：

```text
https://github.com/electron/electron/releases/download/v31.7.7/electron-v31.7.7-win32-x64.zip
```

备用镜像：

```text
https://npmmirror.com/mirrors/electron/v31.7.7/electron-v31.7.7-win32-x64.zip
```

生成 NSIS 安装包时，`electron-builder` 还可能下载 NSIS 工具包：

```text
nsis-3.0.4.1.7z
```

如果 GitHub 下载超时，可以手动下载后放入 Electron Builder 缓存：

```text
C:\Users\32022\AppData\Local\electron-builder\Cache\nsis\nsis-3.0.4.1.7z
```

也就是：

```powershell
$env:LOCALAPPDATA\electron-builder\Cache\nsis\nsis-3.0.4.1.7z
```

下载链接：

```text
https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z
```

备用镜像：

```text
https://npmmirror.com/mirrors/electron-builder-binaries/nsis-3.0.4.1/nsis-3.0.4.1.7z
```

放好后重新运行：

```powershell
cd E:\WAIC\pc_server\desktop
npm run dist:win
```

## 常见问题

### `py -3.11` 不可用

先检查：

```powershell
python --version
where python
```

如果 `python` 是 3.11 或 3.12，直接用：

```powershell
python -m venv .venv-win
```

### PowerShell 不能激活虚拟环境

执行：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

然后重新运行：

```powershell
.\.venv-win\Scripts\Activate.ps1
```

### `pc-server-backend.exe` 在哪里

运行：

```powershell
.\scripts\windows\build-backend.ps1
```

它会从：

```text
backend/dist/pc-server-backend.exe
```

复制到：

```text
desktop/resources/backend/pc-server-backend.exe
```

### WSL 构建的 MNN 能不能放进 Windows 包

不能。WSL 里构建的是 Linux 二进制，Windows Electron 包需要 `.exe` 和 Windows DLL。Windows 包里的 MNN 应该在 Windows 原生环境用 MSVC/CMake 构建。

### CUDA Runtime 要不要放进包

第一版不建议内置完整 CUDA Toolkit。优先检测用户系统是否已安装 NVIDIA Driver/CUDA runtime。后续如果要做 CUDA 可选组件，只打包运行所需 DLL，不打包完整 Toolkit。
