# MNN Integration

MNN is expected to live at `3rdparty/MNN`.

Preferred setup:

```bash
git submodule add https://github.com/alibaba/MNN.git 3rdparty/MNN
git submodule update --init --recursive
```

Keep upstream source isolated. Project-specific wrappers should live in `backend/app/services/` or `scripts/`.

The backend is designed to launch MNN's existing `mnncli serve` command.

Expected runtime command shape:

```bash
mnncli serve <model-id> --config <models/model-id/config.json> --host 127.0.0.1 --port 8088
```

Set `MNNCLI_BIN=/absolute/path/to/mnncli` if the binary is not in one of the default build locations checked by `backend/app/services/mnn_server.py`.
