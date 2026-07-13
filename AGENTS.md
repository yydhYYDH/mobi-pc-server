# AGENTS.md

## Project Goal

This repository implements a PC-side control application for running local inference services, downloading and managing models from ModelScope, and connecting to HarmonyOS phones through `hdc`.

Current first-class runtime dependencies:

- Frontend: Web UI built with React, Vite, and TypeScript.
- Backend: Local HTTP service built with FastAPI.
- Desktop shell: Electron.
- Native inference dependencies: MobiInfer under `3rdparty/mobiinfer`, llama.cpp under `3rdparty/llama.cpp`.
- Model source: ModelScope.
- Device bridge: `hdc` command-line tool.
- Version control: Git.

The product shape is a local developer console: start the backend, open the Web UI or Electron shell, then use the UI to download models, start/stop the selected runtime, load models, view logs, and inspect connected HarmonyOS devices.

## Repository Layout

```text
pc_server/
  AGENTS.md
  README.md
  README.en.md
  frontend/
  backend/
    app/
      api/
      core/
      services/
        runtime_server.py
        llama_cpp_server.py
        modelscope.py
        hdc.py
      schemas/
        runtime.py
  desktop/
  configs/
    models.json
  models/
    .gitkeep
  logs/
    .gitkeep
  3rdparty/
    mobiinfer/
    llama.cpp/
  scripts/
  docs/
```

Expected ownership:

- `frontend/`: browser UI only. It should not execute local commands directly.
- `backend/`: local process manager, model manager, MobiInfer/llama.cpp integration, and `hdc` integration.
- `desktop/`: Electron shell and packaging glue.
- `configs/models.json`: model catalog shown by the UI.
- `models/`: downloaded model files. Do not commit large model artifacts.
- `logs/`: runtime logs. Do not commit generated logs.
- `3rdparty/mobiinfer`: upstream MobiInfer source or submodule.
- `3rdparty/llama.cpp`: upstream llama.cpp source or submodule.

## Git Rules

This project must be managed with Git.

MobiInfer should stay isolated under `3rdparty/mobiinfer`:

```bash
git submodule update --init 3rdparty/mobiinfer
```

Do not modify upstream MobiInfer source casually. Prefer one of these approaches:

- Build MobiInfer from `3rdparty/mobiinfer` as-is.
- Add project-specific wrappers in `backend/` or `scripts/`.
- If patches are required, store patch files under `patches/mobiinfer/` and document why each patch exists.

Generated content that should normally be ignored:

- `models/*`
- `logs/*`
- native runtime build output
- Python virtual environments
- Node dependencies
- frontend/desktop build output

Runtime and benchmark command output should be written under `logs/` by default. Keep committed docs focused on commands, environment, summary metrics, and qualitative conclusions; do not commit generated full logs.

## Architecture

Use a browser-based frontend with a local backend.

The frontend talks only to the backend through HTTP APIs. The backend owns all local side effects:

- Starting and stopping local inference runtimes.
- Loading models.
- Downloading models from ModelScope.
- Reading and writing local config.
- Running `hdc` commands.
- Streaming logs and progress events.

This keeps the frontend simple and prevents shell command construction from leaking into UI code.

## Backend Responsibilities

Stable API groups include:

- `GET /api/health`
- `GET /api/models/catalog`
- `GET /api/models/local`
- `POST /api/models/download`
- `POST /api/models/delete`
- `GET /api/mobiinfer/status`
- `POST /api/mobiinfer/start`
- `POST /api/mobiinfer/stop`
- `POST /api/mobiinfer/load-model`
- `GET /api/llama-cpp/status`
- `POST /api/llama-cpp/start`
- `POST /api/llama-cpp/stop`
- `POST /api/llama-cpp/load-model`
- `GET /api/runtime/chat/completions`
- `GET /api/devices/hdc`
- `POST /api/devices/hdc/connect`
- `POST /api/devices/hdc/disconnect`

The backend should keep an internal state model for:

- Runtime status: stopped, starting, running, stopping, error.
- Active model: none, loading, loaded, failed.
- Model download status: not downloaded, downloading, downloaded, failed.
- Device status: no hdc, no device, connected, unauthorized, error.

Use structured response schemas. Do not return raw subprocess output as the only API contract.

## Frontend Responsibilities

The frontend should be a control panel, not a process manager.

Expected screens:

- Server panel: start/stop runtime, show port, status, active model, recent errors.
- Model panel: show available ModelScope models, download status, load button, delete local copy.
- Device panel: show `hdc` availability, connected HarmonyOS devices, connect/disconnect actions.
- Logs panel: show backend, runtime, model download, and `hdc` events.

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
    "runtime": "mobiinfer",
    "local_dir": "models/example-model",
    "entry_file": "config.json"
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

## MobiInfer Integration

MobiInfer lives under `3rdparty/mobiinfer`.

The backend should treat MobiInfer as a native runtime dependency. Keep MobiInfer command construction in `backend/app/services/runtime_server.py`; the frontend must never assemble runtime command-line arguments.

The wrapper layer should:

- Locate the MobiInfer `mnncli` build output.
- Start the MobiInfer server process.
- Pass model path and runtime options.
- Capture stdout/stderr.
- Stop the process cleanly.
- Detect failed startup.

## HarmonyOS `hdc` Integration

The backend should encapsulate all `hdc` usage in `backend/app/services/hdc.py`.

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

Rules:

- Do not pass user-provided strings into a shell.
- Prefer `subprocess.run([...], shell=False)` in Python.
- Validate model IDs against `configs/models.json`.
- Validate paths stay inside the repository's `models/` directory.
- Add timeouts for downloads, runtime startup checks, and `hdc` calls.
- Stream logs through the backend after redacting secrets if any appear.

## Preferred Technical Choice

Keep the Web frontend plus local backend architecture. Do not introduce Electron-only runtime behavior; Electron should wrap the same frontend and backend after core MobiInfer, llama.cpp, ModelScope, and `hdc` flows are stable.
