# Windows 打包说明

本文档说明如何在 Windows 原生环境里打包你的智伴。

## 产物结构

Windows 包需要这些运行时资源。资源目录按架构隔离，例如 x64 使用：

```text
desktop/resources-win-x64/
  frontend/                 由 frontend/dist 自动复制
  backend/
    pc-server-backend.exe   Windows 后端可执行文件
  mobiinfer/
    mnncli.exe              Windows 版 MobiInfer 命令行/服务程序
    MNN.dll                 预编译 MobiInfer 运行时依赖
    *.dll                   其他 MobiInfer 运行所需 DLL
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

arm64 使用同样结构的 `desktop/resources-win-arm64/`。Electron Builder 会把选中的 `desktop/resources-win-<arch>/` 下的内容复制到最终安装包的 `resources/` 目录。Linux 打包使用独立的 `desktop/resources-linux-<arch>/`，不要再把不同平台或架构的运行时文件混放到同一个 staging 目录。

运行期下载的模型、用户配置、日志和 ModelScope 缓存不会写入安装目录。打包版会使用 `%APPDATA%\ClawMate`，覆盖安装或更新应用时应保留这些数据。详见 [desktop-data.md](desktop-data.md)。

## 前置要求

建议安装：

- Node.js 20 或更新版本。
- Python 3.11 或 3.12。
- Git。

检查命令：

```powershell
node --version
npm --version
python --version
git --version
```

如果安装了 Python Launcher，也可以检查：

```powershell
py --version
py -0p
```

## 1. 安装前端和 Electron 依赖

先切到仓库根目录，然后执行：

```powershell
cd .\frontend
npm install

cd ..\desktop
npm install
```

`npm run dev` 和 `npm run build-win` 都依赖 `desktop/node_modules/.bin/` 里的本地命令，例如 `tsc`、`electron` 和 `electron-builder`。如果跳过 `cd .\desktop; npm install`，会出现类似下面的错误：

```text
'tsc' 不是内部或外部命令，也不是可运行的程序
```

这种情况不是 TypeScript 源码错误，而是 Electron 包的依赖没有安装好。重新在 `desktop` 目录执行：

```powershell
cd .\desktop
npm install
```

## 2. 生成 Windows 后端 exe

后端 exe 必须在 Windows 原生环境生成。WSL 里生成的是 Linux ELF，不能放进 Windows 安装包。

推荐使用独立虚拟环境 `.venv-win`，避免和 WSL/Linux 的 `backend/.venv` 混用：

```powershell
cd .\backend
python -m venv .venv-win
.\.venv-win\Scripts\Activate.ps1

python -m pip install -U pip
pip install -e .
pip install pyinstaller
```


如果 PowerShell 禁止执行激活脚本，执行一次：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

然后回到项目根目录运行：

```powershell
.\scripts\windows\build-backend.ps1
```

成功后应该出现：

```text
backend/dist/pc-server-backend.exe
desktop/resources-win-x64/backend/pc-server-backend.exe
```

如果你没有使用 `.venv-win`，可以显式指定 Python：

```powershell
$env:PC_SERVER_PYTHON=".\backend\.venv-win\Scripts\python.exe"
.\scripts\windows\build-backend.ps1
```

## 3. 准备 Windows 版 MobiInfer

不在本仓库构建 MobiInfer。取得与目标 Windows 架构匹配的预编译运行时后，将 `mnncli.exe` 及其全部 DLL 依赖直接复制到：

```text
desktop/resources-win-x64/mobiinfer/
```

至少需要：

```text
desktop/resources-win-x64/mobiinfer/
  mnncli.exe
```

例如，x64 包的复制结果应为：

```text
desktop/resources-win-x64/mobiinfer/
  MNN.dll
  *.dll
```

## 4. 准备 Windows 版 llama.cpp

不在本仓库构建 `llama.cpp`。取得与目标 Windows 架构匹配的预编译运行时后，完整复制 CPU 和可选 CUDA 目录；不要只复制 `llama-server.exe`，同目录 DLL 也必须保留。

```text
desktop/resources-win-x64/llama-cpp/
  cpu/
    llama-server.exe
    *.dll
  cuda/                    可选；提供 CUDA 加速时复制
    llama-server.exe
    *.dll
```

运行时优先探测 CUDA 版，无法使用时回退至 CPU 版。不要把 Linux 或 macOS 的运行时文件放入 Windows 资源目录。

## 5. 准备 hdc

把 Windows 版 `hdc.exe` 放到：

```text
desktop/resources-win-x64/hdc/hdc.exe
```

当前验证过的 DevEco Studio SDK 版本是 `hdc 3.2.0c`

这个版本除了 `hdc.exe`，还需要同目录的 `libusb_shared.dll`：

```text
desktop/resources-win-x64/hdc/hdc.exe
desktop/resources-win-x64/hdc/libusb_shared.dll
```

如果后续升级 SDK，重新检查 `toolchains` 目录里是否还有新的 DLL 依赖，并把依赖文件一起放到对应架构的 `desktop/resources-win-<arch>/hdc/`。

## 6. 构建 Windows 安装包

从仓库根目录执行：

```powershell
cd .\desktop
npm run build-win
```

兼容旧命令仍可使用：`npm run dist:win`。

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

放好后从仓库根目录重新运行：

```powershell
cd .\desktop
npm run build-win
```
