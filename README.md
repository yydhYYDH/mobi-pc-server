# PC MNN Server

PC-side control application for running an MNN server, downloading models from ModelScope, and connecting to HarmonyOS phones through `hdc`.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: FastAPI
- Native runtime: MNN under `3rdparty/MNN`
- Model source: ModelScope
- Device bridge: HarmonyOS `hdc`

## Repository Layout

```text
frontend/        Browser control panel
backend/         Local API service and process wrappers
configs/         Model catalog and static config
models/          Downloaded model files, ignored by Git
logs/            Runtime logs, ignored by Git
3rdparty/MNN     MNN upstream source as a Git submodule
docs/            Project documentation
scripts/         Developer scripts
```

## Development

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

## MNN

MNN should be added as:

```bash
git submodule add https://github.com/alibaba/MNN.git 3rdparty/MNN
```

Build instructions and local binary configuration should be documented in `docs/mnn.md`.

After the submodule is present, try:

```bash
./scripts/build-mnncli.sh
```

This runs MNN's two-stage `apps/mnncli/build.sh` flow: first building the static MNN library, then building `mnncli`. The expected binary is:

```text
3rdparty/MNN/apps/mnncli/build_mnncli/mnncli
```

If the binary is built elsewhere, set `MNNCLI_BIN=/absolute/path/to/mnncli` before starting the backend.

## Models

Model options are defined in `configs/models.json`. Downloaded model files go under `models/<model-id>/` and are not committed.

## HarmonyOS Devices

Install `hdc`, ensure it is available on `PATH`, then use the backend API or frontend device panel to inspect connected devices.
