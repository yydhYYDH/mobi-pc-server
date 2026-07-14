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
3rdparty/mobiinfer  Normal directory for MobiInfer source or prebuilt runtime files
3rdparty/llama.cpp  Normal directory for llama.cpp source or prebuilt runtime files
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

Packaging with HarmonyOS device support requires `hdc`. You can obtain it in either of these ways:

1. Install [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/) and use its SDK Manager to install the matching HarmonyOS SDK and device tools.
2. Download **Command Line Tools** from Huawei's official [DevEco Studio Resources and Development Tools](https://developer.huawei.com/consumer/cn/deveco-studio/resources/) page, then extract `hdc` from the archive.

Add the directory containing `hdc` to your system `PATH`, or explicitly provide its path before packaging.

Run the release script:

```bash
scripts/release.sh
```

On Windows:

```powershell
scripts/windows/release.ps1
```

For more detailed packaging information, see:

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

`3rdparty/mobiinfer` is a normal directory, not a Git submodule. Place the
MobiInfer source tree or a prebuilt `mnncli` binary there.

If the source tree is present, try:

```bash
./scripts/build-mobiinfer.sh
```

The backend checks these build outputs by default:

```text
3rdparty/mobiinfer/apps/mnncli/build_mnncli/mnncli
3rdparty/mobiinfer/apps/mnncli/build/mnncli
3rdparty/mobiinfer/build/apps/mnncli/mnncli
```

If the binary is built elsewhere, set `MOBIINFER_BIN=./path/to/mnncli` before starting the backend.

See [docs/mobiinfer.md](docs/mobiinfer.md) for integration details.

## llama.cpp

`3rdparty/llama.cpp` is a normal directory, not a Git submodule. Place the
llama.cpp source tree or a prebuilt `llama-server` binary there.

The frontend defaults to the generic llama.cpp fallback backend. The header and runtime service page can switch between llama.cpp CUDA, llama.cpp CPU, and MobiInfer; CUDA/CPU options are shown only when the backend detects the corresponding binaries.

## Models

Model options are defined in `configs/models.json`. Downloaded model files go under `models/<model-id>/` and are not committed.

## HarmonyOS Devices

Install `hdc`, ensure it is available on `PATH`, then use the backend API or frontend device panel to inspect connected devices.
