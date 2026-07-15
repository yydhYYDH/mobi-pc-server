# Linux 打包说明

本文档说明如何在 Linux 或 WSL 环境中构建你的智伴 Linux 发布包。

## 前置要求

- Node.js 20 或更新版本。
- Python 3.11 或 3.12。
- Git 和 Git LFS。
- `patchelf`，用于将 llama.cpp 的运行时库路径修正为包内相对路径。
- HarmonyOS `hdc`。可通过 DevEco Studio 或 Command Line Tools 获取。

在仓库根目录拉取由 Git LFS 管理的 llama.cpp 二进制文件：

```bash
git lfs pull
```

Ubuntu/Debian 可通过 `sudo apt install patchelf` 安装 RPATH 修正工具。

将 `hdc` 所在目录加入 `PATH`。也可以通过 `HDC_BIN_LINUX` 指定外部 `hdc` 可执行文件的实际路径。

## 准备原生运行时

发布脚本会自动从 `3rdparty` 收集原生运行时，生成 `desktop/resources-linux-<arch>/` staging 目录。请勿手动维护该输出目录。

- llama.cpp：参见 [`3rdparty/llama.cpp/README.md`](../3rdparty/llama.cpp/README.md)。仓库仅提供部分预编译文件；缺失的平台或架构请自行编译，并将同一次构建生成的完整 `bin` 目录放到约定位置。
- MobiInfer：参见 [`3rdparty/mobiinfer/apps/README.md`](../3rdparty/mobiinfer/apps/README.md)。本仓库不提供源码；缺失的平台或架构请自行取得兼容的 `mnncli` 二进制文件。

如需 CUDA 加速，请准备与目标 Linux 架构兼容的 CUDA 版 llama.cpp 运行时；未提供时，应用会使用 CPU 版。

## 构建安装包

从仓库根目录运行。x64 包：

```bash
scripts/release.sh --arch x64
```

arm64 包：

```bash
scripts/release.sh --arch arm64
```

若 `hdc` 未加入 `PATH`：

```bash
HDC_BIN_LINUX=/path/to/hdc scripts/release.sh --arch x64
```

脚本会构建 Linux 后端、执行前端和桌面端的 `npm ci`、构建前端并生成安装包。产物位于：

```text
desktop/release/
```

Linux 后端必须在 Linux 环境构建。WSL 可用于构建 Linux 包，但产物不能用于 Windows 包。发布脚本不支持交叉架构构建，`--arch` 必须与当前主机架构一致。

## 仅重新打包

已生成正确架构的后端可执行文件时，可跳过后端构建：

```bash
scripts/release.sh --arch x64 --skip-backend
```
