# Windows 打包说明

本文档说明如何在 Windows 原生环境里打包 PC MNN Server。不要在 WSL 里生成 Windows 包；WSL 适合生成 Linux 包。

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

## 3. 准备 Windows 版 MNN

Windows 包需要 Windows 版 MNN 二进制。不要使用 WSL 里构建出来的 Linux `mnncli`。

推荐在 Windows 的 “x64 Native Tools Command Prompt for VS 2022” 或配置好 MSVC 环境的 PowerShell 中构建：

```powershell
cd E:\WAIC\pc_server\3rdparty\MNN
mkdir build-windows
cd build-windows

cmake .. -G "Ninja" `
  -DCMAKE_BUILD_TYPE=Release `
  -DMNN_BUILD_SHARED_LIBS=ON `
  -DMNN_BUILD_CONVERTER=OFF `
  -DMNN_BUILD_QUANTOOLS=OFF `
  -DMNN_BUILD_DEMO=ON

cmake --build . --config Release
```

构建完成后，把 Windows 运行时文件复制到：

```text
desktop/resources/mnn/
```

至少需要：

```text
desktop/resources/mnn/
  mnncli.exe
```

如果 MNN 构建生成了 DLL，也一起复制：

```text
desktop/resources/mnn/
  MNN.dll
  *.dll
```

实际文件名和路径取决于 MNN 当前版本的构建输出。可以用下面命令查找：

```powershell
Get-ChildItem E:\WAIC\pc_server\3rdparty\MNN -Recurse -Filter mnncli.exe
Get-ChildItem E:\WAIC\pc_server\3rdparty\MNN -Recurse -Filter MNN.dll
```

## 4. 准备 hdc

把 Windows 版 `hdc.exe` 放到：

```text
desktop/resources/hdc/hdc.exe
```

如果 `hdc.exe` 依赖其他 DLL，也放在同一目录。

## 5. 构建 Windows 安装包

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
