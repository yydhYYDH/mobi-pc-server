# Linux 打包说明

本文档说明如何在 Linux 或 WSL 环境里打包你的智伴的 Linux 版本。

## 产物结构

Linux 包使用 Electron Builder，运行时资源来自：

```text
desktop/resources-linux/
  frontend/               由 frontend/dist 自动复制
  backend/
    pc-server-backend     Linux 后端可执行文件
  mobiinfer/
    mnncli                Linux 版 MobiInfer 命令行/服务程序
    *.so                  其他 MobiInfer 运行所需动态库
  llama-cpp/
    cpu/
      llama-server        Linux CPU 版 llama.cpp OpenAI 兼容服务
    cuda/
      llama-server        Linux CUDA 版 llama.cpp OpenAI 兼容服务
  hdc/
    hdc                   Linux 版 hdc
```

Electron Builder 会把这些资源复制到最终应用的 `resources/` 目录。

运行期下载的模型、用户配置、日志和 ModelScope 缓存不会写入安装目录或 AppImage 挂载目录。打包版会使用 `$XDG_CONFIG_HOME/ClawMate` 或 `~/.config/ClawMate`，覆盖安装或更新应用时应保留这些数据。详见 [desktop-data.md](desktop-data.md)。

## 前置要求

建议安装：

- Node.js 20 或更新版本。
- Python 3.10 或更新版本。
- CMake。
- Ninja 或 Make。
- Git。

检查命令：

```bash
node --version
npm --version
python3 --version
cmake --version
git --version
```

如果在 WSL 里运行 Electron 开发窗口，系统还需要可用的图形环境和中文字体。DBus 相关日志在 WSL 里较常见，不一定代表应用启动失败。

## 1. 安装依赖

```bash
cd /mnt/e/WAIC/pc_server

cd frontend
npm install

cd ../desktop
npm install
```

后端虚拟环境：

```bash
cd ../backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
pip install -e .
pip install pyinstaller
```

## 2. 生成 Linux 后端可执行文件

在项目根目录执行：

```bash
cd /mnt/e/WAIC/pc_server
./scripts/build-backend.sh
```

成功后应该出现：

```text
backend/dist/pc-server-backend
desktop/resources-linux/backend/pc-server-backend
```

如果要指定 Python：

```bash
PC_SERVER_PYTHON=/absolute/path/to/python ./scripts/build-backend.sh
```

如果在 macOS 上生成 Linux x64 安装包，需要先在 Linux 环境里生成后端可执行文件，
或者用 Docker 生成 Linux ELF 版本：

```bash
docker run --rm --platform linux/amd64 \
  -v "$PWD":/work -w /work python:3.12-bookworm \
  bash -lc 'python -m pip install -U pip && PC_SERVER_PYTHON=python PC_SERVER_DESKTOP_TARGET_PLATFORM=linux PC_SERVER_DESKTOP_TARGET_ARCH=x64 bash scripts/build-backend.sh'
```

打包脚本会校验本地二进制格式。Linux 包只接受 ELF 可执行文件；如果误传 macOS
Mach-O 或 Windows PE 二进制，脚本会跳过或终止，避免产出安装后无法启动后端的包。

## 3. 构建 Linux 版 MobiInfer

Linux 包需要 Linux 版 MobiInfer 二进制。可以使用项目脚本：

```bash
cd /mnt/e/WAIC/pc_server
./scripts/build-mobiinfer.sh
```

默认期望产物类似：

```text
3rdparty/mobiinfer/apps/mnncli/build_mnncli/mnncli
```

把 Linux 运行时文件复制到：

```text
desktop/resources-linux/mobiinfer/
```

至少需要：

```text
desktop/resources-linux/mobiinfer/mnncli
```

如果 MobiInfer 构建输出 `.so` 动态库，也复制到同一目录：

```text
desktop/resources-linux/mobiinfer/*.so
```

注意：Linux 构建出来的 `mnncli` 不能放进 Windows 包。

## 4. 准备 hdc

把 Linux 版 `hdc` 放到：

```text
desktop/resources-linux/hdc/hdc
```

如果 `hdc` 依赖其他 `.so`，也放在同一目录，或者确保目标机器系统路径中能找到。

也可以在打包时通过环境变量指定 Linux 版 `hdc`：

```bash
HDC_BIN_LINUX=/absolute/path/to/linux/hdc npm run dist:linux -- --x64
```

`HDC_BIN_LINUX` 优先于通用的 `HDC_BIN`。在 macOS 上打 Linux 包时，不要传 macOS
版 `hdc`；脚本会识别并跳过不兼容的二进制。未内置 `hdc` 的包仍会在目标 Linux
系统启动后从 `PATH` 查找 `hdc`，目标机未安装时界面会显示 `HDC 未找到`。

## 5. 准备前端资源

通常不需要手动复制，打包命令会自动运行：

```bash
cd desktop
npm run prepare:resources
```

该命令会：

- 执行 `frontend/npm run build`。
- 复制 `frontend/dist` 到 `desktop/resources-linux/frontend`。
- 检查后端可执行文件是否存在。

## 6. 构建 Linux 包

生成 unpacked 目录包：

```bash
cd /mnt/e/WAIC/pc_server/desktop
npm run package
```

产物：

```text
desktop/release/linux-unpacked/
```

生成 AppImage：

```bash
cd /mnt/e/WAIC/pc_server/desktop
npm run dist:linux
```

产物：

```text
desktop/release/
```

## 已验证的基础产物

当前 Linux 目录包验证过：

```text
desktop/release/linux-unpacked/resources/backend/pc-server-backend
desktop/release/linux-unpacked/resources/frontend/index.html
desktop/release/linux-unpacked/resources/frontend/assets/...
```

基础体积参考：

```text
backend executable: about 48 MB
linux unpacked app: about 307 MB
```

体积会随着 MobiInfer、llama.cpp、hdc、CUDA runtime 和模型资源增加。

## 常见问题

### Electron 输出 DBus 错误

在 WSL/Linux 图形环境里可能看到：

```text
Failed to connect to the bus
```

如果窗口能打开、前后端能运行，通常可以忽略。真正需要关注的是 `spawn ... ENOENT`、后端健康检查失败、资源文件缺失等错误。

### 中文显示成方块或乱码

安装中文字体，例如：

```bash
sudo apt-get update
sudo apt-get install -y fonts-noto-cjk
fc-cache -f
```

如果没有 sudo 权限，也可以把已有中文字体放到：

```text
~/.local/share/fonts/
```

然后运行：

```bash
fc-cache -f ~/.local/share/fonts
fc-match sans-serif:lang=zh-cn
```

### `pc-server-backend` 启动慢

PyInstaller `--onefile` 可执行文件首次启动会先解压依赖，启动比普通 Python 进程慢一些。这是正常现象。

### Linux 包能不能给 Windows 用

不能。Linux 包里的后端和推理运行时都是 Linux 二进制。Windows 包必须在 Windows 原生环境构建。
