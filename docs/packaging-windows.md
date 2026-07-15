# Windows 打包说明

本文档说明如何在原生 Windows 环境中构建你的智伴 Windows 安装包。

## 前置要求

- Node.js 20 或更新版本。
- Python 3.11 或 3.12。
- Git 和 Git LFS。
- HarmonyOS `hdc.exe`。可通过 DevEco Studio 或 Command Line Tools 获取。

在仓库根目录拉取由 Git LFS 管理的 llama.cpp 二进制文件：

```powershell
git lfs pull
```

将 `hdc.exe` 所在目录加入 `PATH`。也可以在执行发布脚本时通过 `-HdcBin` 指定其实际路径。

## 准备原生运行时

打包脚本会自动从 `3rdparty` 读取原生运行时，并复制到 `desktop/resources-win-<arch>/`。后者是自动生成的 staging 目录，不应手动维护。

- llama.cpp：参见 [`3rdparty/llama.cpp/README.md`](../3rdparty/llama.cpp/README.md)。仓库仅提供部分预编译文件；缺失的平台或架构请自行编译，并将同一次构建生成的完整 `bin` 目录放到约定位置。
- MobiInfer：参见 [`3rdparty/mobiinfer/apps/README.md`](../3rdparty/mobiinfer/apps/README.md)。本仓库不提供源码；缺失的平台或架构请自行取得兼容的 `mnncli` 二进制文件。

## 构建安装包

从仓库根目录运行。x64 包：

```powershell
.\scripts\windows\release.ps1 -Architecture x64
```

arm64 包：

```powershell
.\scripts\windows\release.ps1 -Architecture arm64
```

若 `hdc.exe` 未加入 `PATH`：

```powershell
.\scripts\windows\release.ps1 -Architecture x64 -HdcBin C:\path\to\hdc.exe
```

脚本会构建 Windows 后端、执行前端和桌面端的 `npm ci`、构建前端并生成安装包。产物位于：

```text
desktop/release/
```

Windows 后端必须在原生 Windows 环境构建；WSL 生成的是 Linux ELF 文件，不能用于 Windows 安装包。

## 常见问题

### 后端构建使用错误的 Python

发布脚本默认使用 `backend/.venv-win/Scripts/python.exe`；若它不存在，则使用 `PATH` 中的 `python`。可显式指定：

```powershell
$env:PC_SERVER_PYTHON = ".\backend\.venv-win\Scripts\python.exe"
.\scripts\windows\release.ps1 -Architecture x64
```

### 仅重新打包

已生成正确架构的后端可执行文件时，可跳过后端构建：

```powershell
.\scripts\windows\release.ps1 -Architecture x64 -SkipBackend
```
