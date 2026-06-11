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

## CUDA `llm_bench` Caveat

`3rdparty/MNN/build_mnn_static/llm_bench -a cuda` can silently fall back when the CUDA backend is not registered in the process.

The build may still contain CUDA support:

```bash
rg -n "MNN_CUDA|CUDA_GPU_DETECT_OUTPUT" 3rdparty/MNN/build_mnn_static/CMakeCache.txt
ls 3rdparty/MNN/build_mnn_static/source/backend/cuda/libMNN_Cuda_Main.so
```

But the benchmark binary must also load the CUDA backend library. Check it with:

```bash
ldd 3rdparty/MNN/build_mnn_static/llm_bench | rg "MNN_Cuda|cuda"
readelf -d 3rdparty/MNN/build_mnn_static/llm_bench | rg "NEEDED|RUNPATH"
```

If `libMNN_Cuda_Main.so` is missing from `NEEDED`, CUDA registration will not run. The runtime symptom is:

```text
Don't support 2
Can't Find type=2 backend, use 0 instead
```

`2` is `MNN_FORWARD_CUDA`. Backend type `0` is CPU.

The local diagnosis on 2026-06-11 showed:

- `MNN_CUDA=ON`
- `CUDA_GPU_DETECT_OUTPUT=8.9`
- `source/backend/cuda/libMNN_Cuda_Main.so` exists
- the stock `llm_bench` did not have `libMNN_Cuda_Main.so` in `NEEDED`
- a temporary relink with `libMNN.a` under `--whole-archive` and `libMNN_Cuda_Main.so` under `--no-as-needed` removed the fallback logs

Temporary relink command used for diagnosis:

```bash
cd 3rdparty/MNN/build_mnn_static
/usr/bin/c++ \
  -std=c++17 -D__STRICT_ANSI__ -O3 \
  -fvisibility-inlines-hidden -fvisibility=hidden \
  -fomit-frame-pointer -funwind-tables -fstrict-aliasing \
  -ffunction-sections -fdata-sections -fno-rtti -fno-exceptions \
  CMakeFiles/llm_bench.dir/transformers/llm/engine/tools/llm_bench.cpp.o \
  CMakeFiles/llm_bench.dir/tools/cpp/Profiler.cpp.o \
  -o /tmp/llm_bench_cuda_probe \
  -Wl,-rpath,$PWD/source/backend/cuda:/usr/local/cuda-12.6/lib64 \
  -Wl,--whole-archive libMNN.a -Wl,--no-whole-archive \
  -Wl,--no-as-needed source/backend/cuda/libMNN_Cuda_Main.so -Wl,--as-needed \
  /usr/local/cuda-12.6/lib64/libcudart_static.a \
  /usr/lib/x86_64-linux-gnu/librt.a \
  /usr/local/cuda-12.6/lib64/libcublas.so \
  -pthread -ldl
```

Then verify:

```bash
ldd /tmp/llm_bench_cuda_probe | rg "MNN_Cuda|cuda"
/tmp/llm_bench_cuda_probe \
  -m models/Qwen3.5-0.8B-MNN/config.json \
  -a cuda \
  -p 16 \
  -n 8 \
  -rep 1 \
  -j /tmp/mnn-cuda-probe.json
```

Do not rely on `llm_bench` JSON alone for CUDA detection in this revision: its JSON writer only emits `METAL`, `OPENCL`, or `CPU`, so CUDA can still be serialized as `CPU`. Use the stderr/stdout fallback logs plus ELF `NEEDED` checks.
