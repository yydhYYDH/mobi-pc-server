<p align="center">
  <img src="assets/icon-128.jpg" width="128" alt="Logo">
</p>

<p align="center">
  Your intelligent companion: autonomous perception, decision-making, and proactive services for an always-on digital twin.
</p>

<p align="center">
  <a href="README.en.md">English</a> | <a href="README.md">Chinese</a>
</p>

-----

## About

ClawMate is an on-device agent application for HarmonyOS NEXT. It supports photo-library analysis, personal profiling, recommendations, and digital-twin capabilities, delivering a complete mobile-agent experience from understanding personal data to performing real actions on a phone.

<p align="center">
  <img src="assets/app.jpg" height="280" alt="App screenshot">
  <img src="assets/mobi-pc-server.png" width="280" alt="Desktop screenshot">
</p>

This repository provides installation packages for the HarmonyOS and desktop applications, as well as the desktop application's source code.

## Installation

### HarmonyOS and Desktop Applications

Download the HarmonyOS and desktop applications from the [Releases page](https://github.com/yydhYYDH/mobi-pc-server/releases).

| Platform | Download |
|--|--|
| HarmonyOS NEXT | ClawMate.hap |
| macOS (Apple Silicon) | ClawMate-desktop-mac-arm64.dmg |
| Windows | ClawMate-desktop-windows-x64.exe |
| Linux | ClawMate-desktop-linux-x64.AppImage |

## Desktop Application Stack

- Frontend: React + Vite + TypeScript
- Backend: FastAPI
- Desktop shell: Electron
- Native runtimes: MobiInfer under `3rdparty/mobiinfer` and llama.cpp under `3rdparty/llama.cpp`
- Model source: ModelScope
- Device bridge: HarmonyOS `hdc`

## Repository Layout

```text
frontend/        Browser control panel
backend/         Local API service and process wrappers
desktop/         Electron desktop shell
configs/         Model catalog and static configuration
models/          Downloaded model files, ignored by Git
logs/            Runtime logs, ignored by Git
3rdparty/mobiinfer  Normal directory for MobiInfer prebuilt runtime files
3rdparty/llama.cpp  Normal directory for llama.cpp prebuilt runtime files
docs/            Project documentation
scripts/         Development scripts
```

## Development

Node.js 20 or later is required.

Start the backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Start the frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend uses this backend address by default:

```text
http://127.0.0.1:8000
```

Start the desktop development build:

```bash
cd desktop
npm install
npm run dev
```

## Packaging

Packaging HarmonyOS device support requires `hdc`. Obtain it by either of the following methods:

1. Install [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/) and use its SDK Manager to install the corresponding HarmonyOS SDK and device tools.
2. Download **Command Line Tools** from Huawei's official [DevEco Studio Resources and Development Tools](https://developer.huawei.com/consumer/cn/deveco-studio/resources/) page, then extract `hdc`.

Add the directory containing `hdc` to your system `PATH`, or explicitly provide its path before packaging.

First, pull the prebuilt llama.cpp and MobiInfer runtimes:

```bash
git lfs pull
```

Try the one-command release scripts:

- Linux/macOS:

  ```bash
  scripts/release.sh
  ```

- Windows:

  ```powershell
  scripts/windows/release.ps1
  ```

For detailed packaging instructions, see:

- Windows: [docs/packaging-windows.md](docs/packaging-windows.md)
- macOS: [docs/packaging-macos.md](docs/packaging-macos.md)
- Linux/WSL: [docs/packaging-linux.md](docs/packaging-linux.md)
