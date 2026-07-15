# macOS 打包说明

本文档说明如何构建你的智伴 macOS 发布包。当前分别生成 Intel (`x64`) 和 Apple Silicon (`arm64`) 安装包，不生成 universal 包。

## 前置要求

- Node.js 20 或更新版本。
- Python 3.11 或 3.12。
- Git 和 Git LFS。
- HarmonyOS `hdc`。可通过 DevEco Studio 或 Command Line Tools 获取。

在仓库根目录拉取由 Git LFS 管理的 llama.cpp 二进制文件：

```bash
git lfs pull
```

将 `hdc` 所在目录加入 `PATH`。也可以通过 `HDC_BIN_DARWIN` 指定其实际路径。

## 准备原生运行时

发布脚本会自动从 `3rdparty` 收集原生运行时，生成 `desktop/resources-mac-<arch>/` staging 目录。请勿手动维护该输出目录。

- llama.cpp：参见 [`3rdparty/llama.cpp/README.md`](../3rdparty/llama.cpp/README.md)。仓库仅提供部分预编译文件；缺失的平台或架构请自行编译，并将同一次构建生成的完整 `bin` 目录放到约定位置。
- MobiInfer：参见 [`3rdparty/mobiinfer/apps/README.md`](../3rdparty/mobiinfer/apps/README.md)。本仓库不提供源码；缺失的平台或架构请自行取得兼容的 `mnncli` 二进制文件。

macOS 不使用 CUDA。Metal 或 CPU 版 llama.cpp 运行时均由打包脚本放入 `llama-cpp/cpu/`。

## 构建安装包

从仓库根目录运行。Apple Silicon：

```bash
scripts/release.sh --arch arm64
```

Intel：

```bash
scripts/release.sh --arch x64
```

若 `hdc` 未加入 `PATH`：

```bash
HDC_BIN_DARWIN=/path/to/hdc scripts/release.sh --arch arm64
```

脚本会构建后端、执行前端和桌面端的 `npm ci`、构建前端并生成安装包。产物位于：

```text
desktop/release/
```

后端和原生运行时必须与目标架构一致。Apple Silicon 上构建 Intel 包时，应使用 Intel Mac 或 Rosetta x64 Python/工具链；仅传入 `--arch x64` 不会将当前 arm64 Python 生成的后端转换为 x64。

## 发布说明

当前本地打包跳过 macOS 代码签名。未签名或未公证的应用可能被 Gatekeeper 阻止打开；对外发布需要配置 Apple Developer ID、Hardened Runtime、entitlements 和 notarization。

## 仅重新打包

已生成正确架构的后端可执行文件时，可跳过后端构建：

```bash
scripts/release.sh --arch arm64 --skip-backend
```
