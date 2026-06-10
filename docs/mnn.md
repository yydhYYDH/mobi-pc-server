# MNN Integration

MNN is expected to live at `3rdparty/MNN`.

Preferred setup:

```bash
git submodule add https://github.com/alibaba/MNN.git 3rdparty/MNN
git submodule update --init --recursive
```

Keep upstream source isolated. Project-specific wrappers should live in `backend/app/services/` or `scripts/`.

The backend is designed to launch MNN's existing `mnncli serve` command.

Build the runtime with:

```bash
./scripts/build-mnncli.sh
```

The script delegates to MNN's upstream `apps/mnncli/build.sh`, which performs the required two-stage build:

1. Build the static MNN library in `3rdparty/MNN/build_mnn_static`.
2. Build `mnncli` in `3rdparty/MNN/apps/mnncli/build_mnncli`.

The backend checks `3rdparty/MNN/apps/mnncli/build_mnncli/mnncli` by default. If you build the binary somewhere else, set `MNNCLI_BIN`.

Expected runtime command shape:

```bash
mnncli serve <model-id> --config <models/model-id/config.json> --host 127.0.0.1 --port 8088
```

Set `MNNCLI_BIN=/absolute/path/to/mnncli` if the binary is not in one of the default build locations checked by `backend/app/services/mnn_server.py`.
