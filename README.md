# 你的智伴

PC 侧控制台应用，用于启动和管理本地推理服务、从 ModelScope 下载模型，并通过 `hdc` 连接 HarmonyOS 设备。

英文版 README 保留在 [README.en.md](README.en.md)。

## 技术栈

- 前端：React + Vite + TypeScript
- 后端：FastAPI
- 桌面壳：Electron
- 原生运行时：`3rdparty/mobiinfer` 下的 MobiInfer，`3rdparty/llama.cpp` 下的 llama.cpp
- 模型来源：ModelScope
- 设备桥接：HarmonyOS `hdc`

## 目录结构

```text
frontend/        浏览器控制台页面
backend/         本地 API 服务和进程封装
desktop/         Electron 桌面启动壳
configs/         模型目录和静态配置
models/          下载后的模型文件，不提交到 Git
logs/            运行日志，不提交到 Git
3rdparty/mobiinfer  作为 Git submodule 引入的 mobiinfer 上游源码
3rdparty/llama.cpp 作为 Git submodule 引入的 llama.cpp 上游源码
docs/            项目文档
scripts/         开发脚本
```

## 开发运行

需要 Node.js 20 或更新版本：

```bash
nvm install 20
nvm use 20
```

启动后端：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

启动前端：

```bash
cd frontend
npm install
npm run dev
```

前端默认访问后端地址：

```text
http://127.0.0.1:8000
```

启动桌面开发版：

```bash
cd desktop
npm install
npm run dev
```

开发模式下，Electron 会启动 Vite 前端和 FastAPI 后端，等待
`http://127.0.0.1:5173` 与 `http://127.0.0.1:8000/api/health` 可用后打开桌面窗口。

如果后端已经单独启动，不希望 Electron 再启动后端：

```bash
PC_SERVER_SKIP_BACKEND=1 npm run dev
```

如果前端已经单独启动，不希望 Electron 再启动前端：

```bash
PC_SERVER_SKIP_FRONTEND=1 npm run dev
```

桌面开发常用环境变量：

```text
PC_SERVER_BACKEND_HOST=127.0.0.1
PC_SERVER_BACKEND_PORT=8000
PC_SERVER_FRONTEND_URL=http://127.0.0.1:5173
PC_SERVER_SKIP_BACKEND=1
PC_SERVER_SKIP_FRONTEND=1
```

## 打包

详细打包说明见：

- Windows：[docs/packaging-windows.md](docs/packaging-windows.md)
- macOS：[docs/packaging-macos.md](docs/packaging-macos.md)
- Linux/WSL：[docs/packaging-linux.md](docs/packaging-linux.md)

## 运行时后端

当前产品可选后端为：

- llama.cpp CUDA
- llama.cpp CPU
- MobiInfer

MNN 不再作为独立可选后端暴露。`runtime: "mnn"` 的模型配置仍表示 MNN-compatible 模型格式，这类模型由 MobiInfer 后端加载。历史 MNN 构建和补丁说明保留在 [docs/mnn.md](docs/mnn.md)，仅作为归档和实验参考。

## MobiInfer

MobiInfer 目前按 MNN-compatible fork 接入，用于加载 MNN-compatible 模型配置。

MobiInfer 作为 submodule 固定在当前仓库记录的 commit：

```text
798dbf4deddbb592bdf3ba07938fb31406d1578e
```

初始化或重置 MobiInfer 时，先拉 submodule，再显式 checkout 到这个 commit：

```bash
git submodule update --init 3rdparty/mobiinfer
git -C 3rdparty/mobiinfer fetch --depth 1 origin 798dbf4deddbb592bdf3ba07938fb31406d1578e
git -C 3rdparty/mobiinfer checkout --detach 798dbf4deddbb592bdf3ba07938fb31406d1578e
```

如果你是第一次完整初始化第三方依赖，也可以一次性执行：

```bash
git submodule update --init 3rdparty/mobiinfer 3rdparty/llama.cpp
```

后端默认查找：

```text
3rdparty/mobiinfer/apps/mnncli/build_mnncli/mnncli
3rdparty/mobiinfer/apps/mnncli/build/mnncli
3rdparty/mobiinfer/build/apps/mnncli/mnncli
```

如果二进制在其他位置，启动后端前设置：

```bash
MOBIINFER_BIN=/absolute/path/to/mnncli
```

submodule 准备好后，可以尝试：

```bash
./scripts/build-mobiinfer.sh
```

该脚本会执行 `3rdparty/mobiinfer/apps/mnncli/build.sh` 的两阶段流程：先构建 MobiInfer 静态库，再构建 `mnncli`。默认期望的二进制路径是：

```text
3rdparty/mobiinfer/apps/mnncli/build_mnncli/mnncli
```

更多集成说明见 [docs/mobiinfer.md](docs/mobiinfer.md)。

## llama.cpp

llama.cpp 作为 submodule 固定在项目记录的 commit：

```text
6eab47181cbd3532c88a105682b81b4729ab809b
```

初始化或重置 llama.cpp 时，显式 shallow fetch 这个 commit：

```bash
git submodule update --init 3rdparty/llama.cpp
git -C 3rdparty/llama.cpp fetch --depth 1 origin 6eab47181cbd3532c88a105682b81b4729ab809b
git -C 3rdparty/llama.cpp checkout --detach 6eab47181cbd3532c88a105682b81b4729ab809b
```

前端默认使用 llama.cpp 兜底后端。页面顶部和推理服务页可在 llama.cpp CUDA、llama.cpp CPU、MobiInfer 之间切换；CUDA/CPU 选项会按后端探测到的二进制动态显示。后端默认查找：

```text
3rdparty/llama.cpp/build/bin/llama-server
3rdparty/llama.cpp/build/bin/server
```

如果二进制在其他位置，启动后端前设置：

```bash
LLAMA_SERVER_BIN=/absolute/path/to/llama-server
```

CUDA 构建、模型下载和测试步骤见 [docs/llama-cpp.md](docs/llama-cpp.md)。

默认 CUDA 构建可直接执行：

```bash
./scripts/build-llama-cpp.sh
```

默认产物路径是：

```text
3rdparty/llama.cpp/build-cuda-native/bin/llama-server
```

## 模型

模型选项定义在 `configs/models.json`。开发模式下下载后的模型文件放在 `models/<model-id>/`，不提交到 Git。

桌面发布包会把模型、用户配置、日志和 ModelScope 缓存放到系统用户数据目录，避免覆盖安装或更新应用时被删除。详见 [docs/desktop-data.md](docs/desktop-data.md)。

## HarmonyOS 设备

安装 `hdc` 并确保它在 `PATH` 中，然后通过后端 API 或前端设备面板查看已连接设备。
