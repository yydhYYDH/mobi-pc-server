# MobiInfer Integration

MobiInfer is currently integrated as an MNN-compatible fork under `3rdparty/mobiinfer`.

The repository currently pins the submodule to:

```text
798dbf4deddbb592bdf3ba07938fb31406d1578e
```

At this stage the backend assumes:

- the repository layout stays compatible with MNN's `apps/mnncli` layout
- the runtime entrypoint is still `mnncli serve`
- model config shape remains compatible with the existing MNN catalog entries

## Submodule Setup

To initialize or reset the local MobiInfer checkout:

```bash
git submodule update --init 3rdparty/mobiinfer
git -C 3rdparty/mobiinfer fetch --depth 1 origin 798dbf4deddbb592bdf3ba07938fb31406d1578e
git -C 3rdparty/mobiinfer checkout --detach 798dbf4deddbb592bdf3ba07938fb31406d1578e
```

If you want all inference runtimes locally in one step:

```bash
git submodule update --init 3rdparty/mobiinfer 3rdparty/llama.cpp
```

## Backend API

The backend now exposes MobiInfer as a first-class runtime:

```text
GET  /api/mobiinfer/status
POST /api/mobiinfer/start
POST /api/mobiinfer/stop
POST /api/mobiinfer/load-model
```

The legacy upstream MNN runtime API is no longer exposed by the backend.

## Binary Discovery

The backend checks these paths in order:

```text
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

If the fork keeps MNN's upstream build entrypoint, you can use:

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

Existing `runtime: "mnn"` entries are treated as MNN-compatible model configs and are loaded through the MobiInfer backend.
