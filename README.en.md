# 你的智伴 (ClawMate)

PC-side control application for running local inference services, downloading models from ModelScope, and connecting to HarmonyOS phones through `hdc`.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: FastAPI
- Desktop shell: Electron
- Native runtime: MobiInfer under `3rdparty/mobiinfer`, llama.cpp under `3rdparty/llama.cpp`
- Model source: ModelScope
- Device bridge: HarmonyOS `hdc`

## Repository Layout

```text
frontend/        Browser control panel
backend/         Local API service and process wrappers
desktop/         Electron shell for desktop launch
configs/         Model catalog and static config
models/          Downloaded model files, ignored by Git
logs/            Runtime logs, ignored by Git
3rdparty/mobiinfer  MobiInfer upstream source as a Git submodule
3rdparty/llama.cpp  llama.cpp upstream source as a Git submodule
docs/            Project documentation
scripts/         Developer scripts
```

## Development

Use Node.js 20 or newer:

```bash
nvm install 20
nvm use 20
```

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend expects the backend at `http://127.0.0.1:8000`.

Desktop shell:

```bash
cd desktop
npm install
npm run dev
```

In development, Electron starts both the Vite frontend and the FastAPI backend,
waits for `http://127.0.0.1:5173` and `http://127.0.0.1:8000/api/health`, then
opens the desktop window.

If the backend is already running and should not be started by Electron:

```bash
PC_SERVER_SKIP_BACKEND=1 npm run dev
```

If the frontend is already running and should not be started by Electron:

```bash
PC_SERVER_SKIP_FRONTEND=1 npm run dev
```

Useful desktop environment variables:

```text
PC_SERVER_BACKEND_HOST=127.0.0.1
PC_SERVER_BACKEND_PORT=8000
PC_SERVER_FRONTEND_URL=http://127.0.0.1:5173
PC_SERVER_SKIP_BACKEND=1
PC_SERVER_SKIP_FRONTEND=1
```

## Packaging

Install frontend and desktop dependencies first:

```bash
cd frontend
npm install

cd ../desktop
npm install
```

Native runtime resources are staged by platform and architecture:

```text
desktop/resources-win-x64/
desktop/resources-win-arm64/
desktop/resources-linux-x64/
desktop/resources-linux-arm64/
desktop/resources-mac-x64/
desktop/resources-mac-arm64/
```

Windows x64:

```powershell
cd E:\WAIC\pc_server

.\scripts\windows\build-backend.ps1
.\scripts\windows\build-mobiinfer.ps1 -Architecture x64 -OpenSslRoot "C:\Program Files\OpenSSL-Win64"
.\scripts\windows\build-llama-cpp.ps1 -Mode cpu -Architecture x64

# Optional CUDA runtime
.\scripts\windows\build-llama-cpp.ps1 -Mode cuda -Architecture x64 -CudaArch 89

cd desktop
npm run build-win-x64
```

macOS Apple Silicon:

```bash
cd /path/to/pc_server

PC_SERVER_DESKTOP_TARGET_PLATFORM=darwin PC_SERVER_DESKTOP_TARGET_ARCH=arm64 ./scripts/build-backend.sh
PC_SERVER_DESKTOP_TARGET_ARCH=arm64 ./scripts/build-mobiinfer.sh
LLAMA_CPP_BUILD_MODE=metal PC_SERVER_DESKTOP_TARGET_ARCH=arm64 \
  LLAMA_CPP_INSTALL_DIR="$PWD/desktop/resources-mac-arm64/llama-cpp/cpu" \
  ./scripts/build-llama-cpp.sh

cd desktop
npm run build-mac-arm
```

Linux x64:

```bash
cd /mnt/e/WAIC/pc_server

PC_SERVER_DESKTOP_TARGET_PLATFORM=linux PC_SERVER_DESKTOP_TARGET_ARCH=x64 ./scripts/build-backend.sh
PC_SERVER_DESKTOP_TARGET_ARCH=x64 ./scripts/build-mobiinfer.sh
LLAMA_CPP_BUILD_MODE=cpu PC_SERVER_DESKTOP_TARGET_ARCH=x64 \
  LLAMA_CPP_INSTALL_DIR="$PWD/desktop/resources-linux-x64/llama-cpp/cpu" \
  ./scripts/build-llama-cpp.sh

# Optional CUDA runtime
LLAMA_CPP_BUILD_MODE=cuda PC_SERVER_DESKTOP_TARGET_ARCH=x64 \
  LLAMA_CPP_INSTALL_DIR="$PWD/desktop/resources-linux-x64/llama-cpp/cuda" \
  ./scripts/build-llama-cpp.sh

cd desktop
npm run build-linux-x64
```

For arm64 Windows/Linux or Intel macOS, use the matching `arm64`/`x64` target architecture, resource directory, and npm script such as `build-win-arm`, `build-linux-arm`, or `build-mac-x64`.

See the dedicated packaging docs:

- Windows: `docs/packaging-windows.md`
- macOS: `docs/packaging-macos.md`
- Linux/WSL: `docs/packaging-linux.md`

## Runtime Backends

The current selectable runtime backends are:

- llama.cpp CUDA
- llama.cpp CPU
- MobiInfer

## MobiInfer

MobiInfer is integrated as a first-class runtime for catalog entries with `runtime: "mobiinfer"`.

To initialize or reset the submodule, shallow-fetch the latest `origin/main`:

```bash
git submodule update --init --depth 1 3rdparty/mobiinfer
git -C 3rdparty/mobiinfer fetch --depth 1 origin main
git -C 3rdparty/mobiinfer checkout --detach FETCH_HEAD
```

To initialize all third-party runtimes in one step:

```bash
git submodule update --init --depth 1 3rdparty/mobiinfer 3rdparty/llama.cpp
```

After the submodule is present, try:

```bash
./scripts/build-mobiinfer.sh
```

The backend checks these build outputs by default:

```text
3rdparty/mobiinfer/apps/mnncli/build_mnncli/mnncli
3rdparty/mobiinfer/apps/mnncli/build/mnncli
3rdparty/mobiinfer/build/apps/mnncli/mnncli
```

If the binary is built elsewhere, set `MOBIINFER_BIN=/absolute/path/to/mnncli` before starting the backend.

See [docs/mobiinfer.md](docs/mobiinfer.md) for integration details.

## llama.cpp

llama.cpp is pinned by this repository to:

```text
6eab47181cbd3532c88a105682b81b4729ab809b
```

To initialize or reset the submodule:

```bash
git submodule update --init 3rdparty/llama.cpp
git -C 3rdparty/llama.cpp fetch --depth 1 origin 6eab47181cbd3532c88a105682b81b4729ab809b
git -C 3rdparty/llama.cpp checkout --detach 6eab47181cbd3532c88a105682b81b4729ab809b
```

The frontend defaults to the generic llama.cpp fallback backend. The header and runtime service page can switch between llama.cpp CUDA, llama.cpp CPU, and MobiInfer; CUDA/CPU options are shown only when the backend detects the corresponding binaries.

## Models

Model options are defined in `configs/models.json`. Downloaded model files go under `models/<model-id>/` and are not committed.

## HarmonyOS Devices

Install `hdc`, ensure it is available on `PATH`, then use the backend API or frontend device panel to inspect connected devices.
