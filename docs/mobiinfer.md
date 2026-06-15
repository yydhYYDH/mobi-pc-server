# MobiInfer Integration

MobiInfer is currently integrated as an MNN-compatible fork under `3rdparty/mobiinfer`.

At this stage the backend assumes:

- the repository layout stays compatible with MNN's `apps/mnncli` layout
- the runtime entrypoint is still `mnncli serve`
- model config shape remains compatible with the existing MNN catalog entries

## Backend API

The backend now exposes MobiInfer as a first-class runtime:

```text
GET  /api/mobiinfer/status
POST /api/mobiinfer/start
POST /api/mobiinfer/stop
POST /api/mobiinfer/load-model
```

The legacy `/api/mnn/*` API is still kept as-is.

## Binary Discovery

The backend checks these paths in order:

```text
3rdparty/mobiinfer/apps/mnncli/build_mnncli/mnncli
3rdparty/mobiinfer/apps/mnncli/build_mnncli/mnncli.exe
3rdparty/mobiinfer/apps/mnncli/build/mnncli
3rdparty/mobiinfer/apps/mnncli/build/mnncli.exe
3rdparty/mobiinfer/build/apps/mnncli/mnncli
3rdparty/mobiinfer/build/apps/mnncli/mnncli.exe
desktop/resources/mobiinfer/mnncli
desktop/resources/mobiinfer/mnncli.exe
```

If your local build output is elsewhere, set:

```bash
MOBIINFER_BIN=/absolute/path/to/mnncli
```

## Build Helper

If the fork keeps MNN's upstream build entrypoint, you can use:

```bash
./scripts/build-mobiinfer.sh
```

This simply delegates to:

```text
3rdparty/mobiinfer/apps/mnncli/build.sh
```

## Model Runtime Tag

To run a catalog model with MobiInfer from the UI, set its runtime in `configs/models.json` to:

```json
{
  "runtime": "mobiinfer"
}
```

Existing `runtime: "mnn"` entries are unchanged and will continue to route to the old MNN backend.
