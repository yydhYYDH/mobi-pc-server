# macOS Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add macOS Electron release packaging support for separate Intel (`x64`) and Apple Silicon (`arm64`) builds.

**Architecture:** Extend the existing Windows/Linux packaging flow with macOS as a third platform. Keep native resources isolated in `desktop/resources-mac-x64` and `desktop/resources-mac-arm64`, and keep packaged runtime discovery driven by `process.resourcesPath` plus backend environment variables.

**Tech Stack:** Electron Builder, Node.js packaging scripts, TypeScript Electron main process, FastAPI/PyInstaller backend, CMake native runtime scripts, Markdown docs.

---

## File Structure

- Modify `desktop/package.json`: add macOS package scripts.
- Modify `desktop/electron-builder.yml`: add macOS icon, target, artifact naming, and local signing behavior.
- Modify `desktop/scripts/package-desktop.js`: parse macOS platform and architecture arguments and select `resources-mac-<arch>`.
- Modify `desktop/scripts/prepare-resources.js`: support Darwin resource directories and macOS runtime copying/validation.
- Modify `desktop/electron/main.ts`: choose macOS resource directories in dev mode and pass `LLAMA_SERVER_BIN`.
- Modify `scripts/build-backend.sh`: support Linux and macOS resource install directories.
- Modify `scripts/build-llama-cpp.sh`: add macOS Metal/CPU build mode and optional install copy.
- Modify `backend/app/services/llama_cpp_server.py`: add macOS fallback runtime candidates.
- Modify `backend/app/services/mnn_server.py`: add macOS fallback MobiInfer candidates.
- Modify `.gitignore`: ignore `desktop/resources-mac-*`.
- Create `desktop/build/icon.icns` if possible from existing `desktop/build/icon.png`.
- Create `docs/packaging-macos.md`: document setup, build, package, and verification.
- Modify `README.md`: link to the macOS packaging guide.

### Task 1: Add macOS Resource Target Selection

**Files:**
- Modify: `desktop/package.json`
- Modify: `desktop/scripts/package-desktop.js`
- Modify: `desktop/scripts/prepare-resources.js`
- Modify: `.gitignore`

- [ ] **Step 1: Update package scripts**

Add macOS scripts to `desktop/package.json`:

```json
"dist:mac": "node scripts/package-desktop.js --mac",
"dist:mac:x64": "node scripts/package-desktop.js --mac --x64",
"dist:mac:arm64": "node scripts/package-desktop.js --mac --arm64"
```

- [ ] **Step 2: Implement target parsing in `package-desktop.js`**

Add helpers that inspect all CLI args:

```js
const args = process.argv.slice(2);
const target = args[0] || "--dir";

function hasArg(value) {
  return args.includes(value);
}

function hostElectronArch() {
  return process.arch === "x64" ? "x64" : "arm64";
}

function archForTarget() {
  if (hasArg("--x64")) {
    return "x64";
  }
  if (hasArg("--arm64")) {
    return "arm64";
  }
  return hostElectronArch();
}
```

Then map macOS targets:

```js
if (target === "--mac" || target.startsWith("--mac=")) {
  return `resources-mac-${archForTarget()}`;
}
```

Set `PC_SERVER_DESKTOP_TARGET_ARCH` in the environment and pass all args to Electron Builder:

```js
PC_SERVER_DESKTOP_TARGET_ARCH: archForTarget()
...
run(electronBuilderCommand(), args.length > 0 ? args : [target], env);
```

- [ ] **Step 3: Add macOS platform helpers to `prepare-resources.js`**

Use normalized platform and arch helpers:

```js
function normalizedTargetArch() {
  const arch = process.env.PC_SERVER_DESKTOP_TARGET_ARCH || process.arch;
  return arch === "x64" || arch === "arm64" ? arch : "arm64";
}

function defaultResourcesDirectory(platform, arch) {
  if (platform === "win32") {
    return "resources-win";
  }
  if (platform === "darwin") {
    return `resources-mac-${arch}`;
  }
  return "resources-linux";
}
```

Then replace the existing default resource directory expression with:

```js
const targetArch = normalizedTargetArch();
const defaultResourcesDir = defaultResourcesDirectory(targetPlatform, targetArch);
```

- [ ] **Step 4: Keep Windows/Linux cleanup scoped**

Rename Linux cleanup helper to `removeUnixRuntimeFilesForWindows` or keep the function name but call it only for Windows. Add no macOS-specific deletion in this task.

- [ ] **Step 5: Ignore macOS resource staging directories**

Add to `.gitignore`:

```gitignore
desktop/resources-mac-*/
```

- [ ] **Step 6: Verify script syntax**

Run:

```bash
cd desktop
node --check scripts/package-desktop.js
node --check scripts/prepare-resources.js
npm run build
```

Expected: all commands exit 0.

### Task 2: Configure Electron Builder for macOS

**Files:**
- Modify: `desktop/electron-builder.yml`
- Create: `desktop/build/icon.icns`

- [ ] **Step 1: Add macOS Electron Builder config**

Add this section to `desktop/electron-builder.yml`:

```yaml
mac:
  icon: build/icon.icns
  category: public.app-category.developer-tools
  identity: "-"
  target:
    - dmg
    - zip
  artifactName: "DataHome-${version}-${os}-${arch}.${ext}"
```

- [ ] **Step 2: Generate `icon.icns` from the existing PNG on macOS**

Run:

```bash
mkdir -p /tmp/datahome-icon.iconset
sips -z 16 16 desktop/build/icon.png --out /tmp/datahome-icon.iconset/icon_16x16.png
sips -z 32 32 desktop/build/icon.png --out /tmp/datahome-icon.iconset/icon_16x16@2x.png
sips -z 32 32 desktop/build/icon.png --out /tmp/datahome-icon.iconset/icon_32x32.png
sips -z 64 64 desktop/build/icon.png --out /tmp/datahome-icon.iconset/icon_32x32@2x.png
sips -z 128 128 desktop/build/icon.png --out /tmp/datahome-icon.iconset/icon_128x128.png
sips -z 256 256 desktop/build/icon.png --out /tmp/datahome-icon.iconset/icon_128x128@2x.png
sips -z 256 256 desktop/build/icon.png --out /tmp/datahome-icon.iconset/icon_256x256.png
sips -z 512 512 desktop/build/icon.png --out /tmp/datahome-icon.iconset/icon_256x256@2x.png
sips -z 512 512 desktop/build/icon.png --out /tmp/datahome-icon.iconset/icon_512x512.png
sips -z 1024 1024 desktop/build/icon.png --out /tmp/datahome-icon.iconset/icon_512x512@2x.png
iconutil -c icns /tmp/datahome-icon.iconset -o desktop/build/icon.icns
```

- [ ] **Step 3: Verify icon exists**

Run:

```bash
file desktop/build/icon.icns
```

Expected: output identifies an Apple icon image.

### Task 3: Add macOS Runtime Discovery

**Files:**
- Modify: `desktop/electron/main.ts`
- Modify: `backend/app/services/llama_cpp_server.py`
- Modify: `backend/app/services/mnn_server.py`

- [ ] **Step 1: Add Electron dev resource helper**

In `desktop/electron/main.ts`, add:

```ts
function hostResourceDirectory(): string {
  if (process.platform === "win32") {
    return "resources-win";
  }
  if (process.platform === "darwin") {
    return `resources-mac-${process.arch === "x64" ? "x64" : "arm64"}`;
  }
  return "resources-linux";
}
```

Then replace the `process.platform === "win32" ? "resources-win" : "resources-linux"` expression inside `childEnv()` with `hostResourceDirectory()`.

- [ ] **Step 2: Pass `LLAMA_SERVER_BIN` from Electron**

Add this environment variable in `childEnv()`:

```ts
LLAMA_SERVER_BIN: path.join(resourcesPath, "llama-cpp", "cpu", process.platform === "win32" ? "llama-server.exe" : "llama-server"),
```

- [ ] **Step 3: Add macOS llama.cpp fallback paths**

In `backend/app/services/llama_cpp_server.py`, add a `Darwin` branch before the existing Unix fallback:

```python
if platform.system() == "Darwin":
    return [
        ("cpu", RESOURCES_DIR / "llama-cpp/cpu/llama-server"),
        ("cpu", REPO_ROOT / "desktop/resources-mac-arm64/llama-cpp/cpu/llama-server"),
        ("cpu", REPO_ROOT / "desktop/resources-mac-x64/llama-cpp/cpu/llama-server"),
        ("auto", RESOURCES_DIR / "llama-cpp/llama-server"),
        ("auto", RESOURCES_DIR / "mnn/llama-server"),
        ("auto", REPO_ROOT / "desktop/resources-mac-arm64/llama-cpp/llama-server"),
        ("auto", REPO_ROOT / "desktop/resources-mac-x64/llama-cpp/llama-server"),
    ]
```

- [ ] **Step 4: Add macOS MobiInfer fallback paths**

In `backend/app/services/mnn_server.py`, add:

```python
REPO_ROOT / "desktop/resources-mac-arm64/mobiinfer/mnncli",
REPO_ROOT / "desktop/resources-mac-x64/mobiinfer/mnncli",
```

- [ ] **Step 5: Verify TypeScript and Python syntax**

Run:

```bash
cd desktop
npm run build
cd ../backend
python3 -m compileall app
```

Expected: TypeScript build exits 0 and Python compileall exits 0.

### Task 4: Add macOS Build Script Support

**Files:**
- Modify: `scripts/build-backend.sh`
- Modify: `scripts/build-llama-cpp.sh`

- [ ] **Step 1: Extend backend install directory selection**

In `scripts/build-backend.sh`, add platform and arch variables:

```bash
TARGET_PLATFORM="${PC_SERVER_DESKTOP_TARGET_PLATFORM:-$(uname -s)}"
TARGET_ARCH="${PC_SERVER_DESKTOP_TARGET_ARCH:-$(uname -m)}"

case "$TARGET_ARCH" in
  x86_64) TARGET_ARCH="x64" ;;
  arm64|aarch64) TARGET_ARCH="arm64" ;;
esac

case "$TARGET_PLATFORM" in
  Darwin|darwin)
    DESKTOP_BACKEND_DIR="$ROOT_DIR/desktop/resources-mac-$TARGET_ARCH/backend"
    ;;
  Linux|linux)
    DESKTOP_BACKEND_DIR="$ROOT_DIR/desktop/resources-linux/backend"
    ;;
  *)
    DESKTOP_BACKEND_DIR="$ROOT_DIR/desktop/resources-linux/backend"
    ;;
esac
```

- [ ] **Step 2: Add macOS llama.cpp mode**

In `scripts/build-llama-cpp.sh`, use a platform-aware default:

```bash
BUILD_MODE="${LLAMA_CPP_BUILD_MODE:-}"
if [[ -z "$BUILD_MODE" ]]; then
  if [[ "$(uname -s)" == "Darwin" ]]; then
    BUILD_MODE="metal"
  else
    BUILD_MODE="cuda"
  fi
fi
```

Add a `metal` case:

```bash
metal)
  BUILD_DIR="${BUILD_DIR:-$LLAMA_CPP_DIR/build-metal-native}"
  CMAKE_FLAGS=(
    -DGGML_METAL=ON
    -DGGML_NATIVE=ON
    -DLLAMA_BUILD_UI=OFF
    -DCMAKE_BUILD_TYPE="$BUILD_TYPE"
  )
  ;;
```

- [ ] **Step 3: Add optional install copy for llama.cpp**

After output validation, add:

```bash
if [[ -n "${LLAMA_CPP_INSTALL_DIR:-}" ]]; then
  mkdir -p "$LLAMA_CPP_INSTALL_DIR"
  cp "$OUTPUT_BIN" "$LLAMA_CPP_INSTALL_DIR/llama-server"
  chmod +x "$LLAMA_CPP_INSTALL_DIR/llama-server"
  echo "llama.cpp executable copied to $LLAMA_CPP_INSTALL_DIR/llama-server"
fi
```

- [ ] **Step 4: Verify shell syntax**

Run:

```bash
bash -n scripts/build-backend.sh
bash -n scripts/build-llama-cpp.sh
```

Expected: both commands exit 0.

### Task 5: Add macOS Packaging Documentation

**Files:**
- Create: `docs/packaging-macos.md`
- Modify: `README.md`

- [ ] **Step 1: Write macOS guide**

Create `docs/packaging-macos.md` covering:

- required tools: Node.js 20+, Python 3.11/3.12, CMake, Git, Xcode Command Line Tools
- resource directories: `desktop/resources-mac-x64` and `desktop/resources-mac-arm64`
- backend build command examples:

```bash
PC_SERVER_DESKTOP_TARGET_PLATFORM=darwin PC_SERVER_DESKTOP_TARGET_ARCH=arm64 ./scripts/build-backend.sh
PC_SERVER_DESKTOP_TARGET_PLATFORM=darwin PC_SERVER_DESKTOP_TARGET_ARCH=x64 ./scripts/build-backend.sh
```

- llama.cpp Metal build command example:

```bash
LLAMA_CPP_BUILD_MODE=metal LLAMA_CPP_INSTALL_DIR="$PWD/desktop/resources-mac-arm64/llama-cpp/cpu" ./scripts/build-llama-cpp.sh
```

- package commands:

```bash
cd desktop
npm run dist:mac:arm64
npm run dist:mac:x64
```

- signing note: `identity: "-"` is for local ad-hoc signing; official distribution needs Developer ID signing and notarization.

- [ ] **Step 2: Link guide from README**

Add:

```markdown
- macOS：[docs/packaging-macos.md](docs/packaging-macos.md)
```

- [ ] **Step 3: Verify docs references**

Run:

```bash
rg -n "packaging-macos|dist:mac|resources-mac" README.md docs/packaging-macos.md desktop scripts backend/app
```

Expected: output shows the new scripts, docs, and resource references.

### Task 6: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Check worktree**

Run:

```bash
git status --short
```

Expected: only intended macOS packaging files are modified.

- [ ] **Step 2: Run static build checks**

Run:

```bash
cd desktop
npm run build
node --check scripts/package-desktop.js
node --check scripts/prepare-resources.js
cd ..
bash -n scripts/build-backend.sh
bash -n scripts/build-llama-cpp.sh
python3 -m compileall backend/app
```

Expected: all commands exit 0.

- [ ] **Step 3: Run macOS resource preparation smoke test**

Run:

```bash
cd desktop
PC_SERVER_DESKTOP_TARGET_PLATFORM=darwin PC_SERVER_DESKTOP_TARGET_ARCH=arm64 PC_SERVER_DESKTOP_RESOURCES=resources-mac-arm64 npm run prepare:resources
```

Expected: frontend/config/example resources are copied into `desktop/resources-mac-arm64`; missing optional native runtimes are warnings unless required backend policy is tightened.

- [ ] **Step 4: Stage and commit**

Use a conventional commit:

```bash
git add desktop package.json README.md docs scripts backend .gitignore
git commit -m "feat(packaging): 支持Mac双架构打包" \
  -m "- 增加macOS x64与arm64资源目录选择和Electron Builder配置" \
  -m "- 补充Mac运行时查找、后端与llama.cpp构建脚本支持" \
  -m "- 新增macOS打包文档并保留Windows/Linux现有流程"
```

## Self-Review

- Spec coverage: the plan covers separate macOS `x64`/`arm64` packages, resource isolation, Electron Builder config, backend/runtime lookup, build scripts, docs, and verification.
- Placeholder scan: no placeholder tasks are present; commands and expected outcomes are explicit.
- Type consistency: architecture names use Electron Builder `x64`/`arm64`; CMake/native architecture handling is normalized separately in shell scripts.
