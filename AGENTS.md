# AGENTS.md

## Project Goal

This repository will implement a PC-side control application for running an MNN server, downloading and managing MNN-compatible models from ModelScope, and connecting to HarmonyOS phones through `hdc`.

The first implementation should use:

- Frontend: Web UI built with React, Vite, and TypeScript.
- Backend: Local HTTP/WebSocket service, preferably FastAPI for the first version.
- Native inference dependency: MNN added as `3rdparty/MNN`.
- Model source: ModelScope.
- Device bridge: `hdc` command-line tool.
- Version control: Git.

The initial product shape is a local developer console: start the backend, open the Web UI in a browser, then use the UI to download models, start/stop the MNN server, load models, view logs, and inspect connected HarmonyOS devices.

## Recommended Repository Layout

Use this structure unless the implementation later proves a different layout is clearly better:

```text
pc_server/
  AGENTS.md
  README.md
  .gitignore
  frontend/
    package.json
    vite.config.ts
    src/
  backend/
    pyproject.toml
    app/
      main.py
      api/
      core/
      services/
        mnn_server.py
        modelscope.py
        hdc.py
      schemas/
  configs/
    models.json
  models/
    .gitkeep
  logs/
    .gitkeep
  3rdparty/
    MNN/
  scripts/
  docs/
```

Expected ownership:

- `frontend/`: browser UI only. It should not execute local commands directly.
- `backend/`: local process manager, model manager, MNN integration, and `hdc` integration.
- `configs/models.json`: model catalog shown by the UI.
- `models/`: downloaded model files. Do not commit large model artifacts.
- `logs/`: runtime logs. Do not commit generated logs.
- `3rdparty/MNN`: upstream MNN source or submodule.

## Git Rules

This project must be managed with Git.

Recommended setup:

```bash
git init
git submodule add https://github.com/alibaba/MNN.git 3rdparty/MNN
```

If submodules are inconvenient for local development, a Git subtree is acceptable, but keep MNN isolated under `3rdparty/MNN` and document the update procedure in `docs/mnn.md`.

Do not modify upstream MNN source casually. Prefer one of these approaches:

- Build MNN from `3rdparty/MNN` as-is.
- Add project-specific wrappers in `backend/` or `scripts/`.
- If patches are required, store patch files under `patches/MNN/` and document why each patch exists.

Generated content that should normally be ignored:

- `models/*`
- `logs/*`
- build output from MNN
- Python virtual environments
- Node dependencies
- frontend build output

## Architecture

Use a browser-based frontend with a local backend.

The frontend talks only to the backend through HTTP and WebSocket APIs. The backend owns all local side effects:

- Starting and stopping the MNN server.
- Loading and unloading models.
- Downloading models from ModelScope.
- Reading and writing local config.
- Running `hdc` commands.
- Streaming logs and progress events.

This keeps the frontend simple and prevents shell command construction from leaking into UI code.

## Backend Responsibilities

The backend should expose stable APIs for the frontend.

Suggested API groups:

- `GET /api/health`
- `GET /api/models/catalog`
- `GET /api/models/local`
- `POST /api/models/download`
- `POST /api/models/delete`
- `GET /api/mnn/status`
- `POST /api/mnn/start`
- `POST /api/mnn/stop`
- `POST /api/mnn/load-model`
- `GET /api/devices/hdc`
- `POST /api/devices/hdc/connect`
- `POST /api/devices/hdc/disconnect`
- `WS /api/events`

The backend should keep an internal state model for:

- MNN server status: stopped, starting, running, stopping, error.
- Active model: none, loading, loaded, failed.
- Model download status: not downloaded, downloading, downloaded, failed.
- Device status: no hdc, no device, connected, unauthorized, error.

Use structured response schemas. Do not return raw subprocess output as the only API contract.

## Frontend Responsibilities

The frontend should be a control panel, not a process manager.

Expected first screens:

- Server panel: start/stop MNN server, show port, status, active model, recent errors.
- Model panel: show available ModelScope models, download status, load button, delete local copy.
- Device panel: show `hdc` availability, connected HarmonyOS devices, connect/disconnect actions.
- Logs panel: show backend, MNN, model download, and `hdc` events.

Recommended frontend stack:

- React
- Vite
- TypeScript
- TanStack Query for API state, if the UI becomes non-trivial.
- WebSocket or Server-Sent Events for logs and progress.

Keep UI state derived from backend APIs wherever possible. Avoid inventing a second source of truth in the browser.

## ModelScope Model Management

Maintain a model catalog in `configs/models.json`.

Suggested shape:

```json
[
  {
    "id": "example-model",
    "name": "Example Model",
    "modelscope_id": "namespace/model-name",
    "revision": "master",
    "description": "Short user-facing description",
    "size": "unknown",
    "runtime": "mnn",
    "local_dir": "models/example-model",
    "entry_file": "model.mnn"
  }
]
```

The backend should:

- Read the catalog at startup.
- Download models into `models/<model-id>/`.
- Verify that the expected `entry_file` exists after download.
- Track download progress where possible.
- Avoid re-downloading if a valid local copy already exists.

Do not commit downloaded model files.

## MNN Server Integration

MNN should be added under `3rdparty/MNN`.

The backend should treat MNN as a native runtime dependency. Prefer a small wrapper layer that can:

- Locate the MNN build output.
- Start the MNN server process.
- Pass model path and runtime options.
- Capture stdout/stderr.
- Stop the process cleanly.
- Detect failed startup.

Keep MNN-specific command construction in one backend module, for example `backend/app/services/mnn_server.py`.

The frontend must never assemble MNN command-line arguments.

## HarmonyOS `hdc` Integration

The backend should encapsulate all `hdc` usage in one service module, for example `backend/app/services/hdc.py`.

Minimum supported actions:

- Detect whether `hdc` exists on `PATH` or in a configured tools directory.
- List connected devices.
- Report unauthorized/offline devices.
- Connect to a device by serial or network address.
- Disconnect a device.
- Run safe diagnostic commands.

Do not expose a generic "run arbitrary hdc command" API to the frontend. Add explicit backend methods for each supported action.

All subprocess calls must:

- Use argument arrays instead of shell strings.
- Set timeouts.
- Capture stdout/stderr.
- Return structured errors.

## Security and Process Safety

This is a local tool, but still treat subprocess execution carefully.

Rules:

- Do not pass user-provided strings into a shell.
- Prefer `subprocess.run([...], shell=False)` in Python.
- Validate model IDs against `configs/models.json`.
- Validate paths stay inside the repository's `models/` directory.
- Add timeouts for downloads, MNN startup checks, and `hdc` calls.
- Stream logs through the backend after redacting secrets if any appear.

## Implementation Phases

Phase 1: Repository bootstrap

- Initialize Git.
- Add `.gitignore`.
- Add `README.md`.
- Create `frontend/`, `backend/`, `configs/`, `models/`, `logs/`, `3rdparty/`, and `docs/`.
- Add MNN as `3rdparty/MNN`.

Phase 2: Backend skeleton

- Create FastAPI app.
- Add health endpoint.
- Add model catalog loader.
- Add structured config paths.
- Add WebSocket or SSE event stream.

Phase 3: Model management

- Add ModelScope download service.
- Add local model discovery.
- Add progress reporting.
- Add delete local model action.

Phase 4: MNN server control

- Build or locate MNN server binary.
- Add start/stop/status APIs.
- Add model loading API.
- Capture logs and expose them to the UI.

Phase 5: `hdc` device control

- Add `hdc` detection.
- Add device listing.
- Add connect/disconnect support.
- Surface device status in the UI.

Phase 6: Frontend control panel

- Create Vite React app.
- Add server, model, device, and logs panels.
- Wire API calls and event stream.
- Show clear loading and error states.

Phase 7: Packaging and documentation

- Document local setup.
- Document MNN build steps.
- Document ModelScope credentials or cache behavior if needed.
- Document HarmonyOS `hdc` setup.
- Add smoke tests for backend services.

## Preferred First Technical Choice

Start with Web frontend plus local backend.

Do not start with Electron yet. Electron can wrap the same frontend and backend later after the core MNN, ModelScope, and `hdc` flows are stable.

Recommended first version:

- `frontend/`: React + Vite + TypeScript.
- `backend/`: FastAPI + Python subprocess/service wrappers.
- `3rdparty/MNN`: Git submodule.

This optimizes for fast iteration, simple debugging, and a clean boundary between UI and local system operations.

