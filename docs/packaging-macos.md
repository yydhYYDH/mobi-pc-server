# macOS 打包说明

本文档说明如何生成数据归家的 macOS 发布包。首版支持两个独立架构包：

- Intel Mac：`x64`
- Apple Silicon：`arm64`

当前不生成 universal 包。后端、MobiInfer、llama.cpp、hdc 都是原生二进制，分别出包更容易验证，也能避免混入错误架构的运行时文件。

## 产物结构

macOS 包使用独立资源目录：

```text
desktop/resources-mac-arm64/
desktop/resources-mac-x64/
```

每个目录的结构是：

```text
desktop/resources-mac-<arch>/
  frontend/                 由 frontend/dist 自动复制
  configs/                  由 configs/ 自动复制
  example-images/           示例图片资源
  backend/
    pc-server-backend       macOS 后端可执行文件
  mobiinfer/
    mnncli                  macOS 版 MobiInfer 命令行/服务程序
  llama-cpp/
    cpu/
      llama-server          macOS 版 llama.cpp OpenAI 兼容服务
  hdc/
    hdc                     macOS 版 hdc
```

Electron Builder 会把选中的 `desktop/resources-mac-<arch>/` 复制到最终 `.app` 的 `Contents/Resources/` 目录。

运行期下载的模型、用户配置、日志和 ModelScope 缓存不会写入 `.app`。打包版会使用 `~/Library/Application Support/DataHome`，覆盖安装或更新应用时应保留这些数据。详见 [desktop-data.md](desktop-data.md)。

## 前置要求

建议安装：

- Node.js 20 或更新版本。
- Python 3.11 或 3.12。发布包不建议使用过新的 Python 预览版本。
- Xcode Command Line Tools。
- CMake。
- Ninja，可选但推荐。
- Git。

检查命令：

```bash
node --version
npm --version
python3 --version
xcode-select -p
cmake --version
git --version
```

如果缺少 Xcode Command Line Tools：

```bash
xcode-select --install
```

如果缺少 CMake，可用 Homebrew 安装：

```bash
brew install cmake ninja
```

## 1. 安装前端和 Electron 依赖

在项目根目录执行：

```bash
cd /path/to/mobi-pc-server

cd frontend
npm ci

cd ../desktop
npm ci
```

## 2. 生成 macOS 后端可执行文件

后端使用 PyInstaller 生成 `pc-server-backend`。建议为发布包准备独立虚拟环境：

```bash
cd /path/to/mobi-pc-server/backend
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
pip install -e .
pip install pyinstaller
```

生成 Apple Silicon 后端：

```bash
cd /path/to/mobi-pc-server
PC_SERVER_DESKTOP_TARGET_PLATFORM=darwin \
PC_SERVER_DESKTOP_TARGET_ARCH=arm64 \
./scripts/build-backend.sh
```

成功后应该出现：

```text
backend/dist/pc-server-backend
desktop/resources-mac-arm64/backend/pc-server-backend
```

生成 Intel 后端：

```bash
cd /path/to/mobi-pc-server
PC_SERVER_DESKTOP_TARGET_PLATFORM=darwin \
PC_SERVER_DESKTOP_TARGET_ARCH=x64 \
./scripts/build-backend.sh
```

成功后应该出现：

```text
desktop/resources-mac-x64/backend/pc-server-backend
```

注意：`PC_SERVER_DESKTOP_TARGET_ARCH` 只决定复制到哪个资源目录。PyInstaller 产物仍取决于当前 Python 解释器和运行环境。如果在 Apple Silicon 上生成 Intel 后端，需要使用 x64 Python/Rosetta 环境，或在 Intel Mac 上构建。

正式执行 `npm run dist:mac:*` 前必须先生成对应架构的后端可执行文件；缺少 `pc-server-backend` 时资源准备脚本会中止。

## 3. 准备 llama.cpp

macOS 不使用 CUDA。推荐先构建 Metal 版，并放入 `llama-cpp/cpu/` 目录。后端仍通过现有 CPU 入口发现它。
构建脚本按 llama.cpp server README 的方式执行 `cmake --build ... --target llama-server`，只生成 `llama-server` 目标，并把同目录运行时动态库一起复制到资源目录。

Apple Silicon：

```bash
cd /path/to/mobi-pc-server
LLAMA_CPP_BUILD_MODE=metal \
PC_SERVER_DESKTOP_TARGET_ARCH=arm64 \
LLAMA_CPP_INSTALL_DIR="$PWD/desktop/resources-mac-arm64/llama-cpp/cpu" \
./scripts/build-llama-cpp.sh
```

Intel：

```bash
cd /path/to/mobi-pc-server
LLAMA_CPP_BUILD_MODE=metal \
PC_SERVER_DESKTOP_TARGET_ARCH=x64 \
LLAMA_CPP_INSTALL_DIR="$PWD/desktop/resources-mac-x64/llama-cpp/cpu" \
./scripts/build-llama-cpp.sh
```

如果目标机器不支持 Metal，改用 CPU 构建：

```bash
LLAMA_CPP_BUILD_MODE=cpu \
LLAMA_CPP_INSTALL_DIR="$PWD/desktop/resources-mac-arm64/llama-cpp/cpu" \
./scripts/build-llama-cpp.sh
```

## 4. 准备 MobiInfer

macOS 包如果需要内置 MobiInfer，把目标架构的 `mnncli` 放到：

```text
desktop/resources-mac-arm64/mobiinfer/mnncli
desktop/resources-mac-x64/mobiinfer/mnncli
```

可以先尝试现有脚本：

```bash
./scripts/build-mobiinfer.sh
```

如果构建成功，把产物复制到对应资源目录：

```bash
mkdir -p desktop/resources-mac-arm64/mobiinfer
cp 3rdparty/mobiinfer/apps/mnncli/build_mnncli/mnncli \
  desktop/resources-mac-arm64/mobiinfer/mnncli
chmod +x desktop/resources-mac-arm64/mobiinfer/mnncli
```

注意：当前 MobiInfer 脚本包含部分 Linux/x86 取向的 CMake 参数。Apple Silicon 构建如遇到 AVX512 或 OpenCV 相关错误，需要按 MobiInfer 上游 CMake 选项调整后再复制产物。

## 5. 准备 hdc

如果 `hdc` 已经在 `PATH` 中，资源准备脚本会尝试复制它。也可以手动放到：

```text
desktop/resources-mac-arm64/hdc/hdc
desktop/resources-mac-x64/hdc/hdc
```

检查：

```bash
hdc version
```

如果不内置 `hdc`，应用仍会尝试使用目标机器 `PATH` 中的 `hdc`。

## 6. 生成 macOS 包

Apple Silicon：

```bash
cd /path/to/mobi-pc-server/desktop
npm run dist:mac:arm64
```

Intel：

```bash
cd /path/to/mobi-pc-server/desktop
npm run dist:mac:x64
```

产物在：

```text
desktop/release/
```

常见文件名：

```text
DataHome-0.2.0-mac-arm64.dmg
DataHome-0.2.0-mac-arm64.zip
DataHome-0.2.0-mac-x64.dmg
DataHome-0.2.0-mac-x64.zip
```

## 7. 验证

解包后检查 `.app` 内容：

```bash
APP="desktop/release/mac-arm64/DataHome.app"
test -f "$APP/Contents/Resources/backend/pc-server-backend"
test -f "$APP/Contents/Resources/frontend/index.html"
test -f "$APP/Contents/Resources/configs/models.json"
test -d "$APP/Contents/Resources/llama-cpp"
```

启动应用后，确认：

- 窗口能打开。
- 后端健康检查可用：`/api/health` 返回成功。
- 推理服务页能识别已打包的 llama.cpp 或 MobiInfer 二进制。
- 设备页能识别内置或系统 `PATH` 中的 `hdc`。

## 签名和公证

当前 `desktop/electron-builder.yml` 使用：

```yaml
mac:
  identity: null
```

这表示本地打包时跳过签名，适合开发和内部验证。正式对外分发需要：

- Apple Developer ID Application 证书。
- Hardened Runtime。
- entitlements 配置。
- Apple notarization。

未公证的包在其他机器上可能被 Gatekeeper 阻止打开。

## 常见问题

### 在 Apple Silicon 上打 Intel 包能不能直接可用

Electron 壳可以通过 `electron-builder --mac --x64` 获取 x64 Electron 运行时，但后端和原生推理二进制仍需要 x64 产物。建议在 Intel Mac 或 Rosetta x64 工具链中构建这些二进制。

### 缺少 CMake

如果看到：

```text
cmake was not found on PATH.
```

安装 CMake：

```bash
brew install cmake ninja
```

### 应用启动后后端不可用

优先检查：

```text
Contents/Resources/backend/pc-server-backend
```

如果文件不存在，先重新运行对应架构的后端构建命令。
