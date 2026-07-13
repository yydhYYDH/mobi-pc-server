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

See the dedicated packaging docs:

- Windows: `docs/packaging-windows.md`
- Linux/WSL: `docs/packaging-linux.md`

## Runtime Backends

The current selectable runtime backends are:

- llama.cpp CUDA
- llama.cpp CPU
- MobiInfer

MNN is no longer exposed as a standalone selectable backend. Catalog entries with `runtime: "mnn"` still mean an MNN-compatible model format; those models are loaded through the MobiInfer backend. Historical MNN build and patch notes remain in `docs/mnn.md` as archive and experiment references.

## MobiInfer

MobiInfer is integrated as an MNN-compatible fork for loading MNN-compatible model configs.

The repository currently pins the `3rdparty/mobiinfer` submodule to:

```text
798dbf4deddbb592bdf3ba07938fb31406d1578e
```

To initialize or reset the submodule:

```bash
git submodule update --init 3rdparty/mobiinfer
git -C 3rdparty/mobiinfer fetch --depth 1 origin 798dbf4deddbb592bdf3ba07938fb31406d1578e
git -C 3rdparty/mobiinfer checkout --detach 798dbf4deddbb592bdf3ba07938fb31406d1578e
```

To initialize all third-party runtimes in one step:

```bash
git submodule update --init 3rdparty/mobiinfer 3rdparty/llama.cpp
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
