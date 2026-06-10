# MNN Integration

MNN is expected to live at `3rdparty/MNN`.

Preferred setup:

```bash
git submodule add https://github.com/alibaba/MNN.git 3rdparty/MNN
git submodule update --init --recursive
```

Keep upstream source isolated. Project-specific wrappers should live in `backend/app/services/` or `scripts/`.

The next implementation step is to decide the exact MNN server binary and build flags, then update `backend/app/services/mnn_server.py` to launch that binary with explicit argument arrays.

