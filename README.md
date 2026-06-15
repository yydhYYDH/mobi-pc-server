# PC MNN Server

PC 侧控制台应用，用于启动和管理本地 MNN server、从 ModelScope 下载模型，并通过 `hdc` 连接 HarmonyOS 设备。

英文版 README 保留在 [README.en.md](README.en.md)。

## 技术栈

- 前端：React + Vite + TypeScript
- 后端：FastAPI
- 桌面壳：Electron
- 原生运行时：`3rdparty/MNN` 下的 MNN，`3rdparty/mobiinfer` 下的 MobiInfer，`3rdparty/llama.cpp` 下的 llama.cpp
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
3rdparty/MNN     作为 Git submodule 引入的 MNN 上游源码
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
- Linux/WSL：[docs/packaging-linux.md](docs/packaging-linux.md)

## MNN

MNN 作为 submodule 固定在项目记录的上游基线 commit：

```text
2106d00b967c95d35661623c52e26cab238812cf
```

不要用 `--depth 1` 只拉远端默认分支最新提交；远端更新后可能拿不到这个历史 commit。初始化或重置 MNN 时，显式 shallow fetch 这个 commit：

```bash
git submodule update --init 3rdparty/MNN
git -C 3rdparty/MNN fetch --depth 1 origin 2106d00b967c95d35661623c52e26cab238812cf
git -C 3rdparty/MNN checkout --detach 2106d00b967c95d35661623c52e26cab238812cf
```

MNN 的构建步骤和本地二进制配置应记录在 [docs/mnn.md](docs/mnn.md)。

MNN 本地补丁存放在 `patches/MNN/`，用于记录本项目需要但不直接提交到上游源码的改动。初始化或重置 MNN submodule 后，按顺序应用：

```bash
git -C 3rdparty/MNN apply --check ../../patches/MNN/0001-enable-cuda-backend-for-mnncli-serve.patch
git -C 3rdparty/MNN apply ../../patches/MNN/0001-enable-cuda-backend-for-mnncli-serve.patch
git -C 3rdparty/MNN apply --check ../../patches/MNN/0002-link-cuda-backend-for-llm-bench.patch
git -C 3rdparty/MNN apply ../../patches/MNN/0002-link-cuda-backend-for-llm-bench.patch
```


submodule 准备好后，可以尝试：

```bash
./scripts/build-mnncli.sh
```

该脚本会执行 MNN `apps/mnncli/build.sh` 的两阶段流程：先构建 MNN 静态库，再构建 `mnncli`。默认期望的二进制路径是：

```text
3rdparty/MNN/apps/mnncli/build_mnncli/mnncli
```

如果二进制在其他位置，启动后端前设置：

```bash
MNNCLI_BIN=/absolute/path/to/mnncli
```

## MobiInfer

MobiInfer 目前按 MNN-compatible fork 接入，保留独立后端选择，不影响现有 MNN 流程。

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

更多集成说明见 [docs/mobiinfer.md](docs/mobiinfer.md)。

## llama.cpp

llama.cpp 作为 submodule 固定在项目记录的 commit：

```text
ac4cddeb0dbd778f650bf568f6f08344a06abe3a
```

初始化或重置 llama.cpp 时，显式 shallow fetch 这个 commit：

```bash
git submodule update --init 3rdparty/llama.cpp
git -C 3rdparty/llama.cpp fetch --depth 1 origin ac4cddeb0dbd778f650bf568f6f08344a06abe3a
git -C 3rdparty/llama.cpp checkout --detach ac4cddeb0dbd778f650bf568f6f08344a06abe3a
```

前端默认选择 MNN，可在推理服务页或页面顶部切换到 MobiInfer 或 llama.cpp。后端默认查找：

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

模型选项定义在 `configs/models.json`。下载后的模型文件放在 `models/<model-id>/`，不提交到 Git。

## HarmonyOS 设备

安装 `hdc` 并确保它在 `PATH` 中，然后通过后端 API 或前端设备面板查看已连接设备。
