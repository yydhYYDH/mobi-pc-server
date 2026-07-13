# macOS Packaging Support Design

## Context

The project already has an Electron desktop shell, a FastAPI backend bundled with
PyInstaller, and platform-specific runtime resources for Windows and Linux.
macOS packaging is not yet modeled as a first-class target. Current scripts
default non-Windows packaging to Linux resources, which would package the wrong
native binaries on macOS.

The first macOS release support must cover both Intel Macs and Apple Silicon
Macs. The safest first implementation is to produce separate architecture
artifacts instead of a universal app.

## Goals

- Add macOS release package support for `x64` and `arm64`.
- Keep Windows and Linux packaging behavior unchanged.
- Keep platform-native binaries isolated in separate staging directories.
- Package the existing frontend, backend, configs, examples, MobiInfer,
  llama.cpp, and hdc resources for macOS.
- Document how to build and verify macOS packages.

## Non-Goals

- Do not create a universal macOS app in the first implementation.
- Do not solve Apple Developer ID signing and notarization as a required local
  build step.
- Do not bundle model files into the app.
- Do not refactor unrelated runtime management or frontend behavior.

## Selected Approach

Build two independent macOS packages:

- `ClawMate-<version>-mac-x64.dmg`
- `ClawMate-<version>-mac-arm64.dmg`

Each package uses its own native resource staging directory:

```text
desktop/resources-mac-x64/
desktop/resources-mac-arm64/
```

This avoids mixing incompatible native binaries and avoids the complexity of
merging PyInstaller, MobiInfer, llama.cpp, and hdc outputs into universal
binaries.

## Resource Layout

Each macOS resource directory follows the same structure as the existing
Windows and Linux directories:

```text
desktop/resources-mac-<arch>/
  frontend/
  configs/
  example-images/
  backend/
    pc-server-backend
  mnn/
  mobiinfer/
    mnncli
  llama-cpp/
    cpu/
      llama-server
  hdc/
    hdc
```

`llama.cpp` on macOS should start with a CPU or Metal-capable build. CUDA is not
part of the macOS target.

## Build Script Changes

The desktop package script should recognize macOS targets and choose the correct
resource staging directory:

- `--mac --x64` uses `resources-mac-x64`.
- `--mac --arm64` uses `resources-mac-arm64`.
- A plain macOS package command may default to the host architecture.

`prepare-resources.js` should treat macOS as a distinct platform, not as Linux.
It should copy shared frontend/config/example resources and then validate the
macOS backend and native runtime resources for the selected architecture.

The backend build script should be extended or wrapped so macOS builds can copy
`backend/dist/pc-server-backend` into the matching macOS resource directory.

## Electron Builder Changes

`desktop/electron-builder.yml` should add a `mac` section with DMG and optional
ZIP targets. Artifact names must include `${arch}` so Intel and Apple Silicon
outputs are distinguishable.

The app should use `desktop/build/icon.icns` for macOS. This can be generated
from the existing PNG icon if no separate source icon is provided.

Local unsigned or ad-hoc-signed builds are acceptable for development. Official
external distribution should later add hardened runtime, entitlements, signing,
and notarization.

## Runtime Lookup Changes

Electron already passes packaged `process.resourcesPath` to the backend through
environment variables. That path works for packaged macOS apps once the correct
resources are included.

For development and fallback behavior, backend runtime discovery should add
macOS resource candidates for:

- `desktop/resources-mac-arm64/mobiinfer/mnncli`
- `desktop/resources-mac-x64/mobiinfer/mnncli`
- `desktop/resources-mac-arm64/llama-cpp/cpu/llama-server`
- `desktop/resources-mac-x64/llama-cpp/cpu/llama-server`

The Electron dev resource path should also map `process.platform === "darwin"`
to a macOS resource directory instead of `resources-linux`.

## Verification

Minimum verification for each architecture:

1. `npm run build` in `desktop`.
2. `npm run prepare:resources` with the matching macOS resource target.
3. `electron-builder --mac --x64` or `electron-builder --mac --arm64`.
4. Confirm the generated `.app` contains:
   - `Contents/Resources/backend/pc-server-backend`
   - `Contents/Resources/frontend/index.html`
   - `Contents/Resources/configs/models.json`
   - expected native runtime binaries.
5. Launch the app and confirm `/api/health` becomes available.
6. Confirm the runtime panel can detect packaged MobiInfer or llama.cpp when the
   corresponding binaries are present.

Intel package validation should run on an Intel Mac or under a reliable x64
macOS build environment. Apple Silicon package validation should run on an
Apple Silicon Mac.

## Risks

- Cross-architecture native builds are likely to fail unless Python,
  PyInstaller, CMake, and third-party dependencies are prepared for the target
  architecture.
- MobiInfer may need macOS-specific CMake options, especially for flags that are
  Linux or x86-specific.
- Unsigned builds may be blocked by Gatekeeper on other machines.
- A future universal package will require merging every native executable and
  dynamic library, not only Electron itself.

## Implementation Boundary

The first implementation should add macOS packaging support and documentation,
but it does not need to prove both native runtime stacks build successfully on
the current machine. Missing native binaries should remain warnings where the
existing packaging flow already treats them as optional, while the backend
executable remains required for a distributable package.
