# MobiInfer Integration

MobiInfer is integrated as a first-class runtime under `3rdparty/mobiinfer`.

At this stage the backend assumes:

- the repository layout keeps the fork's `apps/mnncli` layout
- the runtime entrypoint is still `mnncli serve`
- catalog entries use `runtime: "mobiinfer"`

## Submodule Setup

To initialize or reset the local MobiInfer checkout, shallow-fetch the latest `origin/main`:

```bash
git submodule update --init --depth 1 3rdparty/mobiinfer
git -C 3rdparty/mobiinfer fetch --depth 1 origin main
git -C 3rdparty/mobiinfer checkout --detach FETCH_HEAD
```

If you want all inference runtimes locally in one step:

```bash
git submodule update --init --depth 1 3rdparty/mobiinfer 3rdparty/llama.cpp
```

## Backend API

The backend now exposes MobiInfer as a first-class runtime:

```text
GET  /api/mobiinfer/status
POST /api/mobiinfer/start
POST /api/mobiinfer/stop
POST /api/mobiinfer/load-model
```

The legacy upstream runtime API is no longer exposed by the backend.

## Binary Discovery

The backend checks these paths in order:

```text
desktop/resources-linux-x64/mobiinfer/mnncli
desktop/resources-linux-arm64/mobiinfer/mnncli
desktop/resources-win-x64/mobiinfer/mnncli.exe
desktop/resources-win-arm64/mobiinfer/mnncli.exe
desktop/resources-mac-arm64/mobiinfer/mnncli
desktop/resources-mac-x64/mobiinfer/mnncli
3rdparty/mobiinfer/apps/mnncli/build_mnncli_linux_x64/mnncli
3rdparty/mobiinfer/apps/mnncli/build_mnncli_linux_arm64/mnncli
3rdparty/mobiinfer/apps/mnncli/build_mnncli_win_x64/mnncli.exe
3rdparty/mobiinfer/apps/mnncli/build_mnncli_win_arm64/mnncli.exe
3rdparty/mobiinfer/apps/mnncli/build_mnncli_darwin_arm64/mnncli
3rdparty/mobiinfer/apps/mnncli/build_mnncli_darwin_x64/mnncli
3rdparty/mobiinfer/apps/mnncli/build_mnncli/mnncli
3rdparty/mobiinfer/apps/mnncli/build_mnncli/mnncli.exe
3rdparty/mobiinfer/apps/mnncli/build/mnncli
3rdparty/mobiinfer/apps/mnncli/build/mnncli.exe
3rdparty/mobiinfer/build/apps/mnncli/mnncli
3rdparty/mobiinfer/build/apps/mnncli/mnncli.exe
desktop/resources-linux/mobiinfer/mnncli
desktop/resources-win/mobiinfer/mnncli.exe
```

If your local build output is elsewhere, set:

```bash
MOBIINFER_BIN=/absolute/path/to/mnncli
```

## Build Helper

If the fork keeps the upstream build entrypoint, you can use:

```bash
./scripts/build-mobiinfer.sh
```

This simply delegates to:

```text
3rdparty/mobiinfer/apps/mnncli/build.sh
```

## Model Runtime Tag

To run a catalog model with MobiInfer from the UI, set its runtime in `configs/models.json` to either:

```json
{
  "runtime": "mobiinfer"
}
```

Use `runtime: "mobiinfer"` for models that should be loaded by MobiInfer.
